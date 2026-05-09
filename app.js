App({
    // 用来存放用户登录信息，以后在任意页面，通过 var app = getApp() 都能取到当前app
    globalData: {
      userInfo: null
    },
    // 登录成功后调用，把用户登录信息，保存到app.js中，并且放到本地存储中
    initUserInfo: function(name,score,avatar,token) {
      var info = {
        name: name,
        score: score,
        avatar: avatar,
        token:token
      };
      this.globalData.userInfo = info
      // 保存的本地存储
      wx.setStorageSync('userInfo', info);
    },
  
    // 退出功能
    logoutUserInfo:function(){
      wx.removeStorageSync('userInfo');
      this.globalData.userInfo=null;
    },
    // 小程序一启动--》本地存储中有登录数据，用户就是登录装填 
    onLaunch(){
      var info =wx.getStorageSync('userInfo')
      console.log(info)
      this.globalData.userInfo = info
    }
  
  })