// index.js
import api from "../../config/settings"
import request from "../../utils/request"
import { track } from "../../utils/track"

// 公告关闭状态按日记忆
function todayKey() {
    var d = new Date()
    return 'notice_closed_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

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
        // 上课日常（暂时写死，后续改为从后端获取）
        daily_list: [
            { id: 1, date: '10月18日', course: 'Python课堂', theme: 'blue',   title: '猜数字小游戏完成',   content: '今天的Python课堂，同学们完成了猜数字小游戏的编写，大家都非常投入，下课了还意犹未尽。', likes: 24, collected: false },
            { id: 2, date: '10月16日', course: 'Scratch创意', theme: 'mint',  title: '小组动画作品展示',   content: 'Scratch创意编程课，孩子们小组合作完成了动画故事作品，每个小组都上台展示了自己的创意。', likes: 18, collected: false },
            { id: 3, date: '10月14日', course: '机器人搭建', theme: 'purple', title: '自动避障小车搭建成功', content: '机器人搭建课堂，同学们学习了齿轮传动原理，成功搭建了可以自动避障的小车。', likes: 31, collected: false }
        ]
    },

    onLoad() {
        this.loadCollected()
        this.initNotice()
        this.reportDailyExpose()
        this.fetchBanner()
    },

    onShow() {
        track('page_view', { page_id: 'index' })
    },

    // 下拉刷新（index.json 已开启 enablePullDownRefresh）
    onPullDownRefresh() {
        var that = this
        this.fetchBanner().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    // 读取本地收藏状态，合并进列表（WXML 不支持 indexOf，故落到 item.collected 字段）
    loadCollected() {
        var ids = wx.getStorageSync('collected_daily') || []
        var list = this.data.daily_list.map(function (d) {
            d.collected = ids.indexOf(d.id) >= 0
            return d
        })
        this.setData({ daily_list: list })
    },

    // 上课日常卡片曝光
    // 【V1.1 数据口径约束（产品侧变更台账）】后端就绪后必须与本 fallback 互斥，禁止双报：
    //   ① 接口成功且返回 daily 数据 → 只按返回数据上报一次，mode 传 'api'，onLoad 不再上报；
    //   ② 接口失败降级 mock → 才走本 fallback 上报一次，mode 传 'fallback'。
    // 双报会让曝光漏斗分母虚高、曝光→收藏/分享归因失真。
    reportDailyExpose() {
        var that = this
        setTimeout(function () {
            that.data.daily_list.slice(0, 3).forEach(function (item, index) {
                track('daily_card_expose', {
                    item_id: item.id,
                    pos: index,
                    title: item.title,
                    mode: 'fallback'
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
            .catch(() => {
                // 后端未就绪，保持 mock 数据
            })
    },

    gotoActivity() {
        wx.switchTab({ url: '/pages/activity/activity' })
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
        var id = e.currentTarget.dataset.id
        var ids = wx.getStorageSync('collected_daily') || []
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
            if (d.id === id) d.collected = collected
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
            var id = e.target.dataset.id
            item = this.data.daily_list.find(function (d) { return d.id === id })
            track('daily_share', { item_id: id })
        }
        track('feedback_action', { type: 'share', page_id: 'index' })
        return {
            title: item ? ('【' + item.course + '】' + item.content.slice(0, 20) + '…') : '未蓝科技 · 记录孩子每一步成长',
            path: '/pages/index/index'
        }
    }
})
