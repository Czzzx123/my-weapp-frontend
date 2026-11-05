App({
    // 用来存放用户登录信息，以后在任意页面，通过 var app = getApp() 都能取到当前app
    globalData: {
      userInfo: null
    },
    // 登录成功后调用，把用户登录信息，保存到app.js中，并且放到本地存储中
    initUserInfo: function(name, score, avatar, mobile) {
      var info = {
        name: name,
        score: score,
        avatar: avatar,
        mobile: mobile || '',
        mobileMasked: this.maskMobile(mobile)
      };
      this.globalData.userInfo = info
      // 保存的本地存储
      wx.setStorageSync('userInfo', info);
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
