const rootUrl = 'http://10.1.67.108:8000/smart'


//表示到处--》在任意JS中可以导入 这个是所有发生网络请求，获取后端数据的路由
module.exports = {
    welcome: rootUrl + '/welcome/',
    banner: rootUrl + '/banner/',
    collection: rootUrl + '/collection/',
    area: rootUrl + '/area/',
    statstics: rootUrl + '/statistics/',
    face:rootUrl+'/face/'
}