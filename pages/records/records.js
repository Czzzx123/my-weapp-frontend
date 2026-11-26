// 上课记录页
//
// 数据来源：GET /smart/lesson_records/（需登录）
// 返回孩子每一次「消课」记录：哪天、哪节课、扣了几课时。
//
// 和课时页的区别（这两个页最容易混）：
//   课时页 = 现在还剩多少（余额）
//   上课记录 = 过去上了什么（流水）
// 家长查「孩子这周到底去没去上课」「是不是被多扣了」看的是这一页。
//
// 三条渲染约定：
//   1. 日期分组的月份/周几全部在这里算好。WXML 里做日期运算不可靠，
//      new Date() 在 iOS 上对 '2026-11-26' 这种格式解析会失败（返回 Invalid Date）。
//   2. 撤销的记录照样显示，但标成灰色 + "已撤销"。直接过滤掉的话，
//      家长记得「那天明明扣了一课时」，现在不见了，会以为系统偷偷改账。
//   3. 扣的课时数用绝对值展示（-1 → "1"），符号交给前缀文案表达。
//      WXML 里的 {{-item.delta}} 一元负号在部分基础库上静默失效。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

var WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// '2026-11-26' → { y, m, d, weekday, key }
// 手写拆分而不是 new Date(str)：iOS 对 'YYYY-MM-DD' 的解析不保证成功。
function parseDate(str) {
    var parts = String(str || '').split('-')
    var y = parseInt(parts[0], 10)
    var m = parseInt(parts[1], 10)
    var d = parseInt(parts[2], 10)
    if (!y || !m || !d) return null
    var dt = new Date(y, m - 1, d)
    return {
        y: y,
        m: m,
        d: d,
        weekday: WEEK_LABEL[dt.getDay()] || '',
        key: String(str)
    }
}

// 今天 / 昨天用词代替日期，家长一眼能懂。其他日期给「11月26日」。
function dayLabel(info, todayStr, yesterdayStr) {
    if (info.key === todayStr) return '今天'
    if (info.key === yesterdayStr) return '昨天'
    return info.m + '月' + info.d + '日'
}

function todayKey(offset) {
    var now = new Date()
    now.setDate(now.getDate() - (offset || 0))
    var m = now.getMonth() + 1
    var d = now.getDate()
    return now.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d)
}

// 按上课日期分组，同一天的多节课放一组。
// 为什么按日期而不是按班级分组：家长回忆的锚点是「上周三他去没去」，
// 而不是「Python 班他一共上了几次」。
function groupByDate(records) {
    var map = {}
    var order = []
    var tk = todayKey(0)
    var yk = todayKey(1)

    ;(records || []).forEach(function (raw) {
        var info = parseDate(raw.lesson_date)
        if (!info) return

        if (!map[info.key]) {
            map[info.key] = {
                date: info.key,
                day: dayLabel(info, tk, yk),
                full: info.y + '年' + info.m + '月' + info.d + '日',
                weekday: info.weekday,
                count: 0,
                items: []
            }
            order.push(info.key)
        }

        var g = map[info.key]
        var delta = Number(raw.delta) || 0
        g.items.push({
            id: raw.id,
            student_name: raw.student_name || '',
            class_name: raw.class_name || '',
            course_name: raw.course_name || '',
            start_time: raw.start_time || '',
            weekday_label: raw.weekday_label || '',
            // delta 是负数（消课）。WXML 里取绝对值要写 -item.delta，
            // 一元负号不可靠，所以这里算好正数 abs_delta。
            abs_delta: delta < 0 ? -delta : delta,
            is_revoked: !!raw.is_revoked,
            operator: raw.operator || '',
            create_time: raw.create_time || ''
        })
        g.count += 1
    })

    return order.map(function (k) { return map[k] })
}

