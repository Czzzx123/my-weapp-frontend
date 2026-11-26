// 课表页
//
// 数据来源：GET /smart/schedule/（需登录）
// 后端只返回「每周固定」安排，形如「周三 16:00-18:00」，
// 把「周三」落成具体日期是本页的事（见 nextDateOf）。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

var WEEK = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 把「周几」换算成「最近一次要上的那天」。
//
// 后端只存 weekday（周三）不存日期，这是刻意的：排课每周重复，
// 存具体日期就要为每周批量生成一批记录，还得有定时任务去滚。
// 展示时再落到某一天，信息量是一样的。
//
// 口径是「往后找最近的一次，含今天」：
//   今天周三，查周三 → 今天（diff=0）
//   今天周三，查周一 → 下周一（diff=5），而不是「这周一」（已经上过了）
// 这与家长的直觉一致 —— 想知道的是「孩子下次什么时候上课」。
function nextDateOf(weekday) {
    var now = new Date()
    // JS 的 getDay()：0=周日 … 6=周六；后端的 weekday：1=周一 … 7=周日
    var today = now.getDay() === 0 ? 7 : now.getDay()
    var diff = weekday - today
    if (diff < 0) diff += 7
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
    return { date: d, diff: diff, today: today }
}

// 「今天 / 明天 / 后天 / 本周三 / 下周三」
//
// 前三项单独说，因为家长最常问的就是这两天。
// 同一周内（周一为一周之始）说「本周X」，跨周说「下周X」：
//   diff 最多 6，today + diff 最多 13；
//   today + diff <= 7 必定在同一周，8~13 必定在下周，不会出现「下下周」。
function dayLabel(weekday, diff, today) {
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff === 2) return '后天'
    return (today + diff <= 7 ? '本周' : '下周') + WEEK[weekday].slice(1)
}

// 'HH:MM' → 分钟数，仅用于同一天内按时段排序
function minutesOf(t) {
    var parts = String(t || '0:0').split(':')
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)
}

// 把接口的扁平列表整理成「按天分组的纵向列表」。
//
// 两个刻意的处理：
//   ① 按「还有几天」排序，不是按周一到周日。周日晚上打开时，
//      周一的课显然应该排在最前面，而不是被甩到最后。
//   ② 同一时段下若有多个孩子（兄弟姐妹报同一个班），合并成一张卡，
//      而不是同一节课出现两遍 —— 看起来像上了两次课。
function buildGroups(list) {
    var today = new Date().getDay() === 0 ? 7 : new Date().getDay()
    var dayMap = {}
    var dayOrder = []

    ;(list || []).forEach(function (raw) {
        var w = raw.weekday
        if (!dayMap[w]) {
            var info = nextDateOf(w)
            dayMap[w] = {
                weekday: w,
                weekday_label: WEEK[w] || raw.weekday_label || '',
                diff: info.diff,
                day_label: dayLabel(w, info.diff, today),
                date_text: (info.date.getMonth() + 1) + '月' + info.date.getDate() + '日',
                is_today: info.diff === 0,
                items: [],
                // session_id → 在 items 里的下标，用来合并兄弟姐妹
                _index: {}
            }
            dayOrder.push(w)
        }

        var day = dayMap[w]
        var key = String(raw.session_id)
        var exist = day._index[key]

        if (exist !== undefined) {
            // 同一时段已有卡片：只把新孩子的名字拼上去
            var it = day.items[exist]
            if (it.student_names.indexOf(raw.student_name) < 0) {
                it.student_names += '、' + raw.student_name
                it.student_count += 1
            }
            it.is_multi = it.student_count > 1
            return
        }

        var item = {
            session_id: raw.session_id,
            class_name: raw.class_name || '',
            course_name: raw.course_name || '',
            teacher: raw.teacher || '',
            room: raw.room || '',
            start_time: raw.start_time || '',
            end_time: raw.end_time || '',
            status: raw.status || 'normal',
            status_label: raw.status_label || '',
            substitute_teacher: raw.substitute_teacher || '',
            is_suspended: raw.status === 'suspended',
            is_multi: false,
            student_count: 1,
            student_names: raw.student_name || '',
            // 排序键：同一天内按开始的分钟数
            _sort: minutesOf(raw.start_time)
        }
        day._index[key] = day.items.length
        day.items.push(item)
    })

    var groups = dayOrder.map(function (w) { return dayMap[w] })

    groups.forEach(function (g) {
        g.items.sort(function (a, b) { return a._sort - b._sort })
        g.count = g.items.length
        delete g._index
    })

    groups.sort(function (a, b) {
        if (a.diff !== b.diff) return a.diff - b.diff
        return a.weekday - b.weekday
    })

    return groups
}

Page({
    data: {
        logged: false,
        loading: true,
        groups: [],
        // 加载失败（网络问题、后端没起）与「真的没课」要分开表达，
        // 混在一起会让家长以为孩子被退班了
        loadError: false,
        // 有无停课时段，用于顶部提示
        hasSuspended: false
    },

    onLoad() {
        this.setData({ logged: !!getApp().globalData.userInfo })
    },

    onShow() {
        track('page_view', { page_id: 'schedule' })
        var logged = !!getApp().globalData.userInfo
        this.setData({ logged: logged })
        if (logged) {
            this.fetchSchedule()
        } else {
            this.setData({ loading: false, groups: [] })
        }
    },

    onPullDownRefresh() {
        if (!this.data.logged) {
            wx.stopPullDownRefresh()
            return
        }
        this.fetchSchedule().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    fetchSchedule() {
        var that = this
        return request({ url: api.schedule, showLoading: false, showError: false })
            .then(function (res) {
                var list = (res && res.schedule) || []
                var groups = buildGroups(list)
                var suspended = groups.some(function (g) {
                    return g.items.some(function (it) { return it.is_suspended })
                })
                that.setData({
                    groups: groups,
                    loading: false,
                    loadError: false,
                    hasSuspended: suspended
                })
            })
            .catch(function (err) {
                // 登录过期交给 utils/request 统一处理（会清 token 并回登录页），
                // 这里只管「登录着但拿不到数据」的情况
                if (err && err.type === 'business' && err.code === 401) {
                    that.setData({ logged: false, loading: false })
                    return
                }
                console.log('[课表] 加载失败:', err && err.type, err && err.msg)
                that.setData({ loading: false, loadError: true })
            })
    },

    gotoLogin() {
        wx.navigateTo({ url: '/pages/login/login?from=schedule' })
    },

    retry() {
        this.setData({ loading: true, loadError: false })
        this.fetchSchedule()
    },

    // 停课时段点了给个说明：只标灰不解释，家长会以为页面坏了。
    // 正常时段点了不做任何事 —— 不要给「点开看详情」的错觉，
    // 详细调课信息本来就在老师那儿，页面上没得可看。
    onLessonTap(e) {
        var item = e.currentTarget.dataset.item || {}
        if (!item.is_suspended) return
        wx.showModal({
            title: '这节课停课了',
            content: '「' + item.class_name + '」' + item.start_time + '-' + item.end_time +
                     ' 的时段暂时停课。具体复课时间请联系老师确认，不要按此时间前往。',
            confirmText: '知道了',
            confirmColor: '#2F6BED',
            showCancel: false
        })
        track('feedback_action', { type: 'suspended_tip', page_id: 'schedule' })
    },

    onShareAppMessage() {
        return {
            title: '未蓝科技 · 孩子的上课时间表',
            path: '/pages/index/index'
        }
    }
})
