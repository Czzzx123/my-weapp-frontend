import { track } from '../../utils/track'

var app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    // 统计数据（保持 2 项，不新增数据来源）
    stats: [
      { key: 'course', value: '--', label: '我的课程', icon: 'video-library' },
      { key: 'points', value: '--', label: '我的积分', icon: 'star' }
    ],
    // 列表菜单：real=有真实去向；即将上线的标 soon
    menuList: [
      { text: '收货地址', icon: 'location', status: 'soon' },
      { text: '投诉建议', icon: 'chat', status: 'soon' },
      { text: '通用设置', icon: 'setting', status: 'soon' },
      { text: '关于我们', icon: 'info-circle', status: 'real' }
    ],
    // 自定义导航尺寸（按状态栏 + 胶囊实测计算，避免写死 44px）
    statusBarHeight: 20,
    navBarHeight: 44
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

  // 加载用户信息：已登录显示真实积分；游客态显示 --
  loadUserInfo() {
    var info = app.globalData.userInfo
    var stats = this.data.stats.map(function (s) {
      if (info && s.key === 'points') {
        s.value = info.score || 0
      } else if (info && s.key === 'course') {
        s.value = info.course || 0
      } else {
        s.value = '--'
      }
      return s
    })
    this.setData({ userInfo: info || null, stats: stats })
  },

  // 点击用户信息区：游客态才去登录（替代空串绑定写法）
  handleUserTap() {
    if (!this.data.userInfo) {
      this.handleLogin()
    }
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
