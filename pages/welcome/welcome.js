// pages/welcome/welcome.js
import api from '../../config/settings'
Page({

    data: {
        second: 3,
        img: '/images/bg/splash.png'
    },
    doJump() {
        //点击跳转到首页
        wx.switchTab({
            url: '/pages/index/index',
        })
    },
    onLoad(options) {
        // 向后端发请求，获取广告页，赋值给img
        wx.request({
            url: api.welcome,
            method: 'GET',
            success: (res) => {
                if (res.data.code == 100) {
                    this.setData({
                        img: res.data.result
                    })
                } else {
                    wx.showToast({
                        title: '网络请求异常'
                    })
                }
            }

        })




        //启动一个定时器，倒计时
        //跳转之后清楚计时器
        var instance = setInterval(() => {
            if (this.data.second <= 1) {
                clearInterval(instance)
                wx.switchTab({
                    url: '/pages/index/index'
                })
            } else {
                this.setData({
                    second: this.data.second - 1
                })
            }
        }, 1000);
    }
})