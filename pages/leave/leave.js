// 请假页
//
// 入口：课表卡片上的「请假」按钮，带 session_id / lesson_date / student_id 进来。
// 提交接口：POST /smart/leave/submit/（需登录）
//
// 三个设计取舍
// ------------
// 1. **日期由课表页算好带进来，这里不重算。**
//    课表页本来就在算「周三 → 12月2日」，这里再算一遍就是第二份真相，
//    两处算法一旦不一致，家长看到的日期和实际请假的日期就不是同一天。
// 2. **默认原因给几个快捷选项，也允许自己写。**
//    家长在手机上打字很累。给「发烧/有事/临时安排」这类高频词，
//    点一下就行；想写详细再点输入框。
// 3. **提交成功的反馈要说清「会发生什么」。**
//    家长最担心的是「我请了假，老师知道吗？还会催我送孩子吗？」。
//    所以成功弹窗明确说「老师那边看得到」「今天不会再提醒你」。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

// 快捷原因。不用问「是不是病假」这类分类 ——
// 家长只想快点填完，分类是老师那边的统计需求，不该让家长承担。
var QUICK_REASONS = ['孩子不舒服', '家里有事', '临时安排', '天气原因']

Page({
    data: {
        logged: false,
        sessionId: 0,
        lessonDate: '',
        studentId: 0,

        // 展示用：从课表页带过来，避免这里再查一次接口
        studentName: '',
        className: '',
        timeText: '',
        dateText: '',

        reason: '',
        quickReasons: QUICK_REASONS,
        submitting: false,
        // 提交成功后就地变成「已请假」态，不跳走 ——
        // 跳走的话家长会不确定到底成没成功。
        done: false
    },

    onLoad(options) {
        var logged = !!getApp().globalData.userInfo
        var date = options.date || ''
        this.setData({
            logged: logged,
            sessionId: parseInt(options.session_id, 10) || 0,
            studentId: parseInt(options.student_id, 10) || 0,
            lessonDate: date,
            studentName: decodeURIComponent(options.student_name || ''),
            className: decodeURIComponent(options.class_name || ''),
            timeText: decodeURIComponent(options.time_text || ''),
            dateText: formatDate(date)
        })
        track('page_view', { page_id: 'leave' })
    },

    gotoLogin() {
        wx.navigateTo({ url: '/pages/login/login?from=leave' })
    },

    onQuickReason(e) {
        var text = e.currentTarget.dataset.text || ''
        // 再点一次取消选择 —— 家长点错了得有办法退回去，
        // 而这里没有「清空」按钮，再点是唯一自然的操作
        this.setData({ reason: this.data.reason === text ? '' : text })
    },

    onReasonInput(e) {
        this.setData({ reason: e.detail.value })
    },

    onSubmit() {
        var that = this
        if (that.data.submitting) return

        if (!that.data.sessionId || !that.data.lessonDate || !that.data.studentId) {
            // 参数缺失基本只发生在「直接改 URL 进来」或页面被复用时。
            // 不提示就静默失败，家长会以为请假成功了。
            wx.showToast({ title: '页面信息不完整，请回课表重新进入', icon: 'none' })
            return
        }

        that.setData({ submitting: true })
        track('feedback_action', {
            type: 'leave_submit',
            page_id: 'leave',
            has_reason: !!that.data.reason
        })

        request({
            url: api.leave_submit,
            method: 'POST',
            data: {
                student_id: that.data.studentId,
                session_id: that.data.sessionId,
                lesson_date: that.data.lessonDate,
                reason: that.data.reason
            }
        })
            .then(function (res) {
                that.setData({ submitting: false, done: true })
                wx.showModal({
                    title: '已请假',
                    // 说清两件事：老师看得到、不会再催。
                    // 家长最担心的就是「请了假老师不知道」和「还来催我」。
                    content: '老师那边已经看到了。这节课不会扣课时，' +
                             '也不会再提醒你送孩子。如果孩子最后还是去了，' +
                             '老师正常签到就行。',
                    confirmText: '知道了',
                    confirmColor: '#2F6BED',
                    showCancel: false,
                    success: function () {
                        wx.navigateBack({ delta: 1 })
                    }
                })
                return res
            })
            .catch(function (err) {
                that.setData({ submitting: false })
                var msg = (err && err.msg) || '提交失败，请稍后再试'
                wx.showToast({ title: msg, icon: 'none', duration: 2500 })
            })
    },

    onShareAppMessage() {
        return { title: '未蓝科技', path: '/pages/index/index' }
    }
})

// 'YYYY-MM-DD' → '12月2日 周三'
//
// 自己拼而不是用 toLocaleDateString：小程序各基础库对 locale 的支持不一致，
// iOS 上偶尔会返回 "2026/12/2" 这种格式，日期文案就乱了。
function formatDate(text) {
    if (!text) return ''
    var parts = String(text).split('-')
    if (parts.length !== 3) return text

    var y = parseInt(parts[0], 10)
    var m = parseInt(parts[1], 10)
    var d = parseInt(parts[2], 10)
    if (!y || !m || !d) return text

    // new Date(y, m-1, d).getDay() 拿到的就是这一天是周几，
    // 与后端 weekday 无关 —— 后端存的是「每周三」，这里是「12月2日」。
    var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    var w = week[new Date(y, m - 1, d).getDay()]
    return m + '月' + d + '日 ' + w
}
