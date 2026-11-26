// 环境配置：开发环境 vs 生产环境
// 切换方式：把下面 env 改成 'prod' 即可指向线上后端
var env = 'dev'

// 开发环境后端地址，按调试方式二选一：
//   - 微信开发者工具模拟器：用 127.0.0.1（模拟器和后端在同一台电脑）
//   - 真机调试 / 手机预览：必须用电脑的**局域网 IP**，因为手机上的 127.0.0.1 指向手机自己
// 局域网 IP 会随 WiFi 变化，换网络后要重新查（ipconfig）并改这里。
// 后端也要同时满足两条：runserver 监听 0.0.0.0，且 .env 的 DJANGO_ALLOWED_HOSTS 含该 IP。
var LAN_IP = '10.1.67.108'

var CONFIG = {
    dev: {
        // 真机调试时把它改成 true；只在电脑模拟器里调试时保持 false
        useLan: true,
        lanUrl: 'http://' + LAN_IP + ':8000/smart',
        localUrl: 'http://127.0.0.1:8000/smart'
    },
    prod: {
        rootUrl: 'https://your-domain.com/smart'
    }
}

var devCfg = CONFIG[env === 'prod' ? 'prod' : 'dev']
var rootUrl = devCfg.useLan === true ? devCfg.lanUrl : (devCfg.localUrl || devCfg.rootUrl)

// 所有后端接口路由
module.exports = {
    // 基础地址（给 request 工具用）
    base: rootUrl,

    // 基础内容
    banner: rootUrl + '/banner/',
    notice: rootUrl + '/notice/',
    // 首页「上课日常」：课程/活动的公开宣传内容，匿名可读
    learning: rootUrl + '/learning/',

    // 登录（阶段 1 已完成）
    send_sms: rootUrl + '/user/send_sms/',
    login: rootUrl + '/user/login/',
    profile: rootUrl + '/user/profile/',
    bind_mobile: rootUrl + '/user/bind_mobile/',
    update_profile: rootUrl + '/user/update_profile/',
    logout: rootUrl + '/user/logout/',

    // 教务（阶段 3，只读，必须登录）
    // schedule：每周固定课表，不含临时调课
    // hours：每个孩子每个班的课时额度与剩余（余额由流水实时汇总）
    // lesson_records：上课记录，孩子哪天上了哪节课、扣了几课时（只含消课）
    schedule: rootUrl + '/schedule/',
    hours: rootUrl + '/hours/',
    lesson_records: rootUrl + '/lesson_records/',
    // notify_config：订阅消息模板 id 下发（匿名可读，模板没配时 enabled=false）
    notify_config: rootUrl + '/notify_config/',

    // 请假（写操作，必须登录）
    // 口径：提交即生效（不走审批）、开课后不能请、不扣课时
    leave_submit: rootUrl + '/leave/submit/',
    leave_cancel: rootUrl + '/leave/cancel/',
    leave_list: rootUrl + '/leave/list/',

    // 服务菜单（后端未就绪，前端降级 mock）
    menu: rootUrl + '/menu/'
}
