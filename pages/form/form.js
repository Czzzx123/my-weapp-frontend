// pages/form/form.js
import api from '../../config/settings'
Page({

    /**
     * 页面的初始数据
     */
    data: {
        avatar: '/images/camera/camera.png',
        objectArray: [{
                id: 1,
                name: '2单元1号楼',
                desc: '2#1'
            },
            {
                id: 2,
                name: '2单元2号楼',
                desc: '2#2'
            }
        ],
        name: '',
        index: -1,
    },
    bindToCamera() {
        wx.navigateTo({
            url: '/pages/camera/camera',
        })
    },
    onLoad() {
        wx.request({
            url: api.area,
            method: 'GET',
            success: (res) => {
                this.setData({
                    objectArray: res.data
                })
            }
        })
    },
    //选中某个网格后回显
    bindPickerChange(e) {
        this.setData({
            index: e.detail.value
        })
    },
    //上传图片
    postUser(e) {
        wx.showLoading({
            title: '提交中',
            mask: true
        })
        wx.uploadFile({
            url: api.collection,
            filePath: this.data.avatar,
            name: 'avatar',
            formData: {
                name: this.data.name,
                area: this.data.objectArray[this.data.index].id
            },
            success: (res) => {
                wx.navigateBack()
            },
            complete: () => {
                wx.hideLoading()
            }
        })
    }

})