// 环境配置：开发环境 vs 生产环境
// 切换方式：把下面 env 改成 'prod' 即可指向线上后端
var env = 'dev'

// 开发环境后端地址，按调试方式二选一：
//   - 微信开发者工具模拟器：用 127.0.0.1（模拟器和后端在同一台电脑）
//   - 真机调试 / 手机预览：必须用电脑的**局域网 IP**，因为手机上的 127.0.0.1 指向手机自己
// 局域网 IP 会随 WiFi 变化，换网络后要重新查（ipconfig）并改这里。
// 后端也要同时满足两条：runserver 监听 0.0.0.0，且 .env 的 DJANGO_ALLOWED_HOSTS 含该 IP。
var LAN_IP = '10.1.97.181'

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

    // 登录（阶段 1 已完成）
    send_sms: rootUrl + '/user/send_sms/',
    login: rootUrl + '/user/login/',
    profile: rootUrl + '/user/profile/',
    bind_mobile: rootUrl + '/user/bind_mobile/',
    logout: rootUrl + '/user/logout/',

    // 服务菜单（后端未就绪，前端降级 mock）
    menu: rootUrl + '/menu/'
}
