// 环境配置：开发环境 vs 生产环境
// 切换方式：把下面 env 改成 'prod' 即可指向线上后端
var env = 'dev'

var CONFIG = {
    dev: {
        rootUrl: 'http://127.0.0.1:8000/smart'
    },
    prod: {
        rootUrl: 'https://your-domain.com/smart'
    }
}

var rootUrl = CONFIG[env].rootUrl

// 所有后端接口路由
module.exports = {
    // 基础地址（给 request 工具用）
    base: rootUrl,

    welcome: rootUrl + '/welcome/',
    banner: rootUrl + '/banner/',
    collection: rootUrl + '/collection/',
    area: rootUrl + '/area/',
    statistics: rootUrl + '/statistics/',
    face: rootUrl + '/face/',
    voice: rootUrl + '/voice/',
    notice: rootUrl + '/notice/',
    activity: rootUrl + '/activity/',
    send_sms: rootUrl + '/user/send_sms/',
    login: rootUrl + '/user/login/',
    quick_login: rootUrl + '/user/quick_login',
    join: rootUrl + '/join/join/',
    // 服务菜单
    menu: rootUrl + '/menu/'
}
