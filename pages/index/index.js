// index.js
import api from "../../config/settings"
import request from "../../utils/request"
import subscribe from "../../utils/subscribe"
import { track } from "../../utils/track"

// 公告关闭状态按日记忆
function todayKey() {
    var d = new Date()
    return 'notice_closed_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

// 上课日常降级数据。
//
// **为什么不放在 data 里**：放在 data 里它就成了「初始值」，接口失败时页面
// 看起来和成功一模一样，谁也不知道自己在看假数据。抽成常量后，它只在
// catch 分支被显式塞进去，同时上报 mode='fallback'，归因上能区分开。
//
// 字段结构与后端 /smart/learning/ 的返回严格一致（course / date 而不是
// course_name / create_time），换成真数据时版式一行都不用改。
var MOCK_DAILY = [
    { id: 1, date: '10月18日', course: 'Python课堂', theme: 'blue',   title: '猜数字小游戏完成',   content: '今天的Python课堂，同学们完成了猜数字小游戏的编写，大家都非常投入，下课了还意犹未尽。' },
    { id: 2, date: '10月16日', course: 'Scratch创意', theme: 'mint',  title: '小组动画作品展示',   content: 'Scratch创意编程课，孩子们小组合作完成了动画故事作品，每个小组都上台展示了自己的创意。' },
    { id: 3, date: '10月14日', course: '机器人搭建', theme: 'purple', title: '自动避障小车搭建成功', content: '机器人搭建课堂，同学们学习了齿轮传动原理，成功搭建了可以自动避障的小车。' }
]

Page({
    data: {
        // mock banner：渐变卡片式，不依赖低清图片；后端就绪后返回 img 字段自动切换为图片 Banner
        banner_list: [
            { tag: '本周推荐', title: 'Python 创意编程班', subtitle: '让孩子用代码做游戏', theme: 'blue' },
            { tag: '热门课程', title: 'Scratch 动画创作', subtitle: '零基础也能做出动画故事', theme: 'mint' },
            { tag: '动手实践', title: '机器人搭建与编程', subtitle: '从齿轮传动到自动避障', theme: 'purple' }
        ],
        notice: '欢迎来到未蓝科技 · 智慧教育平台',
        noticeVisible: true,
        // 上课日常：真实数据由 fetchDaily() 填入，这里给空数组而不是假数据。
        // 空数据显示占位文案（dailyEmpty），避免首页一进来闪一下假卡片。
        daily_list: [],
        dailyEmpty: false,

        // 订阅提醒引导弹层。
        //
        // 为什么首页要弹：家长不会主动去课表页找那个「开启提醒」按钮，
        // 绝大多数人一辈子都不会点。而「有没有授权」直接决定提醒
        // 能不能发出去 —— 不主动引导，功能等于没做。
        //
        // 为什么自己画弹层而不是直接调微信授权框：
        // ① 微信禁止一进页面就弹授权（诱导授权，会被收回消息能力）；
        // ② 直接弹的话家长不知道「批准了能收到什么」，只会顺手点拒绝。
        //   先用自己的弹层说清价值，再调授权框，这是合规且有效的做法。
        subscribeVisible: false,
        // 模板 id 缓存：弹层点了才用，不用每次进页面都请求
        _tmplIds: []
    },

    onLoad() {
        this.initNotice()
        this.fetchBanner()
        this.fetchDaily(true)
        this.initSubscribe()
    },

    onShow() {
        track('page_view', { page_id: 'index' })
    },

    // 下拉刷新（index.json 已开启 enablePullDownRefresh）
    onPullDownRefresh() {
        // 刷新不重新上报曝光：曝光口径是「首次出现在屏幕上」，
        // 每次下拉都报一遍会让分母虚高。所以第二个参数传 false。
        Promise.all([
            this.fetchBanner(),
            this.fetchDaily(false)
        ]).then(function () {
            wx.stopPullDownRefresh()
        })
    },

    // 把本地收藏状态合并进列表（WXML 不支持 indexOf，故落到 item.collected 字段）
    //
    // 一律 String() 后比较：storage 里存的是历史数据，可能混有旧 mock 的
    // 数字 id 和接口返回的数字 id，而 dataset 取出来恒为字符串。
    // 不强转的话「收藏状态点开就丢」这类问题极难复现。
    mergeCollected(list) {
        var ids = (wx.getStorageSync('collected_daily') || []).map(String)
        return (list || []).map(function (d) {
            d.collected = ids.indexOf(String(d.id)) >= 0
            return d
        })
    },

    // 上课日常卡片曝光
    // 【V1.1 数据口径约束（产品侧变更台账）】接口与 fallback 必须互斥，禁止双报：
    //   ① 接口成功且返回 daily 数据 → 只按返回数据上报一次，mode 传 'api'；
    //   ② 接口失败降级 mock → 才走 fallback 上报一次，mode 传 'fallback'。
    // 双报会让曝光漏斗分母虚高、曝光→收藏/分享归因失真。
    // 实现方式：把「取数」「上报」绑在同一处（applyDaily），谁最终决定了页面
    // 上显示的内容，就由谁按对应 mode 上报，物理上不可能报两次。
    reportDailyExpose(list, mode) {
        var source = list || this.data.daily_list
        var reportMode = mode || 'fallback'
        setTimeout(function () {
            source.slice(0, 3).forEach(function (item, index) {
                track('daily_card_expose', {
                    item_id: item.id,
                    pos: index,
                    title: item.title,
                    mode: reportMode
                })
            })
        }, 300)
    },

    // 公告：当日已关闭则不再显示
    initNotice() {
        this.setData({ noticeVisible: !wx.getStorageSync(todayKey()) })
    },

    closeNotice() {
        wx.setStorageSync(todayKey(), 1)
        this.setData({ noticeVisible: false })
        track('feedback_action', { type: 'notice_close', page_id: 'index' })
    },

    // ============================================================
    // 订阅提醒引导
    // ============================================================
    //
    // 时序上有个坑必须记牢：
    //   wx.requestSubscribeMessage 要求在**用户点击的同步调用栈**里发起。
    //   如果用户点了「开启」，我们先 await 一个接口拿模板 id，再调授权 ——
    //   手势已经失效，微信直接返回
    //   `can only be invoked by user TAP gesture`，弹都弹不出来。
    //
    // 所以模板 id 必须在**页面加载时**就拉好存起来，点击时只用缓存。
    initSubscribe() {
        var that = this

        // 先问本地「该不该弹」，不该弹就完全不请求接口，
        // 省一次网络请求也避免无事发生
        if (!subscribe.shouldPrompt()) return

        request({ url: api.notify_config, showLoading: false, showError: false })
            .then(function (res) {
                var ids = (res && res.tmpl_ids) || []
                if (!ids.length && res && res.template_id) ids = [res.template_id]
                if (!ids.length) return   // 后台没配模板，弹了也是白弹

                that.setData({ _tmplIds: ids, subscribeVisible: true })
                // 记一次「弹过了」—— 放在这里（真的显示了）而不是发起请求前，
                // 否则请求失败也算次数，白白耗掉 3 次机会。
                subscribe.markPrompted()
                track('page_view', { page_id: 'index_subscribe_prompt' })
            })
            .catch(function () {
                // 拿不到配置就不弹。订阅是附加功能，不该在首页弹错误。
            })
    },

    // 点了「开启提醒」。
    //
    // 这里**必须是同步调** requestRemind，中间不能有任何异步操作 ——
    // 见 initSubscribe 的注释。
    onSubscribeAccept() {
        var that = this
        var ids = that.data._tmplIds
        if (!ids || !ids.length) {
            that.setData({ subscribeVisible: false })
            return
        }

        // 注意：track 目前是纯同步的（utils/track.js 里 SEND=false），
        // 所以它夹在点击和授权之间不会断掉手势栈。
        // **哪天把埋点改成异步上报（await 或回调里再调授权），
        // 这里的 requestRemind 就再也弹不出授权框了** ——
        // 微信会返回 can only be invoked by user TAP gesture。
        // 真要把埋点改成异步，必须把 track 挪到 requestRemind 之后。
        track('feedback_action', { type: 'subscribe_request', page_id: 'index' })

        subscribe.requestRemind(ids).then(function (r) {
            that.setData({ subscribeVisible: false })

            if (r.ok) {
                track('feedback_action', { type: 'subscribe_accept', page_id: 'index' })
                if (r.banned) {
                    wx.showModal({
                        title: '提醒部分开启',
                        content: '有一类提醒暂时不可用，我们已经在处理。另一类可以正常收到。',
                        confirmText: '知道了',
                        confirmColor: '#2F6BED',
                        showCancel: false
                    })
                    return
                }
                wx.showToast({ title: '开课和签到都会提醒你', icon: 'none' })
                return
            }

            if (r.state === 'reject') {
                track('feedback_action', { type: 'subscribe_reject', page_id: 'index' })
                // 拒绝是正常选择。不追问、不二次弹窗 ——
                // 但要把「随时能在课表页再开」说出来，否则他以后想开也找不到。
                wx.showToast({ title: '已跳过，可在课表页随时开启', icon: 'none' })
                return
            }

            wx.showToast({ title: r.msg || '开启失败，请稍后再试', icon: 'none' })
        })
    },

    // 点了「暂不需要」。只关掉这一次，下次进页面还可能再弹
    // （受 MAX_PROMPT 和 24 小时间隔约束）。
    onSubscribeClose() {
        this.setData({ subscribeVisible: false })
        track('feedback_action', { type: 'subscribe_dismiss', page_id: 'index' })
    },

    // 点了「不再提示」。永久不再主动弹，只剩课表页的常驻按钮。
    onSubscribeMute() {
        subscribe.mutePrompt()
        this.setData({ subscribeVisible: false })
        track('feedback_action', { type: 'subscribe_mute', page_id: 'index' })
        wx.showToast({ title: '不再提示，可在课表页开启', icon: 'none' })
    },

    // 空函数：给弹层的 catchtouchmove 用，阻止背景跟着滚动。
    // 没有它，手指在弹层上滑动时底层页面会一起动，看起来像页面错位。
    noop() { },

    // 拉取 banner 和通知
    fetchBanner() {
        var that = this
        return request({ url: api.banner, showLoading: false, showError: false })
            .then((res) => {
                if (res) {
                    var banner = res.banner || (res.data && res.data.banner)
                    var notice = (res.notice && res.notice.content) || (res.data && res.data.notice && res.data.notice.content)
                    var patch = {}
                    if (banner && banner.length) patch.banner_list = banner
                    if (notice) {
                        patch.notice = notice
                        patch.noticeVisible = !wx.getStorageSync(todayKey())
                    }
                    that.setData(patch)
                }
            })
            .catch((err) => {
                // 业务失败需可观测，不能静默；网络失败则保持 mock 数据（离线降级）
                if (err && err.type === 'business') {
                    console.log('[首页] Banner 接口业务失败:', err.code, err.msg)
                }
                // 后端未就绪，保持 mock 数据
            })
    },

    gotoActivity() {
        wx.switchTab({ url: '/pages/activity/activity' })
    },

    // ============================================================
    // 上课日常：接口 → 失败降级 mock
    // ============================================================

    // shouldReport：本次取数要不要上报曝光埋点。
    // onLoad 传 true（首屏曝光），下拉刷新传 false（否则分母虚高）。
    fetchDaily(shouldReport) {
        var that = this
        return request({ url: api.learning, showLoading: false, showError: false })
            .then((res) => {
                var list = (res && res.daily) || []
                if (list.length) {
                    that.applyDaily(that.mergeCollected(list), 'api', shouldReport)
                    return
                }
                // 接口通了但后台一条都没录：这不是错误，是「还没发内容」。
                // 此时列表留空、显示占位文案，不要拿假数据糊弄家长。
                that.setData({ daily_list: [], dailyEmpty: true })
            })
            .catch((err) => {
                if (err && err.type === 'business') {
                    // 后端明确报错：如实记录，同时降级 mock 保住页面可看
                    console.log('[首页] 上课日常接口业务失败:', err.code, err.msg)
                } else {
                    console.log('[首页] 上课日常接口不可用，降级本地 mock')
                }
                that.applyDaily(that.mergeCollected(MOCK_DAILY), 'fallback', shouldReport)
            })
    },

    // 唯一写 daily_list 的地方。
    // 曝光上报绑在这里，保证「页面显示的是谁的数据，就按谁的 mode 报一次」。
    applyDaily(list, mode, shouldReport) {
        this.setData({ daily_list: list, dailyEmpty: false })
        if (shouldReport) {
            this.reportDailyExpose(list, mode)
        }
    },

    // 图片加载失败（后台换了图但文件被删、域名没配白名单等）：
    // 把这张卡的 img 清空，让它退回纯文字版式，而不是留一条灰带。
    // 不弹 toast —— 首页顶部的成功与否不该由一张配图决定。
    onDailyImgError(e) {
        var id = e.currentTarget.dataset.id
        var list = this.data.daily_list.map(function (d) {
            if (d.id === id) d.img = ''
            return d
        })
        console.log('[首页] 学习动态配图加载失败，已降级为纯文字卡片 id=', id)
        this.setData({ daily_list: list })
    },

    // 收藏防抖锁（实例属性，不进 data，避免无谓 setData）
    _collectLock: false,

    // 收藏/取消收藏（未登录先引导登录；本地状态 + Storage 持久化）
    onCollect(e) {
        if (this._collectLock) return
        this._collectLock = true
        setTimeout(() => { this._collectLock = false }, 300)

        if (!getApp().globalData.userInfo) {
            wx.showModal({
                title: '登录后收藏',
                content: '登录后即可收藏孩子的上课日常',
                confirmText: '去登录',
                confirmColor: '#2F6BED',
                success: function (res) {
                    if (res.confirm) {
                        // 带来源参数：登录成功后按 from 返回来源页（通用机制，不依赖默认值兜底）
                        wx.navigateTo({ url: '/pages/login/login?from=index' })
                    }
                }
            })
            return
        }
        // dataset 取出来的 id 恒为字符串，而接口返回的是数字。
        // 后面既要写 storage 又要回写列表，统一转成字符串后再比较，
        // 否则「点了收藏但心是空的」——因为 d.id === id 永远为 false。
        var id = String(e.currentTarget.dataset.id)
        var ids = (wx.getStorageSync('collected_daily') || []).map(String)
        var idx = ids.indexOf(id)
        var collected
        if (idx >= 0) {
            ids.splice(idx, 1)
            collected = false
        } else {
            ids.push(id)
            collected = true
        }
        // 写库成功才上报埋点，避免"操作未完成也计为有效反馈"
        try {
            wx.setStorageSync('collected_daily', ids)
        } catch (err) {
            wx.showToast({ title: '收藏失败，请重试', icon: 'none' })
            return
        }
        // 只更新对应卡片的状态字段
        var list = this.data.daily_list.map(function (d) {
            if (String(d.id) === id) d.collected = collected
            return d
        })
        this.setData({ daily_list: list })
        wx.showToast({
            title: collected ? '已收藏' : '已取消收藏',
            icon: 'none'
        })
        track('daily_collect', { item_id: id, action: collected ? 'on' : 'off', source_page: 'index' })
        track('feedback_action', { type: 'collect', page_id: 'index' })
    },

    // 分享：通过 button open-type="share" 触发
    // daily_share 触发点 = 分享面板唤起（微信无成功回调，属平台限制，与产品侧口径一致）
    onShareAppMessage(e) {
        var item = null
        if (e && e.from === 'button' && e.target && e.target.dataset) {
            var id = String(e.target.dataset.id)
            // 同上：dataset 是字符串，接口 id 是数字，必须同类型比
            item = this.data.daily_list.find(function (d) { return String(d.id) === id })
            track('daily_share', { item_id: id })
        }
        track('feedback_action', { type: 'share', page_id: 'index' })
        // content 在后台是选填的，可能为空串。不能直接 .slice —— 空串倒是没事，
        // 但拼出来是「【Python课堂】…」这种半截标题，所以按有无内容分开拼。
        var title = '未蓝科技 · 记录孩子每一步成长'
        if (item) {
            var brief = (item.content || '').slice(0, 20)
            title = brief ? ('【' + item.course + '】' + brief + '…') : ('【' + item.course + '】' + item.title)
        }
        return {
            title: title,
            path: '/pages/index/index'
        }
    }
})
