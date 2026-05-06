// pages/camera/camera.js
Page({

    /**
     * 页面的初始数据
     */
    data: {
        backFront: true
    },

    switchCamera() {
        this.setData({
            backFront: !this.data.backFront
        })
    },
    //拍照
    takePhoto() {
        const ctx = wx.createCameraContext()
        ctx.takePhoto({
            quality: 'high',
            success: (res) => {
                var pages = getCurrentPages()
                var prevPage = pages[pages.length - 2]
                prevPage.setData({
                    avatar: res.tempImagePath
                })
                wx.navigateBack({

                })
            }
        })
    }
})