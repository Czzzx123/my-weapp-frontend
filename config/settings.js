const rootUrl = 'http://127.0.0.1:8000/smart'


//表示到处--》在任意JS中可以导入 这个是所有发生网络请求，获取后端数据的路由
module.exports = {
    welcome: rootUrl + '/welcome/',
    banner: rootUrl + '/banner/',
    collection: rootUrl + '/collection/',
    area: rootUrl + '/area/',
    statstics: rootUrl + '/statistics/',
    face: rootUrl + '/face/',
    voice: rootUrl + '/voice/',
    notice: rootUrl + '/notice/',
    activity: rootUrl + '/activity/',
    send_sms: rootUrl + '/user/send_sms/',
    login: rootUrl + '/user/login/',
    quick_login: rootUrl + '/user/quick_login',
    join: rootUrl + '/join/join/'
}