import api from '../../config/settings'
var app = getApp() // 取到 app.js 对象
Page({


  data: {
    phone: '',
    code: '',
    agreed: false,
    sendCodeDisabled: false,
    buttonText: '发送验证码',
    loading: false,
    timer: null,
    countDown: 60
  },

  // 监听手机号输入
  onPhoneInput(event) {
    this.setData({
      phone: event.detail
    });
  },

  // 监听验证码输入
  onCodeInput(event) {
    this.setData({
      code: event.detail
    });
  },

  // 发送验证码
  sendCode() {
    // 在这里编写发送验证码的逻辑，此处仅做示例
    if (this.data.phone) {
      wx.request({
        //http://192.168.71.100:8000/smart/user/send_sms/?mobile=18923212331
        url: api.send_sms + '?mobile=' + this.data.phone,
        method: 'GET',
        success: (res) => {
          wx.showToast({
            title: res.data.msg,
          })
        }
      })
      this.setData({
        sendCodeDisabled: true,
        timer: setInterval(this.countDown, 1000)
      });
    } else {
      wx.showToast({
        title: '请输入手机号',
      })
    }

  },

  // 验证码倒计时
  countDown() {
    let countDown = this.data.countDown;
    if (countDown === 0) {
      clearInterval(this.data.timer);
      this.setData({
        buttonText: '发送验证码',
        sendCodeDisabled: false,
        countDown: 60
      });
      return;
    }
    this.setData({
      buttonText: countDown + 's',
      countDown: countDown - 1
    });
  },

  // 页面移走，销毁定时器
  onUnload() {
    clearInterval(this.data.timer);
  },

  //登录接口
  login(){
    if(this.data.phone && this.data.code){
      wx.request({
        url: api.login,
        method:'POST',
        data:{mobile:this.data.phone,code:this.data.code},
        success:(res)=>{
          var data=res.data
          if(data.code==100){
            //登录成功，保存用户信息
            console.log(data)
            var token = data.token
            var name = data.name
            var score = data.score
            var avatar = data.avatar
            // 保存到app.js中
            app.initUserInfo(name, score, avatar, token)
            var info = app.globalData.userInfo
            console.log('globalData.userInfo', info)
            wx.navigateBack()
          }else{
            wx.showToast({
              title: '登录失败',
            })
          }

        }
      })
      
    }else{
      wx.showToast({
        title: '需要必填',
      })
    }

  }
})