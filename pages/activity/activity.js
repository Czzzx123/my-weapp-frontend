import api from '../../config/settings'
var app = getApp()
Page({
    data: {
        activityList: [

        ]
    },
    onLoad() {
        this.refresh()
    },
    refresh() {
        wx.showLoading({
            mask: true,
        })
        wx.request({
            url: api.activity,
            method: 'GET',
            success: (res) => {
                this.setData({
                    activityList: res.data
                })
            },
            complete: () => {
                wx.hideLoading()
            }
        })
    },
    // 活动报名接口
    handleSignup: function (event) {
        // 1 校验用户是否登录
        var info = app.globalData.userInfo
        if (info) {
            //2 处理报名按钮点击事件
            var index = event.mark.id; // 获取当前点击的活动索引
            console.log('点击了报名按钮，索引为：', index);
            wx.request({
                url: api.join,
                method: 'POST',
                data: {
                    'id': index
                },
                header: {
                    token: info.token
                }, // 用户登录信息，带在请求头中
                success: (res) => {
                    wx.showToast({
                        title: res.data.msg,
                    })
                }
            })
        } else {
            wx.showToast({
                title: '请先登录',
            })
        }
    }
})