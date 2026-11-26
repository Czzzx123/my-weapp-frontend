import { track } from '../../utils/track'

// 服务菜单：**纯前端配置，不走接口**。
//
// 为什么撤掉了原来的 /smart/menu/ 请求：
//   ① 后端从来没有这个接口，每次进页面都是 404 → 走 catch → 弹
//      「当前展示离线数据」toast。一个每次必然出现的提示等于噪音。
//   ② 菜单里 icon 是 TDesign 组件名、color/bg 是十六进制色值，
//      这些是前端的呈现细节，让后端存反而是错的分层。
//   ③ 菜单项要跟着前端页面一起上下线，写在接口里会多出一次版本对齐。
//
// 真要动态化，正确做法是后端只下发「哪些功能已开放」的开关，
// 图标与配色仍留在前端按 id 映射。
//
// 字段约定：id-唯一标识, name-菜单名, icon-TDesign图标名, color-图标颜色,
//          bg-图标底色, path-跳转页面(空=建设中), status-状态, badge-红点数字
var MENU_LIST = [
    { id: 1, name: '课表',     icon: 'calendar',  color: '#2F6BED', bg: '#EAF1FF', path: '/pages/schedule/schedule?from=menu', badge: 0 },
    { id: 2, name: '上课记录', icon: 'history',   color: '#2BB673', bg: '#E8F8F1', path: '/pages/records/records?from=menu', badge: 0 },
    { id: 3, name: '请假',     icon: 'time',      color: '#2BB673', bg: '#E8F8F1', path: '', badge: 0 },
    { id: 4, name: '作业',     icon: 'edit',      color: '#7B61FF', bg: '#F1EDFF', path: '', badge: 0 },
    { id: 5, name: '课时查询', icon: 'chart-bar', color: '#FF9A4D', bg: '#FFF3E8', path: '/pages/hours/hours?from=menu', badge: 0 },
    { id: 6, name: '成绩单',   icon: 'file-1',    color: '#F5544B', bg: '#FEEDEC', path: '', badge: 0 },
    { id: 7, name: '电子相册', icon: 'image',     color: '#2F6BED', bg: '#EAF1FF', path: '', badge: 0 },
    { id: 8, name: '积分商城', icon: 'gift',      color: '#FF9A4D', bg: '#FFF3E8', path: '', badge: 0 }
]

Page({
    data: {
        menu_list: MENU_LIST
    },

    onLoad() {},

    onShow() {
        track('page_view')   // page_id 自动取当前页 route；3s 去重
    },

    // 下拉刷新：菜单是本地配置，没有可刷新的数据。
    // 保留这个手势只为「下拉不会卡住」——不给回调，下拉动画会一直转。
    onPullDownRefresh() {
        wx.stopPullDownRefresh()
    },

    // 点击：有效路径直接跳；建设中统一用 Modal 说明（不再用 Toast）
    // menu_click 字段严格对齐 PM 契约：has_path(Boolean) + status ∈ 'online'|'coming'
    onMenuTap(e) {
        var item = e.currentTarget.dataset.item
        var hasPath = !!item.path
        track('menu_click', {
            item_id: item.id,
            name: item.name,
            has_path: hasPath,
            status: hasPath ? 'online' : 'coming'
        })
        if (hasPath) {
            wx.navigateTo({ url: item.path })
            return
        }
        track('dev_modal_view', { item_id: item.id, name: item.name, action: 'show' })
        wx.showModal({
            title: '敬请期待',
            content: '「' + item.name + '」正在开发中，上线后第一时间通知您',
            confirmText: '我知道了',
            confirmColor: '#2F6BED',
            showCancel: false,
            success: function () {
                track('dev_modal_view', { item_id: item.id, name: item.name, action: 'confirm' })
            }
        })
    }
})
