import api from '../../config/settings'
import request from '../../utils/request'
import { track } from '../../utils/track'

var app = getApp()

// 本地 mock 数据（后端接口未就绪时降级使用）
// 字段约定：id-唯一标识, name-菜单名, icon-TDesign图标名, color-图标颜色,
//          bg-图标底色, path-跳转页面(空=建设中), status-状态, badge-红点数字
var MOCK_MENU = [
    { id: 1, name: '课表',     icon: 'calendar',  color: '#2F6BED', bg: '#EAF1FF', path: '', badge: 0 },
    { id: 2, name: '请假',     icon: 'time',      color: '#2BB673', bg: '#E8F8F1', path: '', badge: 0 },
    { id: 3, name: '作业',     icon: 'edit',      color: '#7B61FF', bg: '#F1EDFF', path: '', badge: 0 },
    { id: 4, name: '课时查询', icon: 'chart-bar', color: '#FF9A4D', bg: '#FFF3E8', path: '', badge: 0 },
    { id: 5, name: '成绩单',   icon: 'file-1',    color: '#F5544B', bg: '#FEEDEC', path: '', badge: 0 },
    { id: 6, name: '电子相册', icon: 'image',     color: '#2F6BED', bg: '#EAF1FF', path: '', badge: 0 },
    { id: 7, name: '积分商城', icon: 'gift',      color: '#FF9A4D', bg: '#FFF3E8', path: '', badge: 0 }
]

Page({
    data: {
        menu_list: MOCK_MENU
    },

    onLoad() {
        this.fetchMenu()
    },

    onShow() {
        track('page_view')   // page_id 自动取当前页 route；3s 去重
    },

    // 下拉刷新（activity.json 已开启 enablePullDownRefresh）
    onPullDownRefresh() {
        this.fetchMenu().then(function () {
            wx.stopPullDownRefresh()
        })
    },

    // 接口优先、失败降级 mock（utils/request 统一封装）
    fetchMenu() {
        var that = this
        return request({ url: api.menu, showLoading: false, showError: false })
            .then((res) => {
                var list = res && (res.data || res)
                if (list && list.length) {
                    that.setData({ menu_list: list.slice(0, 8) })
                }
            })
            .catch(() => {
                // 接口不可用，降级本地 mock 数据：必须让用户知道当前是离线数据（CR-E02）
                console.log('[菜单] 后端接口未就绪，使用本地 mock 数据')
                wx.showToast({ title: '当前展示离线数据', icon: 'none' })
            })
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
