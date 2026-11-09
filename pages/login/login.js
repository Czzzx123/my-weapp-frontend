import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

var app = getApp()

var PHONE_REG = /^1[3-9]\d{9}$/

// 引导弹层只弹一次的本地标记。
// 不放到数据库：这只是 UI 引导状态，不是业务数据，加字段就要迁移，不值得。
var GUIDE_FLAG = 'profileGuideShown'

// 协议摘要（正式版全文接入后可替换为独立协议页）
var AGREEMENT_TEXT = {
    service: '《用户服务协议》摘要\n\n1. 本平台为 K12 学生家长提供上课日常、学习服务、积分兑换等教育信息服务。\n2. 您应提供真实有效的手机号，用于接收验证码登录及课程通知。\n3. 禁止利用平台从事任何违法违规活动。\n4. 课程安排、课时与积分规则以机构实际公示为准。\n\n正式版上线前将接入完整协议全文。',
    privacy: '《隐私政策》摘要\n\n1. 我们仅收集登录所需的手机号，用于账号验证与课程服务。\n2. 不收集与提供服务无关的个人信息。\n3. 您的信息仅用于教育服务场景，不会向无关第三方提供。\n4. 您有权查询、更正、删除个人信息或注销账号。\n\n正式版上线前将接入完整政策全文。'
}

