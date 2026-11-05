// 统一请求工具
// 用法: import request from '@/utils/request.js'
//       request({ url: api.banner, method: 'GET' }).then(data => { ... })

var api = require('../config/settings')

// 统一错误对象：让调用方能区分"业务失败 / HTTP 错误 / 网络异常"
// type 取值：business（后端返回非 100）| http（状态码非 200）| network（请求未到达）
function buildError(type, data, statusCode, raw) {
    var code = (data && data.code !== undefined) ? data.code : statusCode
    return {
        type: type,
        code: code,
        msg: (data && data.msg) || '',
        statusCode: statusCode || 0,
        data: data,
        raw: raw
    }
}

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
                        var isExpired = res.data.code === 401
                        if (isExpired) {
                            // 未登录或 token 过期：清理登录态并回登录页
                            wx.removeStorageSync('userInfo')
                            wx.removeStorageSync('token')
                        }
                        if (showError) {
                            wx.showToast({
                                title: isExpired ? '登录已过期' : (res.data.msg || '请求失败'),
                                icon: 'none'
                            })
                        }
                        if (isExpired) {
                            setTimeout(function () {
                                wx.reLaunch({ url: '/pages/login/login' })
                            }, 1000)
                        }
                        // 业务失败必须 reject，否则调用方会把失败当成功，导致
                        // "验证码错误却登录成功"这类静默错误
                        reject(buildError('business', res.data, 200, res))
                        return
                    }
                    resolve(res.data)
                } else {
                    if (showError) {
                        wx.showToast({
                            title: '网络错误(' + res.statusCode + ')',
                            icon: 'none'
                        })
                    }
                    reject(buildError('http', res.data, res.statusCode, res))
                }
            },
            fail: function (err) {
                if (showError) {
                    wx.showToast({
                        title: '网络异常',
                        icon: 'none'
                    })
                }
                reject(buildError('network', null, 0, err))
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