Page({
    data: {
        logged: false,
        loading: true,
        groups: [],
        loadError: false,
        // 孩子筛选：有多个孩子时显示切换
        students: [],
        activeStudentId: '',
        // 统计条：本月上了几次
        totalCount: 0,
        monthCount: 0
    },

    onLoad() {
        this.setData({ logged: !!getApp().globalData.userInfo })
        // 支持从课时页带 ?student_id= 进来，直接定位到某个孩子
        var q = this.options || {}
        if (q.student_id) {
            this.setData({ activeStudentId: String(q.student_id) })
        }
    },

    onShow() {
        track('page_view', { page_id: 'lesson_records' })
        var logged = !!getApp().globalData.userInfo
        this.setData({ logged: logged })
        if (logged) {
            this.fetchRecords()
        } else {
            this.setData({ loading: false, groups: [] })
        }
    },

    onPullDownRefresh() {
        if (!this.data.logged) {
            wx.stopPullDownRefresh()
            return
        }
        this.fetchRecords().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    fetchRecords() {
        var that = this
        var url = api.lesson_records
        // 只传自己名下的 id。后端也会校验（传别人的返回 403），
        // 这里传是为了少传无用数据。
        if (that.data.activeStudentId) {
            url += '?student_id=' + encodeURIComponent(that.data.activeStudentId)
        }

        return request({ url: url, showLoading: false, showError: false })
            .then(function (res) {
                var records = (res && res.records) || []
                var groups = groupByDate(records)

                // 孩子列表从记录里反推，不额外请求一次接口。
                // 代价是「没上过课的孩子」不会出现在筛选里 —— 但那也没有筛选意义。
                var seen = {}
                var students = []
                records.forEach(function (r) {
                    var sid = String(r.student_id)
                    if (seen[sid]) return
                    seen[sid] = 1
                    students.push({
                        id: sid,
                        name: r.student_name || '',
                        initial: (r.student_name || '?').slice(0, 1)
                    })
                })

                // 本月上了几次课：月初到现在，排除已撤销
                var now = new Date()
                var prefix = now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1)
                var monthCount = records.filter(function (r) {
                    return !r.is_revoked && String(r.lesson_date).indexOf(prefix) === 0
                }).length

                that.setData({
                    groups: groups,
                    students: students,
                    totalCount: records.length,
                    monthCount: monthCount,
                    loading: false,
                    loadError: false
                })
            })
            .catch(function (err) {
                if (err && err.type === 'business' && err.code === 401) {
                    that.setData({ logged: false, loading: false })
                    return
                }
                console.log('[上课记录] 加载失败:', err && err.type, err && err.msg)
                that.setData({ loading: false, loadError: true })
            })
    },

    // 切换孩子。列表接口按 student_id 过滤，切回来时不传参数。
    onStudentTap(e) {
        var sid = String(e.currentTarget.dataset.sid || '')
        // 再点一次当前孩子 = 取消筛选，回到全部
        var next = sid === this.data.activeStudentId ? '' : sid
        var that = this
        that.setData({ activeStudentId: next, loading: true })
        track('tab_switch', { page_id: 'lesson_records', tab: next ? 'student_' + next : 'all' })
        that.fetchRecords()
    },

    // 点开一条看详情：签到时间、操作人这些不需要常驻在列表里，
    // 但核对账目时又确实要能看到。
    //
    // 这里**不靠 \n 换行**：wx.showModal 的 content 在模拟器上换行会被
    // 折叠成空格（真机行为也不统一），挤成一整段很难读。
    // 改成用标点分隔的一句话，换不换行都读得通。
    onItemTap(e) {
        var item = e.currentTarget.dataset.item || {}
        var parts = []

        var head = item.class_name
        if (item.course_name) head += '「' + item.course_name + '」'
        parts.push(head)

        if (item.weekday_label && item.start_time) {
            parts.push(item.weekday_label + ' ' + item.start_time)
        }
        parts.push('扣 ' + item.abs_delta + ' 课时')
        if (item.create_time) parts.push('签到时间 ' + item.create_time)
        if (item.operator) parts.push('操作人 ' + item.operator)

        var content = parts.join('，') + '。'
        if (item.is_revoked) {
            content += '\n这条记录已撤销，课时已退回。'
        }

        wx.showModal({
            title: item.is_revoked ? '已撤销的签到' : '上课签到',
            content: content,
            confirmText: '知道了',
            confirmColor: '#2F6BED',
            showCancel: false
        })
        track('feedback_action', { type: 'lesson_record_detail', page_id: 'lesson_records' })
    },

    gotoLogin() {
        wx.navigateTo({ url: '/pages/login/login?from=lesson_records' })
    },

    gotoHours() {
        wx.navigateTo({ url: '/pages/hours/hours?from=lesson_records' })
    },

    retry() {
        this.setData({ loading: true, loadError: false })
        this.fetchRecords()
    },

    onShareAppMessage() {
        return {
            title: '未蓝科技 · 孩子的每次上课都有记录',
            path: '/pages/index/index'
        }
    }
})
