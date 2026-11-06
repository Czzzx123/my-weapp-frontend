App({
    // 用来存放用户登录信息，以后在任意页面，通过 var app = getApp() 都能取到当前app
    globalData: {
      userInfo: null
    },

    // 登录成功后调用：把后端返回的 parent + children 归一成前端使用的 userInfo
    // 参数与 /user/login/ 、/user/bind_mobile/ 、/user/profile/ 的返回体对齐
    initUserInfo: function(parent, children) {
      var p = parent || {}
      var list = children || []

      var info = {
        id: p.id || 0,
        name: p.nickname || '家长',
        avatar: p.avatar || '',
        role: p.role || 'parent',
        mobile: p.mobile || '',
        mobileMasked: this.maskMobile(p.mobile),
        children: list,
        // 常用派生值，避免每个页面都算一遍
        childCount: list.length,
        childName: list.length ? list[0].name : '',
        // 徽标用：一个孩子直接显示名字，多个显示「张小明 等 2 个孩子」
        childSummary: this.buildChildSummary(list)
      }

      this.globalData.userInfo = info
      // 保存到本地存储
      wx.setStorageSync('userInfo', info)
      return info
    },

    // 孩子摘要文案
    buildChildSummary: function(children) {
      var list = children || []
      if (!list.length) return ''
      if (list.length === 1) return list[0].name || ''
      return (list[0].name || '') + ' 等 ' + list.length + ' 个孩子'
    },

    // 手机号脱敏：151****108
    maskMobile: function(mobile) {
      if (!mobile || mobile.length !== 11) return mobile || ''
      return mobile.slice(0, 3) + '****' + mobile.slice(-3)
    },

    // 退出功能
    logoutUserInfo:function(){
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('token');
      this.globalData.userInfo=null;
    },

    // 小程序一启动--》本地存储中有登录数据，用户就是登录状态
    onLaunch(){
      var info = wx.getStorageSync('userInfo')
      this.globalData.userInfo = info || null
    }

  })
