// 埋点工具（对齐产品定义方案 §5.6 十事件契约）
// 公共属性 6 项由本文件统一注入：ts / uid / source / app_version / page_id / is_login
// 事件名与字段全部 snake_case。后端就绪后改 SEND 开关与 REPORT_URL，页面调用零改动。

var SEND = false
var REPORT_URL = ''   // 后端埋点接收地址，如 api.base + '/track/'
var ANON_KEY = 'wl_anon_id'
var lastPageViewAt = {}   // page_view 同 page_id 3s 去重

// uid：token 指纹 ‖ 本地匿名 id（openid 待后端接入后升级为第一优先级）
// 注意：不用 name 做 uid，避免个人信息入库；游客各自独立匿名 id，保证 UV 去重口径准确
function resolveUid() {
    var token = wx.getStorageSync('token')
    if (token) return 'tk_' + fingerprint(String(token))
    var anon = wx.getStorageSync(ANON_KEY)
    if (!anon) {
        anon = 'anon_' + Date.now() + Math.random().toString(36).slice(2, 10)
        try { wx.setStorageSync(ANON_KEY, anon) } catch (e) { }
    }
    return anon
}

// 轻量字符串指纹（仅 uid 归并用，非安全哈希）
function fingerprint(str) {
    var h = 5381
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
    }
    return h.toString(36)
}

// source：?from= 参数 ‖ scene ‖ 'direct'
function resolveSource() {
    try {
        var opt = (wx.getEnterOptionsSync && wx.getEnterOptionsSync()) || {}
        if (opt.query && opt.query.from) return opt.query.from
        if (opt.scene) return 'scene_' + opt.scene
    } catch (e) { }
    return 'direct'
}

// 当前页 route（page_id 统一口径）
function currentPageRoute() {
    try {
        var pages = getCurrentPages()
        return pages.length ? pages[pages.length - 1].route : ''
    } catch (e) { return '' }
}

function referrerRoute() {
    try {
        var pages = getCurrentPages()
        return pages.length >= 2 ? pages[pages.length - 2].route : ''
    } catch (e) { return '' }
}

// getApp() 惰性调用（模块顶层调用在 app 启动早期可能拿到 undefined）
function resolveIsLogin() {
    try {
        var a = getApp()
        return !!(a && a.globalData && a.globalData.userInfo)
    } catch (e) { return false }
}

function track(event, data) {
    var payload = Object.assign({}, data)

    // page_view 专属：自动补 referrer + 同 page_id 3s 内去重（tab 切回不重复计数）
    if (event === 'page_view') {
        var pid = currentPageRoute()
        var now = Date.now()
        if (lastPageViewAt[pid] && now - lastPageViewAt[pid] < 3000) return
        lastPageViewAt[pid] = now
        payload.page_id = pid
        if (payload.referrer === undefined) payload.referrer = referrerRoute()
    }

    // 公共属性 6 项（统一注入，保证齐全）
    payload.ts = Date.now()
    payload.uid = resolveUid()
    payload.source = resolveSource()
    payload.app_version = '1.0.0'
    payload.page_id = payload.page_id || currentPageRoute()
    payload.is_login = resolveIsLogin()

    if (SEND && REPORT_URL) {
        wx.request({
            url: REPORT_URL,
            method: 'POST',
            data: { event: event, data: payload },
            fail: function () { /* 埋点失败静默，不影响业务 */ }
        })
    } else {
        // 开发期占位输出，console 断言验收用（验收口径：10 事件触发覆盖率 100%）
        console.log('[track]', event, payload)
    }
}

module.exports = { track: track }
