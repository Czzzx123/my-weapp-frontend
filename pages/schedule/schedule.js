// 课表页
//
// 数据来源：GET /smart/schedule/（需登录）
// 后端只返回「每周固定」安排，形如「周三 16:00-18:00」，
// 把「周三」落成具体日期是本页的事（见 nextDateOf）。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'
import subscribe from '../../utils/subscribe'

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

// Date → 'YYYY-MM-DD'
//
// **不能用 toISOString().slice(0,10)**：那个方法按 UTC 算，
// 东八区在 00:00~08:00 之间会退到前一天，家长半夜请假会请到昨天。
// 手拼本地年月日是唯一安全的做法。
function isoDate(d) {
    var m = d.getMonth() + 1
    var day = d.getDate()
    return d.getFullYear() + '-' +
        (m < 10 ? '0' + m : m) + '-' +
        (day < 10 ? '0' + day : day)
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
                // 请假接口要的是 YYYY-MM-DD。在这里就算好，
                // 不要在点击那一刻用 new Date() 重算 —— 页面可能已经开了很久
                // （家长切到别的应用再回来），重算会算出另一天。
                date_iso: isoDate(info.date),
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
            // 兄弟姐妹报同一个班时，请假得能分清给谁请。
            // 只拼名字不留 id 的话，是没法按下「请假」的。
            it.students.push({
                id: raw.student_id,
                name: raw.student_name || ''
            })
            it.is_multi = it.student_count > 1
            return
        }

        var item = {
            session_id: raw.session_id,
            // 请假要用：只留名字不够，接口要的是 student_id
            students: [{ id: raw.student_id, name: raw.student_name || '' }],
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

// 把「哪一天哪节课请过假」叠到课表卡片上。
//
// 为什么要叠这个：家长提交完请假返回课表，卡片如果和之前长得一模一样，
// 他没法确认自己到底请成没请 —— 而「请了假系统还来催」正是这次要解决的问题。
//
// 匹配必须三个字段全等：session_id + student_id + date。
//   · 只匹配 session_id → 上周请的假会标到这周
//   · 只匹配 date      → 同一天另一个时段的假会串到这节课上
// 两者都会让家长看到「明明没请假却显示已请假」，比不标更糟。
//
// **即使没有任何请假记录，也要走完整个循环**，把 has_leave / on_leave
// 显式设成 false。直接 return 的话这些字段是 undefined，
// 而 WXML 里 `data-on-leave="{{stu.on_leave ? 1 : 0}}"` 拿到 undefined
// 会传 '0'、`wx:if` 也判成假 —— 看起来「能用」，但只要哪天有人在
// JS 里写成 `=== false` 或 `!x` 取反，行为就会跟着数据有无而变。
function markLeaves(groups, leaves) {
    // key: 'sessionId|studentId|date' —— 拼字符串比嵌套对象好写也好调试
    var active = {}
    ;(leaves || []).forEach(function (x) {
        if (x.status !== 'active') return          // 撤销的不算
        active[x.session_id + '|' + (x.student && x.student.id) + '|' + x.date] = true
    })

    groups.forEach(function (g) {
        var dateKey = g.date_iso
        g.items.forEach(function (it) {
            var names = []
            it.students.forEach(function (s) {
                // 没有 date_iso 就一律按未请假处理，不要拿空串去拼 key ——
                // 空串会匹配到 date 也是空串的脏数据
                var hit = dateKey
                    ? !!active[it.session_id + '|' + s.id + '|' + dateKey]
                    : false
                s.on_leave = hit
                if (hit) names.push(s.name)
            })
            it.leave_names = names.join('、')
            it.has_leave = names.length > 0
            // 全员请假才把整张卡置灰；部分请假只是标记出来 ——
            // 全灰会让家长以为整个班停课了
            it.all_on_leave = it.has_leave && names.length === it.students.length
        })
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
        hasSuspended: false,
        // 订阅消息：模板 id 与是否可授权
        notifyTmplIds: [],
        notifyEnabled: false,
        // 家长上次的选择，只用来决定文案。accept 之后额度可能已用掉，
        // 所以不能理解成「已开启」。
        notifyState: ''
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
            this.loadNotifyConfig()
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
        // 课表和请假一起拉：请假状态要叠在卡片上（「已请假」标记），
        // 分两次串行拉会让卡片先渲染出来再跳一下，看着像闪。
        // 请假接口失败不影响课表 —— catch 成空数组，卡片照常显示。
        var leaves = request({
            url: api.leave_list, showLoading: false, showError: false
        }).catch(function () { return { leaves: [] } })

        return Promise.all([
            request({ url: api.schedule, showLoading: false, showError: false }),
            leaves
        ])
            .then(function (results) {
                var res = results[0]
                var leaveRes = results[1] || {}

                var list = (res && res.schedule) || []
                var groups = buildGroups(list)
                var suspended = groups.some(function (g) {
                    return g.items.some(function (it) { return it.is_suspended })
                })
                that.setData({
                    groups: markLeaves(groups, (leaveRes && leaveRes.leaves) || []),
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

    // 取订阅消息模板 id。
    // 模板 id 从后端下发，不写死在前端 —— 换模板只是改环境变量，不用发版。
    loadNotifyConfig() {
        var that = this
        return request({ url: api.notify_config, showLoading: false, showError: false })
            .then(function (res) {
                // tmpl_ids 是后端拼好的完整列表（上课前提醒 + 签到通知）。
                // 老版本后端没有这个字段，退回用单个 template_id 兜底，
                // 免得后端先上线、前端还没更新时按钮消失。
                var ids = (res && res.tmpl_ids) || []
                if (!ids.length && res && res.template_id) ids = [res.template_id]

                that.setData({
                    notifyTmplIds: ids,
                    notifyEnabled: !!(res && res.enabled),
                    notifyState: subscribe.getLocalState()
                })
            })
            .catch(function () {
                // 拿不到配置就不显示按钮。失败静默处理 ——
                // 「提醒」是附加功能，不该在课表页弹错误打断家长看课表。
                that.setData({ notifyEnabled: false })
            })
    },

    // 请家长授权上课提醒。
    //
    // 必须由用户点击触发（微信禁止自动弹）。
    //
    // 文案的取舍：不提「1 条」。家长看到「一次授权可收 1 条」会觉得
    // 这功能没意义 —— 而实际上一个弹窗能勾两个模板、各自拿一条额度，
    // 家长日常打开课表时还会再攒。说清「会收到什么」比解释额度机制有用。
    onNotifyTap() {
        var that = this
        if (!that.data.notifyEnabled) return

        track('feedback_action', { type: 'subscribe_request', page_id: 'schedule' })

        subscribe.requestRemind(that.data.notifyTmplIds).then(function (r) {
            that.setData({ notifyState: subscribe.getLocalState() })

            if (r.ok) {
                track('feedback_action', { type: 'subscribe_accept', page_id: 'schedule' })

                if (r.banned) {
                    // 部分模板被封禁：家长允许了，但有一条永远收不到。
                    // 这里必须说出来 —— 否则线上表现是「开启了却只收到一半」，
                    // 谁都不知道是模板被下架了。
                    wx.showModal({
                        title: '提醒部分开启',
                        content: '有一类提醒暂时不可用，我们已经在处理。' +
                                 '另一类通知可以正常收到。',
                        confirmText: '知道了',
                        confirmColor: '#2F6BED',
                        showCancel: false
                    })
                    return
                }

                // 不提「可收 N 条」。家长要的是「会不会提醒我」，
                // 讲额度机制只会让他觉得「给几条有什么意义」。
                wx.showModal({
                    title: '提醒已开启',
                    content: '开课前会提醒你，孩子签到成功后也会通知你。' +
                             '如果之后没收到，来这里再点一次就能恢复。',
                    confirmText: '知道了',
                    confirmColor: '#2F6BED',
                    showCancel: false
                })
                return
            }

            if (r.state === 'reject') {
                track('feedback_action', { type: 'subscribe_reject', page_id: 'schedule' })
                // 拒绝是正常选择，不追问、不二次弹窗
                wx.showToast({ title: '已取消，不影响查看课表', icon: 'none' })
                return
            }

            wx.showToast({ title: r.msg || '开启失败，请稍后再试', icon: 'none' })
        })
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

    // 点「请假」跳到请假页。
    //
    // 日期、时段、孩子都在跳转时带上，不让请假页自己查 ——
    // 请假页再算一次日期就有第二份真相，两处算法不一致时
    // 家长看到的日期和实际请假的日期就不是同一天，而且没人看得出来。
    onLeaveTap(e) {
        var ds = e.currentTarget.dataset
        var sessionId = parseInt(ds.sessionId, 10) || 0
        var studentId = parseInt(ds.studentId, 10) || 0
        var date = ds.date || ''

        if (!sessionId || !studentId || !date) {
            wx.showToast({ title: '课程信息不完整，请下拉刷新课表', icon: 'none' })
            return
        }

        // 已经请过假了 → 去记录页，那里能撤销。
        // 再开一次请假表单是没用的：后端幂等会返回原记录，
        // 家长填了一遍原因却发现什么都没变，会以为系统坏了。
        if (String(ds.onLeave) === '1') {
            track('feedback_action', { type: 'leave_view_exist', page_id: 'schedule' })
            wx.navigateTo({ url: '/pages/leave/records?from=schedule' })
            return
        }

        track('feedback_action', { type: 'leave_open', page_id: 'schedule' })

        var url = '/pages/leave/leave' +
            '?session_id=' + sessionId +
            '&student_id=' + studentId +
            '&date=' + encodeURIComponent(date) +
            '&student_name=' + encodeURIComponent(ds.studentName || '') +
            '&class_name=' + encodeURIComponent(ds.className || '') +
            '&time_text=' + encodeURIComponent(ds.timeText || '')
        wx.navigateTo({ url: url })
    },

    onShareAppMessage() {
        return {
            title: '未蓝科技 · 孩子的上课时间表',
            path: '/pages/index/index'
        }
    }
})