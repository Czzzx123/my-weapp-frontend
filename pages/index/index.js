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

        // ---- 无限滚动的四个状态位（2026-11-27 加）----
        //
        // dailyHasMore 初值给 true 而不是 false：接口还没回来时列表是空的，
        // 若给 false，第一批数据一到就会顶上「已经到底啦」——
        // 明明下面还有好几页。等接口返回再按真实的 has_more 改。
        dailyHasMore: true,
        // 首屏加载中（列表还是空的时候显示整块占位）
        dailyLoading: false,
        // 触底加载中（只显示底部那一行「加载中」）
        dailyLoadingMore: false,
        // 下一页加载失败（底部变成可点重试）
        dailyLoadError: false,
        // 当前展示的是离线降级假数据。底部文案要说实话，
        // 不能让家长以为「就这么多内容」。
        dailyFallback: false,

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

    // 页面卸载：断开所有曝光观察器。
    // 不断开的话，每次进页面都会新挂一批 observer —— 小程序单页实例
    // 未必被回收，久了就是内存泄漏 + 后台空跑回调。
    onUnload() {
        this._clearExposeObservers()
    },

    // 下拉刷新（index.json 已开启 enablePullDownRefresh）
    onPullDownRefresh() {
        // 刷新要**重置游标**回到第一页。不重置的话，刷完还是接着上次的位置，
        // 家长下拉半天看到的还是旧内容，会以为刷新没生效。
        this._cursor = null

        // 刷新不重新上报曝光：曝光口径是「首次出现在屏幕上」，
        // 每次下拉都报一遍会让分母虚高。所以第二个参数传 false。
        Promise.all([
            this.fetchBanner(),
            this.fetchDaily(false)
        ]).then(function () {
            wx.stopPullDownRefresh()
        })
    },

    // 触底加载下一页（2026-11-27 加）
    //
    // 什么时候不加载：
    // ① 还有请求在路上 —— 连滑两次会发两个重复请求，回来都是同一页数据
    // ② 已经到底 —— has_more=false 之后不该再问
    // ③ 降级中 —— 假数据没有「下一页」，接了会拿到真数据把界面搞混
    // ④ 空列表 —— 由空状态占位负责，不是「触底」
    onReachBottom() {
        if (this.data.dailyLoading || this.data.dailyLoadingMore) return
        if (!this.data.dailyHasMore) return
        if (this.data.dailyFallback) return
        if (!this.data.daily_list.length) return

        this.loadMoreDaily()
    },

    // 底部「网络不太顺，点击重试」
    onRetryMore() {
        if (this._loadLock) return
        this.loadMoreDaily()
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
    //
    // ---- 2026-11-27 改：从「前 3 条」改成「真进屏幕」 ----
    //
    // 原来写死 `source.slice(0, 3)`，因为那时首页只有 3 张卡，等于全报。
    // 改成无限滚动后这个写法会失真：首屏 6 条全报 = 分母直接翻倍，
    // 而屏幕上其实只看得到 2~3 张，曝光率会掉到 40% 以下，看着像「内容没人看」。
    //
    // 现在用 IntersectionObserver 判定卡片是否真进了可视区。
    // 已报过的 id 记在 _exposedIds 里，翻回来不会再报第二次 ——
    // 曝光是「首次出现在屏幕上」，重复报会让同一张卡贡献多次曝光。
    reportDailyExpose(list, mode, startIndex) {
        var that = this
        var reportMode = mode || 'fallback'
        var begin = startIndex || 0

        // 小程序的 IntersectionObserver 只能按选择器批量观察页面节点，
        // 没法直接观察 JS 对象。所以先算出「这次新加进来的 id」，
        // 再用 id 拼选择器去观察对应的卡片节点。
        var ids = (list || []).slice(begin).map(function (d, i) {
            return { id: String(d.id), pos: begin + i, item: d }
        })
        if (!ids.length) return

        this._exposedIds = this._exposedIds || {}
        var pending = ids.filter(function (x) { return !that._exposedIds[x.id] })
        if (!pending.length) return

        var report = function (x) {
            if (that._exposedIds[x.id]) return
            that._exposedIds[x.id] = true
            track('daily_card_expose', {
                item_id: x.item.id,
                pos: x.pos,
                title: x.item.title,
                mode: reportMode
            })
        }

        // 兜底：没有 IntersectionObserver（极低版本基础库）就退回老口径 ——
        // 只报前 3 条。宁可数据粗略，也不能一条都不报、让曝光口径断掉。
        if (!wx.createIntersectionObserver) {
            setTimeout(function () { pending.slice(0, 3).forEach(report) }, 300)
            return
        }

        // ---- 必须等渲染完再 observe（这里踩过坑）----
        //
        // setData 是异步的：applyDaily / loadMoreDaily 里 setData 之后
        // 立刻调本函数，此刻新卡片的节点**还没挂到渲染树上**。
        // 这时候 observer.observe('.daily-card-7') 不会报错，
        // 它只是「观察一个不存在的节点」，回调永远不触发 ——
        // 页面看着一切正常，埋点却一条都没有，而且 console 里干干净净。
        // 这种静默失败只能靠 review 抓，运行时没有任何征兆。
        //
        // wx.nextTick 保证在下一帧渲染完成后执行；老基础库没有它就用
        // 小延迟兜底。
        var startObserve = function () {
            var observer = wx.createIntersectionObserver(that, {
                // 阈值 0：只要卡片露出一像素就算看见。
                // 设成 0.5 的话，长文本卡片要滑到屏幕中间才计曝光，
                // 而家长快速划过时可能只看清标题 —— 那也是「确实看到了」。
                thresholds: [0]
            })
            observer.relativeToViewport({ bottom: 0 })

            var remain = pending.length
            var done = function () {
                remain -= 1
                if (remain <= 0) {
                    // 全部报完才断开。**不能用固定时长强制断开** ——
                    // 家长慢慢滑的时候，第 6 张卡可能十几秒后才进屏幕，
                    // 3 秒就断等于漏报。断开是为了省资源，不是赶时间。
                    try { observer.disconnect() } catch (e) { }
                }
            }

            pending.forEach(function (x) {
                observer.observe('.daily-card-' + x.id, function (res) {
                    if (that._exposedIds[x.id]) return
                    if (res.intersectionRatio <= 0) return
                    report(x)
                    done()
                })
            })

            that._exposeObservers = that._exposeObservers || []
            that._exposeObservers.push(observer)
        }

        if (wx.nextTick) {
            wx.nextTick(startObserve)
        } else {
            setTimeout(startObserve, 50)
        }
    },

    // 页面卸载/pull 重置时清理观察器
    _clearExposeObservers() {
        (this._exposeObservers || []).forEach(function (o) {
            try { o.disconnect() } catch (e) { }
        })
        this._exposeObservers = []
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

    // ============================================================
    // 上课日常：游标分页 + 失败降级 mock
    // ============================================================
    //
    // 游标（_cursor）是**上一页最后一条的 id**，存在实例属性里而不是 data：
    // 它不参与渲染，进 data 只会每翻一页触发一次无意义的 setData。
    //
    // 为什么用游标不用页码：家长正划着的时候运营发了一条新动态，
    // 页码分页会让整体偏移一格，第 2 页把第 1 页最后一条再发一遍。
    // 游标锚在 id 上，插入新记录不影响已翻过的位置。

    // 是否正在请求第一页（防重复）
    _loadingFirst: false,
    // 是否正在请求下一页（防重复）
    _loadLock: false,
    // 游标
    _cursor: null,

    // shouldReport：本次取数要不要上报曝光埋点。
    // onLoad 传 true（首屏曝光），下拉刷新传 false（否则分母虚高）。
    fetchDaily(shouldReport) {
        var that = this
        if (this._loadingFirst) return Promise.resolve()
        this._loadingFirst = true

        // 重置游标和曝光记录：这是「第一页」，后面的翻页都从这重新算。
        // 不重置 _exposedIds 的话，下拉刷新后新发的动态会被当成
        // 「已经报过」（id 碰巧相同的话），曝光就漏了。
        this._cursor = null
        this._exposedIds = {}
        this._autoLoadTries = 0
        this._clearExposeObservers()

        this.setData({
            dailyLoading: true,
            dailyEmpty: false,
            dailyLoadError: false,
            dailyHasMore: true
        })

        return request({ url: api.learning, showLoading: false, showError: false })
            .then((res) => {
                var list = (res && res.daily) || []
                if (list.length) {
                    that._cursor = res.next_cursor || null
                    that.applyDaily(that.mergeCollected(list), 'api', shouldReport, {
                        hasMore: !!res.has_more,
                        fallback: false
                    })
                    return
                }
                // 接口通了但后台一条都没录：这不是错误，是「还没发内容」。
                // 此时列表留空、显示占位文案，不要拿假数据糊弄家长。
                that.setData({
                    daily_list: [],
                    dailyEmpty: true,
                    dailyLoading: false,
                    dailyHasMore: false
                })
            })
            .catch((err) => {
                if (err && err.type === 'business') {
                    // 后端明确报错：如实记录，同时降级 mock 保住页面可看
                    console.log('[首页] 上课日常接口业务失败:', err.code, err.msg)
                } else {
                    console.log('[首页] 上课日常接口不可用，降级本地 mock')
                }
                that.applyDaily(that.mergeCollected(MOCK_DAILY), 'fallback', shouldReport, {
                    hasMore: false,
                    fallback: true
                })
            })
            .then(function () {
                that._loadingFirst = false
            })
    },

    // 触底加载下一页
    loadMoreDaily() {
        var that = this
        if (this._loadLock) return
        if (!this._cursor) {
            // 没有游标说明后端没给下一页（老接口或数据异常）。
            // 直接标记到底，不要发一个没有 before 的请求 ——
            // 那会拿回第一页，看起来像「加载更多却重复了前几条」。
            this.setData({ dailyHasMore: false })
            return
        }
        this._loadLock = true
        this.setData({ dailyLoadingMore: true, dailyLoadError: false })

        var url = api.learning + '?before=' + this._cursor
        var startIndex = this.data.daily_list.length

        return request({ url: url, showLoading: false, showError: false })
            .then((res) => {
                var list = (res && res.daily) || []
                that._cursor = res.next_cursor || null

                if (!list.length) {
                    that.setData({
                        dailyLoadingMore: false,
                        dailyHasMore: false
                    })
                    return
                }

                // 追加而不是替换。重复 id 要过滤掉 ——
                // 理论上游标分页不会重复，但万一后端游标逻辑出错，
                // 界面出现两张一样的卡比少一条更难解释。
                var existing = {}
                that.data.daily_list.forEach(function (d) { existing[String(d.id)] = true })
                var fresh = list.filter(function (d) { return !existing[String(d.id)] })

                var merged = that.data.daily_list.concat(that.mergeCollected(fresh))
                that.setData({
                    daily_list: merged,
                    dailyLoadingMore: false,
                    dailyHasMore: !!res.has_more
                })

                // 触底追加的卡片**也要报曝光**（它们同样是首次进屏幕）。
                // startIndex 告诉 reportDailyExpose「从第几条开始算新增」，
                // pos 用全局位置，这样漏斗里能看出「第 3 条比第 12 条曝光多」。
                that.reportDailyExpose(merged, 'api', startIndex)

                // 补一页之后可能还是不够一屏（卡片矮、配图少），再探一次。
                // _autoLoadTries 会兜住，最多补 3 轮。
                that._maybeAutoLoad()
            })
            .catch((err) => {
                console.log('[首页] 加载更多失败:', err && err.type, err && err.code)
                // 失败不把已加载的内容清掉 —— 那等于惩罚用户。
                // 只在底部显示可点重试。
                that.setData({
                    dailyLoadingMore: false,
                    dailyLoadError: true
                })
            })
            .then(function () {
                that._loadLock = false
            })
    },

    // 唯一写 daily_list 的地方（第一页专用）。
    // 曝光上报绑在这里，保证「页面显示的是谁的数据，就按谁的 mode 报一次」。
    applyDaily(list, mode, shouldReport, flags) {
        var extra = flags || {}
        this.setData({
            daily_list: list,
            dailyEmpty: false,
            dailyLoading: false,
            dailyHasMore: extra.hasMore !== false,
            dailyFallback: !!extra.fallback
        })
        if (shouldReport) {
            // 第一页从第 0 条开始算新增
            this.reportDailyExpose(list, mode, 0)
        }
        // 首屏数据不够长时，触底回调永远不会触发（页面根本没得滚），
        // 后面的内容就永远出不来。这里主动探一下。
        this._maybeAutoLoad()
    },

    // 内容不足一屏时，onReachBottom 不会触发 —— 主动补一页。
    //
    // 什么情况会遇到：后台把 LearningPost 配得少（比如只有 6 条，
    // 第一页刚好取完），或卡片变矮（配图全被运营删了）。
    // 表现是首页底部空着，家长以为「就这么多」，其实后面还有。
    //
    // 判断方式：页脚节点是否已经进入屏幕。进了 = 没有可滚动空间。
    // **必须防死循环**：如果每页只有 1 条且都很矮，会连翻十几页。
    // _autoLoadTries 限制最多补 3 次，剩下的交给用户手动滑。
    _autoLoadTries: 0,
    _maybeAutoLoad() {
        var that = this
        if (!this.data.dailyHasMore) return
        // 一张卡加页脚的最小高度约 200rpx（100px）。
        // 连续补 3 次还填不满一屏，说明内容真的很少，不该无限翻下去。
        if (this._autoLoadTries >= 3) return

        // 等渲染完成再量高度
        var measure = function () {
            var query = wx.createSelectorQuery()
            query.select('.daily-foot').boundingClientRect()
            query.exec(function (res) {
                var rect = res && res[0]
                if (!rect) return
                var win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
                // 页脚底边已经在视口内，说明列表没填满一屏
                if (rect.bottom <= win.windowHeight && that.data.dailyHasMore) {
                    that._autoLoadTries += 1
                    that.loadMoreDaily()
                }
            })
        }

        if (wx.nextTick) wx.nextTick(measure)
        else setTimeout(measure, 100)
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
