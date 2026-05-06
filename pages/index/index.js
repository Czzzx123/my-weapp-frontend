// index.js
import api from "../../config/settings"
Page({
    data: {
        banner_list: [{
            img: '/images/banner/banner1.png'
        }],
        notice: '社区最佳的交友平台上线啦，欢迎大家点击参与，有任何问题可以后台联系管理员'
    },
    //向后端发送请求
    onLoad() {
        wx.request({
            url: api.banner,
            method: "GET",
            success: (res) => {
            this.setData({
                banner_list:res.data.banner,
                notice:res.data.notice.content
            })
            }
        })
    },
    showPopup() {
        this.setData({
            show: true
        });
    },

    onClose() {
        this.setData({
            show: false
        });
    },
    gotoCollection() {
        wx.navigateTo({
            url: '/pages/collection/collection'
        })
    },
    gotoActivity() {
        wx.switchTab({
            url: '/pages/activity/activity'
        })
    },
    gotoFace() {
        wx.navigateTo({
            url: '/pages/face/face'
        })
    },
    gotoVoice() {
        wx.navigateTo({
            url: '/pages/voice/voice'
        })
    },
    gotoHeart() {
        wx.navigateTo({
            url: '/pages/heart/heart'
        })
    },
    gotoGoods() {
        wx.navigateTo({
            url: '/pages/goods/goods'
        })
    },
})