Page({
  data: {
    phone: '',
    code: '',
    agreed: false,
    canSubmit: false,      // 登录按钮是否可点（手机号合法 + 验证码 + 已同意协议）
    sending: false,        // 验证码发送中
    sendCodeDisabled: false,
    buttonText: '发送验证码',
    loading: false,
    wxLoading: false,      // 微信登录进行中
    countDown: 60,
    phoneError: '',        // 手机号字段级错误（内联红字优先于 Toast）
    from: '',              // 来源页（登录成功后返回）

    // 完善资料引导弹层（登录后弹一次，可跳过）
    guideVisible: false,
    guideDefaultName: '家长',
    guideNickname: '',
    guideAvatar: ''
  },

  // 定时器不放进 data，避免 setData 携带非可序列化对象
  _timer: null,

  onLoad(options) {
    if (options && options.from) {
      this.setData({ from: options.from })
    }
  },

  onShow() {
    track('page_view')   // page_id 自动取当前页 route；3s 去重
  },

  onPhoneInput(e) {
    var phone = e.detail.value
    this.setData({ phone: phone })
    // 输入时实时清除错误；满 11 位时校验一次
    var error = ''
    if (phone.length === 11 && !PHONE_REG.test(phone)) {
      error = '手机号格式不正确'
    }
    this.setData({ phoneError: error })
    this.refreshCanSubmit()
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value })
    this.refreshCanSubmit()
  },

  // 登录按钮状态机
  refreshCanSubmit() {
    var ok = PHONE_REG.test(this.data.phone) &&
             this.data.code.length >= 4 &&
             this.data.agreed &&
             !this.data.loading
    this.setData({ canSubmit: ok })
  },

  // 隐私协议勾选
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed })
    this.refreshCanSubmit()
  },

  // 查看协议
  onViewProtocol(e) {
    var type = e.currentTarget.dataset.type
    var title = type === 'privacy' ? '隐私政策' : '用户服务协议'
    wx.showModal({
      title: title,
      content: AGREEMENT_TEXT[type],
      showCancel: false,
      confirmText: '我已了解',
      confirmColor: '#2F6BED'
    })
  },

  sendCode() {
    var phone = this.data.phone
    if (!PHONE_REG.test(phone)) {
      track('login_block', { reason: 'phone', stage: 'send_code' })
      this.setData({ phoneError: phone ? '手机号格式不正确' : '请输入手机号' })
      return
    }
    this.setData({ phoneError: '', sending: true })

    var that = this
    request({
      url: api.send_sms,
      method: 'POST',
      data: { mobile: phone },
      showLoading: false,
      showError: false
    })
      .then(function () {
        wx.showToast({ title: '验证码已发送', icon: 'none' })
        that.startCountdown(60)
      })
      .catch(function (err) {
        // 业务失败与网络失败都要如实告知，不做「演示模式」降级 ——
        // 否则用户会以为真的收到了验证码
        var msg = (err && err.msg) || '发送失败，请重试'
        wx.showToast({ title: msg, icon: 'none' })
      })
      .finally(function () {
        that.setData({ sending: false })
      })
  },

  // 启动倒计时
  startCountdown(seconds) {
    var total = seconds || 60
    this.setData({ sendCodeDisabled: true, countDown: total, buttonText: total + 's 后重发' })
    var that = this
    this._timer = setInterval(function () {
      var left = that.data.countDown - 1
      if (left <= 0) {
        clearInterval(that._timer)
        that._timer = null
        that.setData({ sendCodeDisabled: false, countDown: 0, buttonText: '重新发送' })
      } else {
        that.setData({ countDown: left, buttonText: left + 's 后重发' })
      }
    }, 1000)
  },

  onUnload() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  // ---------------- 手机号 + 验证码登录 ----------------
  login() {
    var phone = this.data.phone.trim()
    var code = this.data.code.trim()

    if (!this.data.agreed) {
      track('login_submit', {
        agreed: false,
        phone_valid: PHONE_REG.test(phone),
        result: 'blocked',
        reason: 'agreed'
      })
      track('login_block', { reason: 'agreed', stage: 'submit' })
      wx.showToast({ title: '请先勾选并同意协议', icon: 'none' })
      return
    }
    if (!PHONE_REG.test(phone)) {
      track('login_submit', { agreed: true, phone_valid: false, result: 'blocked', reason: 'phone' })
      track('login_block', { reason: 'phone', stage: 'submit' })
      this.setData({ phoneError: '手机号格式不正确' })
      return
    }
    if (!code) {
      track('login_submit', { agreed: true, phone_valid: true, result: 'blocked', reason: 'code_empty' })
      track('login_block', { reason: 'code', stage: 'submit' })
      wx.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    this.refreshCanSubmit()

    var that = this
    request({
      url: api.login,
      method: 'POST',
      data: { mobile: phone, code: code },
      showLoading: false,
      showError: false
    })
      .then((data) => {
        that.doLoginSuccess(data)
      })
      .catch((err) => {
        // 任何失败都如实报错，绝不降级成假登录
        var msg = (err && err.msg) || '登录失败，请重试'
        track('login_submit', {
          agreed: true,
          phone_valid: true,
          result: 'failed',
          reason: (err && err.type) || 'unknown'
        })
        wx.showToast({ title: msg, icon: 'none' })
        that.setData({ loading: false })
        that.refreshCanSubmit()
      })
  },

  // ---------------- 微信一键登录 ----------------
  wxLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选并同意协议', icon: 'none' })
      return
    }

    var that = this
    this.setData({ wxLoading: true })

    wx.login({
      success(res) {
        if (!res.code) {
          wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
          that.setData({ wxLoading: false })
          return
        }

        request({
          url: api.login,
          method: 'POST',
          data: { wx_code: res.code },
          showLoading: false,
          showError: false
        })
          .then((data) => {
            that.doLoginSuccess(data)
          })
          .catch((err) => {
            that.setData({ wxLoading: false })
            // 网络层失败要单独提示：真机调试最常见的失败就是手机连不到后端
            if (err && err.type === 'network') {
              that.showNetworkHelp()
              return
            }
            wx.showToast({ title: (err && err.msg) || '微信登录失败，请重试', icon: 'none' })
          })
      },
      fail(err) {
        that.setData({ wxLoading: false })
        // wx.login 需要向微信服务器换取一次性 code，**依赖网络**。
        // 断网 / 飞行模式 / 微信服务异常都会走到这里。
        // 注意：这一步失败时请求根本没发出去，所以不会走上面的 network 分支。
        console.error('[wx.login] fail:', err)
        that.showWxLoginHelp()
      }
    })
  },

  // wx.login 失败时的指引。
  // 与 showNetworkHelp 的区别：那个是「手机有网但连不到我们后端」，
  // 这个是「连微信服务器都没连上」，排查方向完全不同，不能混用一套文案。
  showWxLoginHelp() {
    wx.showModal({
      title: '微信登录未完成',
      content: '微信登录需要先联网换取登录凭证，这一步没有成功。\n\n' +
               '请检查：\n' +
               '1. 手机是否有网络（飞行模式、断网会导致失败）\n' +
               '2. 微信是否正常，可尝试重启微信\n' +
               '3. 稍等几秒再点一次',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#2F6BED'
    })
  },

  // 真机连不上后端时的排查指引。开发期高频问题，写清楚比让用户猜有用
  showNetworkHelp() {
    wx.showModal({
      title: '连接不到服务器',
      content: '当前接口地址：\n' + api.base +
               '\n\n真机调试请检查：\n' +
               '1. 手机和电脑连同一个 WiFi\n' +
               '2. 电脑防火墙放行 8000 端口\n' +
               '3. config/settings.js 的 useLan 已设为 true\n' +
               '4. 局域网 IP 没变（换网络会变）',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#2F6BED'
    })
  },

  doLoginSuccess(data) {
    // token 存本地，request.js 每次请求自动带在 header.token 里
    wx.setStorageSync('token', data.token)

    var parent = data.parent || {}
    var children = data.children || []

    app.initUserInfo(parent, children)

    wx.showToast({ title: '登录成功', icon: 'success' })
    track('login_submit', { agreed: true, phone_valid: true, result: 'success' })
    track('feedback_action', { type: 'login_success', page_id: 'pages/login/login' })

    var that = this
    setTimeout(function () {
      that.setData({ loading: false, wxLoading: false })

      // 微信登录但还没有手机号 → 去看不到孩子，提醒一下（不强制，允许先逛逛）
      // 注意顺序：补号优先级高于完善资料，两个弹层不能同时出现
      if (data.need_mobile) {
        wx.showModal({
          title: '完善信息',
          content: '补充手机号后即可查看孩子的课程与课时。现在补充吗？',
          confirmText: '去补充',
          cancelText: '先逛逛',
          confirmColor: '#2F6BED',
          success: function (r) {
            if (r.confirm) {
              that.goBindMobile()
              return
            }
            that.leaveLoginPage()
          },
          fail: function () {
            that.leaveLoginPage()
          }
        })
        return
      }

      // 昵称和头像都没设置过 → 弹一次完善资料引导
      if (that.shouldShowGuide(data)) {
        that.showGuide(data)
        return
      }

      that.leaveLoginPage()
    }, 800)
  },

  // 是否该弹「完善资料」引导。
  // 条件：后端说没设置过（has_custom_profile=false）+ 本地没弹过
  //
  // 注意：这只管「登录后自动弹」这一种场景。
  // 已经设过资料的家长要改昵称/头像，走「我的 → 修改昵称」打开同一个组件
  // 的编辑模式（mode=edit），那条路径不受这里限制，可以反复打开。
  shouldShowGuide(data) {
    var parent = (data && data.parent) || {}
    if (parent.has_custom_profile) return false
    if (wx.getStorageSync(GUIDE_FLAG)) return false
    return true
  },

  showGuide(data) {
    var parent = (data && data.parent) || {}
    wx.setStorageSync(GUIDE_FLAG, 1)
    this.setData({
      guideVisible: true,
      // 后端算好的兜底名（张小明家长 / 家长），用作输入框 placeholder
      guideDefaultName: parent.display_name || '家长',
      guideNickname: parent.nickname || '',
      guideAvatar: parent.avatar || ''
    })
  },

  // 引导弹层关闭（保存成功 或 点跳过）都走这里
  onGuideDone(e) {
    var skipped = !!(e && e.detail && e.detail.skipped)
    this.setData({ guideVisible: false })
    track('profile_action', { type: skipped ? 'guide_skip' : 'guide_done' })
    this.leaveLoginPage()
  },

  // 按来源返回
  leaveLoginPage() {
    if (this.data.from === 'my') {
      wx.switchTab({ url: '/pages/my/my' })
    } else if (this.data.from === 'index') {
      wx.switchTab({ url: '/pages/index/index' })
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  // 微信登录但无手机号：引导补号（同页弹层，不另开页面）
  goBindMobile() {
    var that = this
    wx.showModal({
      title: '补充手机号',
      editable: true,
      placeholderText: '请输入报名时留的手机号',
      confirmText: '提交',
      cancelText: '先逛逛',
      confirmColor: '#2F6BED',
      success: function (res) {
        if (!res.confirm) {
          that.leaveLoginPage()
          return
        }
        var mobile = (res.content || '').trim()
        if (!PHONE_REG.test(mobile)) {
          wx.showToast({ title: '手机号格式不正确', icon: 'none' })
          that.leaveLoginPage()
          return
        }
        that.submitBindMobile(mobile)
      },
      fail: function () {
        that.leaveLoginPage()
      }
    })
  },

  submitBindMobile(mobile) {
    var that = this
    request({
      url: api.bind_mobile,
      method: 'POST',
      data: { mobile: mobile },
      showLoading: true,
      showError: false
    })
      .then(function (data) {
        // 补号可能触发账号合并（该手机号已属于另一条账号），
        // 合并后旧 token 指向的账号被删除，必须换成后端新签的这个
        if (data && data.token) {
          wx.setStorageSync('token', data.token)
        }

        // 补号后孩子列表可能从空变成非空，用返回结果刷新本地缓存
        var parent = (data && data.parent) || {}
        var children = (data && data.children) || []
        app.initUserInfo(parent, children)

        if (children.length) {
          wx.showToast({ title: '已关联 ' + children.length + ' 个孩子', icon: 'none' })
        } else {
          wx.showToast({ title: '未找到孩子，请联系老师登记', icon: 'none' })
        }

        // 补号后同样给一次完善资料的机会（补号的人往往也是第一次来）
        if (that.shouldShowGuide(data)) {
          setTimeout(function () { that.showGuide(data) }, 600)
          return
        }
        that.leaveLoginPage()
      })
      .catch(function (err) {
        wx.showToast({ title: (err && err.msg) || '提交失败', icon: 'none' })
        that.leaveLoginPage()
      })
  }
})
