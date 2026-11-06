// 上传文件工具
//
// 为什么不复用 utils/request.js：
// wx.uploadFile 与 wx.request 的返回结构完全不同 ——
// uploadFile 的 res.data 是**字符串**，需要自己 JSON.parse，
// 而且它不会像 wx.request 那样自动跟随 showLoading 的语义。
// 混在 request.js 里会让那个函数出现一堆 if 分支，不如单独一个文件。

var api = require('../config/settings')

/**
 * 上传单个文件
 *
 * @param {Object} options
 * @param {string} options.url      接口地址
 * @param {string} options.filePath 本地临时文件路径（如 chooseAvatar 返回的 http://tmp/xxx）
 * @param {string} [options.name]   multipart 里的字段名，默认 'file'
 * @param {Object} [options.formData] 附加的表单字段
 * @param {string} [options.loadingText] 加载提示文案
 * @returns {Promise<Object>} 后端返回的 JSON
 */
function upload(options) {
    var url = options.url
    var filePath = options.filePath
    var name = options.name || 'file'
    var formData = options.formData || {}

    return new Promise(function (resolve, reject) {
        if (!filePath) {
            reject({ type: 'client', msg: '没有选择文件' })
            return
        }

        wx.showLoading({ title: options.loadingText || '上传中', mask: true })

        wx.uploadFile({
            url: url,
            filePath: filePath,
            name: name,
            formData: formData,
            timeout: 30000,   // 图片上传比普通请求慢，给足时间
            header: {
                // 与 request.js 保持一致的鉴权方式：token 走自定义 header
                'token': wx.getStorageSync('token') || ''
            },
            success: function (res) {
                // uploadFile 的 data 是字符串，必须自己解析
                var data = res.data
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data)
                    } catch (e) {
                        reject({
                            type: 'parse',
                            msg: '服务器返回格式异常',
                            raw: res.data,
                            statusCode: res.statusCode
                        })
                        return
                    }
                }

                if (res.statusCode !== 200) {
                    reject({
                        type: 'http',
                        code: (data && data.code) || res.statusCode,
                        msg: (data && data.msg) || ('上传失败(' + res.statusCode + ')'),
                        data: data
                    })
                    return
                }

                // 成功码约定与 request.js 一致：100
                if (data && data.code !== undefined && data.code !== 100) {
                    if (data.code === 401) {
                        wx.removeStorageSync('userInfo')
                        wx.removeStorageSync('token')
                    }
                    reject({
                        type: 'business',
                        code: data.code,
                        msg: data.msg || '上传失败',
                        data: data
                    })
                    return
                }

                resolve(data)
            },
            fail: function (err) {
                reject({
                    type: 'network',
                    msg: '网络异常，上传失败',
                    raw: err
                })
            },
            complete: function () {
                wx.hideLoading()
            }
        })
    })
}

module.exports = upload
