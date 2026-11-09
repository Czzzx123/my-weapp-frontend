import { track } from '../../utils/track'
import api from '../../config/settings'
import upload from '../../utils/upload'

var app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    // 统计数据（真实数据来自登录返回；未接入的显示 --）
    stats: [
      { key: 'child', value: '--', label: '我的孩子', icon: 'user' },
      { key: 'points', value: '--', label: '我的积分', icon: 'star' }
    ],
    // 列表菜单：real=有真实去向；即将上线的标 soon
    menuList: [
      { text: '修改昵称', icon: 'edit', action: 'nickname' },
      { text: '收货地址', icon: 'location', status: 'soon' },
      { text: '投诉建议', icon: 'chat', status: 'soon' },
      { text: '通用设置', icon: 'setting', status: 'soon' },
      { text: '关于我们', icon: 'info-circle', status: 'real' }
    ],
    // 自定义导航尺寸（按状态栏 + 胶囊实测计算，避免写死 44px）
    statusBarHeight: 20,
    navBarHeight: 44,

    // 资料编辑弹层（复用 profile-guide 组件，mode=edit）
    guideVisible: false,
    guideDefaultName: '家长',
    guideNickname: '',
    guideAvatar: ''
  },

  onLoad() {
    // getWindowInfo 失败时兜底，不写死状态栏高度
    try {
      var sysInfo = wx.getWindowInfo()
      var statusBarHeight = sysInfo.statusBarHeight || 20
      var navBarHeight = 44
      // 用右上角胶囊实测导航栏高度（与微信官方组件对齐）
      var capsule = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()
      if (capsule && capsule.height) {
        navBarHeight = capsule.height + (capsule.top - statusBarHeight) * 2
      }
      this.setData({
        statusBarHeight: statusBarHeight,
        navBarHeight: navBarHeight
      })
    } catch (e) {
      // 使用默认值
    }
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
    track('page_view')   // page_id 自动取 route；is_login 由 track.js 注入
  },

  // 加载用户信息：已登录显示真实数据；游客态显示 --
  loadUserInfo() {
    var info = app.globalData.userInfo || null
    this.setData({ userInfo: info })
    this.refreshStats(info)
  },

  // 统计项跟着 userInfo 一起变，抽出来避免改完资料忘了刷新
  refreshStats(info) {
    var stats = this.data.stats.map(function (s) {
      if (info && s.key === 'child') {
        // 孩子数量是登录接口直接返回的，不用额外请求
        s.value = info.childCount || 0
      } else {
        // 积分要等积分模块接入，先占位
        s.value = '--'
      }
      return s
    })
    this.setData({ stats: stats })
  },

  // 点击用户信息区：游客态才去登录（替代空串绑定写法）
  handleUserTap() {
    if (!this.data.userInfo) {
      this.handleLogin()
    }
  },

  // ---------------- 头像 ----------------
  //
  // open-type="chooseAvatar" 的回调。微信把用户选中的头像放进 e.detail.avatarUrl，
  // 但那是**临时路径**（http://tmp/xxx），小程序重启就失效，不能存库。
  // 必须立刻上传到我们自己的服务器，用返回的永久 URL。
  onChooseAvatar(e) {
    var that = this
    var tempPath = e && e.detail && e.detail.avatarUrl

    if (!tempPath) {
      // 基础库 2.24.4 起，图片未通过微信内容安全检测时不会返回路径
      wx.showToast({ title: '这张图片没有通过审核，请换一张', icon: 'none' })
      return
    }

    track('profile_action', { type: 'choose_avatar' })

    // 先本地预览，让用户立刻看到效果，不用等上传完
    var optimistic = Object.assign({}, this.data.userInfo, { avatar: tempPath })
    this.setData({ userInfo: optimistic })

    upload({
      url: api.update_profile,
      filePath: tempPath,
      name: 'avatar',
      loadingText: '保存头像'
    })
      .then(function (data) {
        that.applyPayload(data)
        wx.showToast({ title: '头像已更新', icon: 'success' })
        track('profile_action', { type: 'avatar_success' })
      })
      .catch(function (err) {
        // 失败要把界面退回真实状态，不能让用户以为换成功了
        that.loadUserInfo()
        wx.showToast({ title: (err && err.msg) || '上传失败，请重试', icon: 'none' })
        track('profile_action', { type: 'avatar_failed', reason: (err && err.type) || 'unknown' })
      })
  },

  // ---------------- 昵称 ----------------
  //
  // 为什么不用 wx.showModal 的 editable 模式：
  // 那是微信的**系统文本输入框**，和 input type="nickname" 完全无关，
  // 永远不会出现「使用微信昵称」的浮层。想拉起微信昵称，
  // 只能用 input type="nickname"，而全项目只有 profile-guide 组件里有。
  // 所以这里改成打开那个组件的编辑模式（mode=edit）。
  editNickname() {
    var info = this.data.userInfo || {}
    if (!info) {
      this.handleLogin()
      return
    }
    track('profile_action', { type: 'open_nickname_editor' })
    this.setData({
      guideVisible: true,
      // 后端算好的兜底名（张小明家长 / 家长），用作 placeholder
      guideDefaultName: info.name || '家长',
      guideNickname: info.nickname || '',
      guideAvatar: info.avatar || ''
    })
  },

  // 编辑弹层关闭：保存成功或点遮罩取消都走这里
  onGuideDone(e) {
    var skipped = !!(e && e.detail && e.detail.skipped)
    this.setData({ guideVisible: false })
    if (skipped) return

    // 保存成功：组件的 saveProfile 已经把最新资料写进 globalData，
    // 这里重新读一次即可，不用再发请求
    this.loadUserInfo()
    wx.showToast({ title: '资料已更新', icon: 'success' })
  },

  // 把接口返回的完整 payload 写回全局 + 本页，改完资料立即生效
  applyPayload(payload) {
    var info = app.applyProfilePayload(payload)
    this.setData({ userInfo: info })
    this.refreshStats(info)
  },

  // 跳转到登录页（带来源参数，登录成功返回本页）
  handleLogin() {
    wx.navigateTo({
      url: '/pages/login/login?from=my'
    })
  },

  // 退出登录（保留二次确认）
  handleLogout() {
    var that = this
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmText: '确认退出',
      confirmColor: '#F5544B',
      cancelText: '取消',
      success: (res) => {
        // 取消/确认两个分支都要上报，取消率才不会缺失
        if (res.confirm) {
          track('logout_confirm', { confirm: true })
          app.logoutUserInfo()
          that.setData({ userInfo: null })
          that.loadUserInfo()
          wx.showToast({ title: '已退出登录', icon: 'none' })
          // 跳转登录页
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/login/login' })
          }, 800)
        } else {
          track('logout_confirm', { confirm: false })
        }
      }
    })
  },

  // 右上角设置按钮
  handleSetting() {
    track('feedback_action', { type: 'menu_modal', page_id: 'my' })
    wx.showModal({
      title: '通用设置',
      content: '设置功能正在筹备中，敬请期待',
      confirmText: '我知道了',
      confirmColor: '#2F6BED',
      showCancel: false
    })
  },

  // 菜单点击：有真实去向的进入，建设中弹统一说明 Modal
  // feedback_action 埋点 type 约定：关于我们='about_modal'，其他菜单='menu_modal'
  handleMenuTap(e) {
    var item = e.currentTarget.dataset.item

    // 「修改昵称」：需要登录态，游客点击先引导登录
    if (item.action === 'nickname') {
      if (!this.data.userInfo) {
        this.handleLogin()
        return
      }
      this.editNickname()
      return
    }

    if (item.status === 'real') {
      // 「关于我们」：纯前端真实闭环
      track('feedback_action', { type: 'about_modal', page_id: 'my' })
      wx.showModal({
        title: '关于我们',
        content: '未蓝科技 · 智慧教育平台\n\n专注 K12 少儿编程与科创教育，让每个孩子都能快乐学习、看见成长。\n\n当前版本：V1.0（演示版）',
        confirmText: '我知道了',
        confirmColor: '#2F6BED',
        showCancel: false
      })
      return
    }
    track('feedback_action', { type: 'menu_modal', page_id: 'my' })
    wx.showModal({
      title: '即将上线',
      content: '「' + item.text + '」功能正在筹备中，敬请期待',
      confirmText: '我知道了',
      confirmColor: '#2F6BED',
      showCancel: false
    })
  }
})
