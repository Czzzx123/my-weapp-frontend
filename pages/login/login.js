import api from '../../config/settings'
var app = getApp()

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

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value });
  },

  sendCode() {
    if (this.data.phone) {
      wx.request({
        url: api.send_sms + '?mobile=' + this.data.phone,
        method: 'GET',
        success: (res) => {
          wx.showToast({ title: res.data.msg });
        }
      });
      this.setData({
        sendCodeDisabled: true,
        timer: setInterval(this.countDown.bind(this), 1000)
      });
    } else {
      wx.showToast({ title: '请输入手机号' });
    }
  },

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

  onUnload() {
    clearInterval(this.data.timer);
  },

  login() {
    if (this.data.phone && this.data.code) {
      wx.request({
        url: api.login,
        method: 'POST',
        data: { mobile: this.data.phone, code: this.data.code },
        success: (res) => {
          var data = res.data;
          if (data.code == 100) {
            var token = data.token;
            var name = data.name;
            var score = data.score;
            var avatar = data.avatar;
            app.initUserInfo(name, score, avatar, token);
            wx.navigateBack();
          } else {
            wx.showToast({ title: '登录失败' });
          }
        }
      });
    } else {
      wx.showToast({ title: '需要必填' });
    }
  }
});
