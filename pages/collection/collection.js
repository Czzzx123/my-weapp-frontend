// pages/collection/collection.js
import api from "../../config/settings"

Page({

    /**
     * 页面的初始数据
     */
    data: {
        dataDict: {
            result: [{
                    "id": 45,
                    "name": "张铁蛋",
                    "area": "#19",
                    "avatar": "/images/img/b.jpg"
                },
                {
                    "id": 45,
                    "name": "刘亦菲",
                    "area": "#19",
                    "avatar": "/images/img/b.jpg"
                }
            ],
            today_count: 66,
        }

    },

    refresh() {
        wx.showLoading({
            mask: true
        })
        wx.request({
            //加载

            url: api.collection,
            method: 'GET',
            success: (res) => {
                if (res.data.code == 100) {
                    this.setData({
                        dataDict: res.data
                    })
                } else {
                    wx.showToast({
                        title: '网络加载失败'
                    })
                }
            },
            complete: () => {
                wx.hideLoading()
            }
        })
    },
    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {
        this.refresh()
    },
    //下拉重新加载
    onPullDownRefresh() {
        this.refresh()
    },

    doDeleteRow(e) {
        wx.showModal({
            title: '确认是否删除',
            complete: (res) => {
                if (res.cancel) {
                    return
                }
                if (res.confirm) {
                    var nid = e.currentTarget.dataset.nid
                    wx.showLoading({
                        title: '删除中',
                        mask: true
                    })
                    wx.request({
                        url: api.collection + nid + '/',
                        method: 'DELETE',
                        success: (res) => {
                            this.refresh()
                        },
                        complete: () => {
                            wx.hideLoading()
                        }
                    })
                }
            }
        })
    },

    bindToForm() {
        wx.navigateTo({
            url: '/pages/form/form',
        })
    },
    onShow() {
        this.refresh()
    },
    bindToStatistics() {
        wx.navigateTo({
            url: '/pages/statistics/statistics'
        })
    }
})