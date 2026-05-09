// pages/voice/voice.js
//录音
const recorderManager = wx.getRecorderManager()
var api = require("../../config/settings.js")
Page({

    /**
     * 页面的初始数据
     */
    data: {
        content: "",
        record: false
    },

    recordStart: function () {
        this.setData({
            record: true
        })
        const options = {
            // duration: 6000,//指定录音的时长，单位 ms
            sampleRate: 16000, //采样率
            numberOfChannels: 1, //录音通道数
            encodeBitRate: 48000, //编码码率
            format: 'wav' //音频格式，有效值 
        }
        //开始录音
        recorderManager.start(options)
    },
    recordCancel: function () {
        console.log("停止");
        this.setData({
            record: false
        })
        wx.hideLoading()
    },
    recordStop: function () {
        if (!this.data.record) {
            return
        }
        recorderManager.stop();
        recorderManager.onStop((res) => {
            // this.tempFilePath = res.tempFilePath
            wx.showLoading()
            wx.uploadFile({
                filePath: res.tempFilePath,
                name: 'voice',
                url: api.voice,
                success: (response) => {
                    console.log(response)
                    // {'code': 100, 'msg':'成功','result': ['欢迎欢迎']}
                    let voiceResponse = JSON.parse(response.data)
                    if (voiceResponse.code == 100) {
                        console.log(voiceResponse)
                        this.setData({
                            content: this.data.content + voiceResponse.result[0]
                        })
                    } else {
                        wx.showToast({
                            title: '识别失败，请重新操作！',
                            icon: "none"
                        })
                    }
                },
                complete: () => {
                    wx.hideLoading()
                }
            }, )
        })
        this.setData({
            record: false
        })
    },
})