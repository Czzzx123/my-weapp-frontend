// 课时页
//
// 数据来源：GET /smart/hours/（需登录）
// 每个孩子每个班一条，余额由后端按流水实时汇总后下发。
//
// **前端一律不自己算百分比**：后端已经算好 remain_percent 并夹到 0~100。
// 自己算要处理 total=0 的除零（报名时忘填额度是必然会发生的），
// 还要处理超额消课为负时进度条变成负宽度。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

// 课时紧张线：剩余不足 20% 就提醒。定 20% 而不是 10%，
// 因为家长从看到提醒到联系老师续费，通常要一两天，10% 可能已经上完了。
var WARN_PERCENT = 20

// 按孩子分组：一个孩子可能报了好几个班，各自独立算额度。
//
// 为什么以孩子为外层而不是以班：家长看的是「我家老大的课时还剩多少」，
// 报了两个班时把两个班的剩余量摆在一起才有意义 —— 只列一个班，
// 家长会以为另一个班的课时不见了。
function groupByStudent(list) {
    var map = {}
    var order = []

    ;(list || []).forEach(function (raw) {
        var sid = String(raw.student_id)
        if (!map[sid]) {
            var name = raw.student_name || ''
            map[sid] = {
                student_id: raw.student_id,
                student_name: name,
                // 头像位只放一个字（姓）。WXML 里 name[0] 这类索引取值
                // 在不同基础库上表现不一致，取好再传。
                initial: name ? name.slice(0, 1) : '?',
                // 汇总：把所有班的剩余加起来。不同班课时不通用，
                // 所以这里只做「一眼看总量」的展示，具体要按班看。
                total: 0,
                remain: 0,
                has_warn: false,
                classes: [],
                _active_remain: 0
            }
            order.push(sid)
        }
        var g = map[sid]
        var remain = Number(raw.remain) || 0
        var total = Number(raw.total) || 0
        var pct = Number(raw.remain_percent)
        if (isNaN(pct)) pct = 0

        var isActive = raw.status === 'active'
        // 课时耗尽或紧张：只在读的班才提醒，已结课的不该催续费
        var isWarn = isActive && (remain <= 0 || pct < WARN_PERCENT)

        g.classes.push({
            enrollment_id: raw.enrollment_id,
            class_name: raw.class_name || '',
            course_name: raw.course_name || '',
            total: total,
            used: Number(raw.used) || 0,
            remain: remain,
            remain_percent: pct,
            unit_label: raw.unit_label || '课时',
            status: raw.status || 'active',
            status_label: raw.status_label || '',
            is_active: isActive,
            is_warn: isWarn,
            // 剩余为负 = 超额消课。不能只显示「-2」，家长看不懂。
            // over_count 在这里算好而不是 WXML 里写 `-item.remain`：
            // WXML 表达式能力有限，一元负号在某些基础库版本上不生效，
            // 会静默渲染成空字符串，看起来像「超用了 个课时」。
            is_over: remain < 0,
            over_count: remain < 0 ? -remain : 0,
            is_empty: remain === 0
        })

        g.total += total
        if (isActive) {
            g._active_remain += remain
            if (isWarn) g.has_warn = true
        }
        g.remain = g._active_remain
    })

    var groups = order.map(function (sid) {
        var g = map[sid]
        g.class_count = g.classes.length
        // 只有一个孩子时不显示孩子名分组头，省一层视觉噪音
        delete g._active_remain
        return g
    })

    // 有待处理的（课时紧张）排前面：家长打开这一页八成就是想确认这个
    groups.sort(function (a, b) {
        if (a.has_warn !== b.has_warn) return a.has_warn ? -1 : 1
        return String(a.student_id) < String(b.student_id) ? -1 : 1
    })

    return groups
}

Page({
    data: {
        logged: false,
        loading: true,
        groups: [],
        loadError: false,
        // 只有一个孩子时，孩子名不该做成大标题
        singleChild: false,
        // 有条目课时紧张时给一条顶部提示
        hasWarn: false
    },

    onLoad() {
        this.setData({ logged: !!getApp().globalData.userInfo })
    },

    onShow() {
        track('page_view', { page_id: 'hours' })
        var logged = !!getApp().globalData.userInfo
        this.setData({ logged: logged })
        if (logged) {
            this.fetchHours()
        } else {
            this.setData({ loading: false, groups: [] })
        }
    },

    onPullDownRefresh() {
        if (!this.data.logged) {
            wx.stopPullDownRefresh()
            return
        }
        this.fetchHours().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    fetchHours() {
        var that = this
        return request({ url: api.hours, showLoading: false, showError: false })
            .then(function (res) {
                var list = (res && res.hours) || []
                var groups = groupByStudent(list)
                var hasWarn = groups.some(function (g) { return g.has_warn })
                that.setData({
                    groups: groups,
                    singleChild: groups.length <= 1,
                    loading: false,
                    loadError: false,
                    hasWarn: hasWarn
                })
            })
            .catch(function (err) {
                if (err && err.type === 'business' && err.code === 401) {
                    that.setData({ logged: false, loading: false })
                    return
                }
                console.log('[课时] 加载失败:', err && err.type, err && err.msg)
                that.setData({ loading: false, loadError: true })
            })
    },

    gotoLogin() {
        wx.navigateTo({ url: '/pages/login/login?from=hours' })
    },

    retry() {
        this.setData({ loading: true, loadError: false })
        this.fetchHours()
    },

    // 课时不够了：明确说清「找谁」，不要只说「请联系机构」
    onWarnTap(e) {
        var item = e.currentTarget.dataset.item || {}
        var content = item.is_over
            ? '「' + item.class_name + '」已超出 ' + Math.abs(item.remain) + ' ' + item.unit_label +
              '。请尽快联系老师核对并补缴。'
            : '「' + item.class_name + '」只剩 ' + item.remain + ' ' + item.unit_label +
              '，建议尽快联系老师续费，以免影响孩子上课。'
        wx.showModal({
            title: item.is_over ? '课时已超用' : '课时不足',
            content: content,
            confirmText: '知道了',
            confirmColor: '#2F6BED',
            showCancel: false
        })
        track('feedback_action', { type: 'hours_low', page_id: 'hours' })
    },

    onShareAppMessage() {
        return {
            title: '未蓝科技 · 孩子的课时一目了然',
            path: '/pages/index/index'
        }
    }
})
