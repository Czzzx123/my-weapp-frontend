import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

var app = getApp()

// mock 登录：后端未就绪时用这个账号演示
var MOCK_ACCOUNT = {
    mobile: '13800000000',
    code: '8888'
}

var PHONE_REG = /^1[3-9]\d{9}$/

// 协议摘要（正式版全文接入后可替换为独立协议页）
var AGREEMENT_TEXT = {
    service: '《用户服务协议》摘要\n\n1. 本平台为 K12 学生家长提供上课日常、学习服务、积分查询等教育信息服务。\n2. 您应提供真实有效的手机号，用于接收验证码登录及课程通知。\n3. 禁止利用平台从事任何违法违规活动。\n4. 课程安排、课时与积分规则以机构实际公示为准。\n\n正式版上线前将接入完整协议全文。',
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
    countDown: 60,
    phoneError: '',        // 手机号字段级错误（内联红字优先于 Toast）
    demoMode: false,       // 演示降级态标记（CR-01：供埋点归因）
    from: ''               // 来源页（登录成功后返回）
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
      // 发送验证码阶段的校验拦截也计入 login_block（口径要求全覆盖）
      track('login_block', { reason: 'phone', stage: 'send_code' })
      this.setData({ phoneError: phone ? '手机号格式不正确' : '请输入手机号' })
      return
    }
    this.setData({ phoneError: '', sending: true })

    var that = this
    // 尝试请求后端；三分支倒计时口径（CR-01）
    request({ url: api.send_sms + '?mobile=' + phone, showLoading: false, showError: false })
      .then(function (data) {
        if (data && data.code === 100) {
          // ① 真实成功：60s
          wx.showToast({ title: '验证码已发送', icon: 'none' })
          that.startCountdown(60)
        } else {
          // ③ 真实业务失败：不启动倒计时，不罚等，按钮回可发送态
          // 注意：此处禁止提示「当前展示离线数据」，否则用户会误以为拿到了可用验证码
          wx.showToast({ title: (data && data.msg) || '发送失败，请重试', icon: 'none' })
        }
      })
      .catch(function (err) {
        // 区分业务失败与网络失败：业务失败绝不进入演示模式
        if (err && err.type === 'business') {
          wx.showToast({ title: err.msg || '发送失败，请重试', icon: 'none' })
          return
        }
        // ② 降级演示态（网络失败/超时/后端未就绪）：30s + 演示标记
        wx.showToast({ title: '演示模式：验证码 8888', icon: 'none', duration: 2000 })
        that.setData({ demoMode: true })
        that.startCountdown(30)
      })
      .finally(function () {
        that.setData({ sending: false })
      })
  },

  // 启动倒计时（seconds：真实成功 60 / 演示降级 30）
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

  login() {
    var phone = this.data.phone.trim()
    var code = this.data.code.trim()

    // login_submit：result ∈ success / blocked / failed（口径要求三种结果全覆盖）
    if (!this.data.agreed) {
      // 首行校验协议：未勾选 0 次网络请求
      // 口径：每次点击恰好 1 次 login_submit（blocked 点击瞬间上报）；合规拦截另发 login_block
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
    // 尝试后端登录
    request({
      url: api.login,
      method: 'POST',
      data: { mobile: phone, code: code },
      showLoading: false,
      showError: false
    })
      .then((data) => {
        // 后端返回 { code: 100, token, name, score, avatar } 这种结构
        if (data && data.code === 100 && data.token) {
          that.setData({ demoMode: false })   // 真实后端成功：重置演示态
          that.doLoginSuccess(data)
        } else {
          // 业务错误，降级到 mock 登录
          that.tryMockLogin(phone, code, 'business_error')
        }
      })
      .catch((err) => {
        // 后端已明确拒绝（验证码错误、账号不存在等）：必须如实报错，
        // 不能降级成演示登录，否则"验证码错误"会变成"登录成功"
        if (err && err.type === 'business') {
          track('login_submit', {
            agreed: true,
            phone_valid: true,
            result: 'failed',
            reason: 'business_error',
            demo_mode: false
          })
          wx.showToast({ title: err.msg || '登录失败，请重试', icon: 'none' })
          that.setData({ loading: false })
          that.refreshCanSubmit()
          return
        }
        // 网络错误/后端未就绪，降级到 mock 登录
        that.tryMockLogin(phone, code, 'network_error')
      })
  },

  // mock 登录：演示模式下任意手机号 + 8888 即可登录
  tryMockLogin(phone, code, result) {
    if (code === MOCK_ACCOUNT.code) {
      wx.showToast({ title: '演示模式登录成功', icon: 'none' })
      this.setData({ demoMode: true })   // 让 doLoginSuccess 的 demo_mode 拿到真实状态
      // 先存 token 让其他页面鉴权不炸
      wx.setStorageSync('token', 'mock_token_' + Date.now())
      this.doLoginSuccess({
        token: 'mock_token',
        name: phone.slice(-4) + '同学',
        score: 666,
        avatar: '',
        mobile: phone
      })
    } else {
      // 所有失败分支必须复位 loading，否则按钮卡死
      track('login_submit', {
        agreed: true,
        phone_valid: true,
        result: 'failed',
        reason: result === 'network_error' ? 'network_error' : 'business_error',
        demo_mode: this.data.demoMode   // 演示态语义：以数据实际来源为准（PM 口径）
      })
      wx.showToast({ title: '验证码错误（演示模式：8888）', icon: 'none' })
      this.setData({ loading: false })
      this.refreshCanSubmit()
    }
  },

  doLoginSuccess(data) {
    wx.setStorageSync('token', data.token)
    app.initUserInfo(data.name, data.score || 0, data.avatar || '', data.mobile || this.data.phone)
    wx.showToast({ title: '登录成功', icon: 'success' })
    track('login_submit', {
      agreed: true,
      phone_valid: true,
      result: 'success',
      demo_mode: this.data.demoMode
    })
    track('feedback_action', { type: 'login_success', page_id: 'pages/login/login' })
    var that = this
    setTimeout(function () {
      // 所有分支复位 loading（含成功分支）
      that.setData({ loading: false })
      // 按来源返回：my → switchTab 回我的；index 及其他 → 回首页
      if (that.data.from === 'my') {
        wx.switchTab({ url: '/pages/my/my' })
      } else if (that.data.from === 'index') {
        wx.switchTab({ url: '/pages/index/index' })
      } else {
        wx.reLaunch({ url: '/pages/index/index' })
      }
    }, 800)
  }
})
