// 统一请求工具
// 用法: import request from '@/utils/request.js'
//       request({ url: api.banner, method: 'GET' }).then(data => { ... })

var api = require('../config/settings')

function request(options) {
    var { url, method = 'GET', data = {}, showLoading = true, showError = true } = options

    return new Promise(function (resolve, reject) {
        if (showLoading) {
            wx.showLoading({ title: '加载中', mask: true })
        }

        wx.request({
            url: url,
            method: method,
            data: data,
            timeout: 10000,
            header: {
                'token': wx.getStorageSync('token') || ''
            },
            success: function (res) {
                // HTTP 200 但业务错误
                if (res.statusCode === 200) {
                    // 部分接口直接返回数据数组（无 code），部分返回 {code: 100, ...}；约定成功码为 100
                    if (res.data && res.data.code !== undefined && res.data.code !== 100) {
                        if (res.data.code === 401) {
                            // 未登录或 token 过期
                            wx.removeStorageSync('userInfo')
                            wx.removeStorageSync('token')
                            wx.showToast({ title: '登录已过期', icon: 'none' })
                            setTimeout(function () {
                                wx.reLaunch({ url: '/pages/login/login' })
                            }, 1000)
                        } else if (showError) {
                            wx.showToast({
                                title: res.data.msg || '请求失败',
                                icon: 'none'
                            })
                        }
                    }
                    resolve(res.data)
                } else {
                    if (showError) {
                        wx.showToast({
                            title: '网络错误(' + res.statusCode + ')',
                            icon: 'none'
                        })
                    }
                    reject(res)
                }
            },
            fail: function (err) {
                if (showError) {
                    wx.showToast({
                        title: '网络异常',
                        icon: 'none'
                    })
                }
                reject(err)
            },
            complete: function () {
                if (showLoading) {
                    wx.hideLoading()
                }
            }
        })
    })
}

module.exports = request
