// 请假记录
//
// 数据来源：GET /smart/leave/list/（需登录）
//
// 为什么要单独一页
// ----------------
// 家长提交完请假就退出小程序了。第二天想起「我请的是哪天来着」，
// 在课表上找不到任何痕迹 —— 课表显示的是「每周三有课」，
// 看不出这一周请没请。记录页就是回答这个问题的。
//
// 已撤销的记录也列出来：家长需要看到「我确实撤过一次」，
// 否则会反复怀疑自己操作到底成没成功。
import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

Page({
    data: {
        logged: false,
        loading: true,
        loadError: false,
        groups: [],
        // 有没有「可撤销」的记录，用来决定底部提示说不说撤销这回事
        hasActive: false
    },

    onLoad() {
        this.setData({ logged: !!getApp().globalData.userInfo })
    },

    onShow() {
        track('page_view', { page_id: 'leave_records' })
        var logged = !!getApp().globalData.userInfo
        this.setData({ logged: logged })
        if (logged) {
            this.fetchList()
        } else {
            this.setData({ loading: false, groups: [] })
        }
    },

    onPullDownRefresh() {
        if (!this.data.logged) {
            wx.stopPullDownRefresh()
            return
        }
        this.fetchList().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    fetchList() {
        var that = this
        return request({ url: api.leave_list, showLoading: false, showError: false })
            .then(function (res) {
                var list = (res && res.leaves) || []
                var groups = buildGroups(list)
                that.setData({
                    groups: groups,
                    loading: false,
                    loadError: false,
                    hasActive: list.some(function (x) { return x.status === 'active' })
                })
            })
            .catch(function (err) {
                if (err && err.type === 'business' && err.code === 401) {
                    that.setData({ logged: false, loading: false })
                    return
                }
                console.log('[请假记录] 加载失败:', err && err.type, err && err.msg)
                that.setData({ loading: false, loadError: true })
            })
    },

    gotoLogin() {
        wx.navigateTo({ url: '/pages/login/login?from=leave_records' })
    },

    // 撤销请假。
    //
    // 必须二次确认：撤销是「有后果」的操作 —— 撤了之后系统会重新开始
    // 提醒家长送孩子。点错一次就变成「明明请了假还天天被催」。
    onCancel(e) {
        var that = this
        var item = e.currentTarget.dataset.item || {}
        if (!item.id) return

        wx.showModal({
            title: '撤销这次请假？',
            content: '撤销后：这节课会恢复正常提醒，也可能被算作要上课。' +
                     '如果只是改原因，不用撤销，直接联系老师更省事。',
            confirmText: '撤销请假',
            confirmColor: '#F5544B',
            cancelText: '不撤了',
            success: function (r) {
                if (!r.confirm) return
                that.doCancel(item.id)
            }
        })
    },

    doCancel(leaveId) {
        var that = this
        request({
            url: api.leave_cancel,
            method: 'POST',
            data: { leave_id: leaveId }
        })
            .then(function () {
                wx.showToast({ title: '已撤销', icon: 'success' })
                track('feedback_action', { type: 'leave_cancel', page_id: 'leave_records' })
                that.fetchList()
            })
            .catch(function (err) {
                wx.showToast({
                    title: (err && err.msg) || '撤销失败，请稍后再试',
                    icon: 'none',
                    duration: 2500
                })
            })
    },

    // 从记录页回到课表：家长看完记录常想顺手再请一次假
    gotoSchedule() {
        wx.navigateTo({ url: '/pages/schedule/schedule?from=leave_records' })
    },

    retry() {
        this.setData({ loading: true, loadError: false })
        this.fetchList()
    },

    onShareAppMessage() {
        return { title: '未蓝科技', path: '/pages/index/index' }
    }
})

// 按「日期 + 孩子」分组？不 —— 按日期倒序平铺即可。
//
// 考虑过按孩子分组（和课时页一致），但请假记录通常一次只有一两条，
// 分组反而让页面显得空。平铺 + 日期倒序最符合「最近请过哪几次」的阅读需求。
function buildGroups(list) {
    return (list || []).map(function (raw) {
        var isActive = raw.status === 'active'
        return {
            id: raw.id,
            student_name: raw.student && raw.student.name ? raw.student.name : '',
            class_name: raw.course_class ? raw.course_class.name : '',
            teacher: raw.course_class ? raw.course_class.teacher : '',
            date_text: formatDate(raw.date),
            time_text: (raw.start_time || '') + '-' + (raw.end_time || ''),
            reason: raw.reason || '',
            status: raw.status,
            status_label: raw.get_status_display || '',
            is_active: isActive,
            // 已撤销的不给撤销按钮 —— 点了也只会报「已经撤销过了」
            can_cancel: isActive
        }
    })
}

// 'YYYY-MM-DD' → '12月2日 周三'
function formatDate(text) {
    if (!text) return ''
    var parts = String(text).split('-')
    if (parts.length !== 3) return text

    var y = parseInt(parts[0], 10)
    var m = parseInt(parts[1], 10)
    var d = parseInt(parts[2], 10)
    if (!y || !m || !d) return text

    var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    var w = week[new Date(y, m - 1, d).getDay()]
    return m + '月' + d + '日 ' + w
}
