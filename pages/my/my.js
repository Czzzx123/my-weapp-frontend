var app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    // 统计数据
    stats: [
      { key: 'house', value: 0, label: '课程', icon: 'course' },
      { key: 'points', value: 0, label: '积分', icon: 'star' }
    ],
    // 功能网格
    features: [
      { icon: 'flag', text: 'A' },
      { icon: 'chat', text: 'B' },
      { icon: 'form', text: 'C' },
      { icon: 'calendar', text: 'D' }
    ],
    // 列表菜单
    menuList: [
      { text: '收货地址', icon: 'location' },
      { text: '投诉建议', icon: 'chat' },
      { text: '通用设置', icon: 'setting' },
      { text: '关于我们', icon: 'info-circle' }
    ],
    // 状态栏高度
    statusBarHeight: 0
  },

  onLoad() {
    // 获取状态栏高度
    const sysInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight
    })
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  // 加载用户信息
  loadUserInfo() {
    var info = app.globalData.userInfo
    if (info) {
      this.setData({ userInfo: info })
      // 更新积分
      var stats = this.data.stats
      stats[3].value = info.score || 0
      this.setData({ stats: stats })
    }
  },

  // 跳转到登录页
  handleLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logoutUserInfo()
          this.setData({ userInfo: null })
        }
      }
    })
  },



  // 功能点击
  handleFeature(e) {
    var index = e.currentTarget.dataset.index
    var feature = this.data.features[index]
    wx.showToast({ title: feature.text, icon: 'none' })
  },

  // 菜单点击
  handleMenuTap(e) {
    var index = e.currentTarget.dataset.index
    var item = this.data.menuList[index]
    wx.showToast({ title: item.text, icon: 'none' })
  },

  // 更多操作
  handleMore() {
    wx.showToast({ title: '更多', icon: 'none' })
  },

  // 通知
  handleNotify() {
    wx.showToast({ title: '暂无新通知', icon: 'none' })
  }
})
