// pages/face/face.js
import api from '../../config/settings'
Page({

    /**
     * 页面的初始数据
     */
    data: {
        backFront: true,
        record: [],
    },
    switchCamera(e) {
        var old = this.data.backFront
        this.setData({
            backFront: !old
        })
    },
    takePhoto() {
        //打开loading
        wx.showLoading({
            title: '检测中',
            mask: true
        })
        //把拍到的照片传到后端
        const ctx = wx.createCameraContext()
        ctx.takePhoto({
            quality: 'high',
            success: (res) => {
                wx.uploadFile({
                    url: api.face,
                    filePath: res.tempImagePath,
                    name: 'avatar',
                    //如果上传成功
                    success: (response) => {
                        // 返回数据获得json格式
                        let resdata = JSON.parse(response.data)
                        console.log(resdata)
                        if (resdata.code == 100 || resdata.code == 102) {
                            resdata.avatar = res.tempImagePath
                            var oldRecord = this.data.record
                            console.log(oldRecord)
                            //把拍摄的照片追加进去
                            oldRecord.unshift(resdata)
                            this.setData({
                                record: oldRecord
                            })
                        } else {
                            wx.showToast({
                                title: '请正常拍照'
                            })
                        }
                    },
                    complete: function () {
                        wx.hideLoading()
                    }
                })
            }
        })
    },
})