// index.js
import api from "../../config/settings"
Page({
    data: {
        visible: false,
        banner_list: [{
            img: ''
        }],
        notice: '社区最佳的交友平台上线啦，欢迎大家点击参与，有任何问题可以后台联系管理员',
        // 上课日常（暂时写死，后续改为从后端获取）
        daily_list: [
            {
                id: 1,
                date: '2026-10-18',
                img: '/images/home/cute_1.jpg',
                content: '今天的Python课堂，同学们完成了猜数字小游戏的编写，大家都非常投入，下课了还意犹未尽。'
            },
            {
                id: 2,
                date: '2026-10-16',
                img: '/images/home/cute_2.jpg',
                content: 'Scratch创意编程课，孩子们小组合作完成了动画故事作品，每个小组都上台展示了自己的创意。'
            },
            {
                id: 3,
                date: '2026-10-14',
                img: '/images/home/cute_3.jpg',
                content: '机器人搭建课堂，同学们学习了齿轮传动原理，成功搭建了可以自动避障的小车。'
            }
        ]
    },
    marquee1: {
        speed: 80,
        loop: -1,
        delay: 0,
    },
    //向后端发送请求
    onLoad() {
        wx.request({
            url: api.banner,
            method: "GET",
            success: (res) => {
                this.setData({
                    banner_list: res.data.banner,
                    notice: res.data.notice.content
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
    // 上课日常：收藏（功能待实现）
    onCollect() {
        wx.showToast({
            title: '收藏功能开发中',
            icon: 'none'
        })
    },
    // 上课日常：分享（功能待实现）
    onShare() {
        wx.showToast({
            title: '分享功能开发中',
            icon: 'none'
        })
    },
})