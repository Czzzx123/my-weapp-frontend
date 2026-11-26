// 微信订阅消息授权
//
// 这里只做一件事：请家长授权「上课签到提醒」，拿到一次发送额度。
//
// ============================================================
// 必须理解「一次性订阅」的语义，否则整个功能会做错
// ============================================================
//
// 一次性订阅 = **点一次「允许」，只能收一条消息**。发完额度归零，
// 下次要发必须再请家长点一次。它不是一个「开关」。
//
// 所以：
//   ① 不能做「开启后永久有效」的开关 UI —— 那是在骗用户。
//      文案必须说清「本次授权可收 1 条」。
//   ② 不能一进小程序就弹（微信明令禁止诱导/骚扰，会封消息能力）。
//      只能在用户自己点按钮时弹，且必须有明确的上下文
//      （「上课提醒」这个按钮点了，弹出请求授权，语义是连贯的）。
//   ③ 家长点「拒绝」是正常选择，不能反复骚扰。记下拒绝状态，
//      下次进页面只显示「点击开启」，不主动弹。
//
// 长期订阅（一次授权永久有效）只对政务民生、医疗、交通、金融、教育等
// 线下公共服务的少数二级类目开放，个人主体拿不到。本项目后续会移植到
// 公司主体、以教育类目申请，届时可以平滑换成长订阅 —— 所以调用方式
// 统一走这里，将来只改这一个文件。
//
// 参考：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html

var STORAGE_KEY = 'wl_subscribe_checkin'

// 读本地记录的授权状态：'accept' | 'reject' | ''
// 只用于决定「文案怎么说」，不作为「能不能发」的依据 ——
// 能不能发只有微信服务器知道（额度可能已经用掉了）。
function getLocalState() {
    try {
        return wx.getStorageSync(STORAGE_KEY) || ''
    } catch (e) {
        return ''
    }
}

function setLocalState(state) {
    try {
        wx.setStorageSync(STORAGE_KEY, state)
    } catch (e) { }
}

// 请家长授权上课提醒。
//
// 参数 tmplId：模板 id，由后端 /smart/notify_config/ 下发。
// 返回 Promise，resolve 一个结果对象：
//   { ok: true,  state: 'accept' }      家长允许了
//   { ok: false, state: 'reject' }      家长拒绝了（正常选择，不是错误）
//   { ok: false, state: 'banned' }      模板被后台封禁/删除了，要运营处理
//   { ok: false, state: 'error', msg }  其它异常
//
// **绝不 reject**：调用方大多是「顺手点一下」的场景，
// 让每个调用点都写 catch 只会让人漏掉。
function requestCheckin(tmplId) {
    return new Promise(function (resolve) {
        if (!tmplId) {
            resolve({ ok: false, state: 'noconfig', msg: '后台还没有配置提醒模板' })
            return
        }

        // 低版本基础库没有这个 API。2.4.4 之前不支持订阅消息，
        // 直接调会报错而不是弹窗。
        if (!wx.requestSubscribeMessage) {
            resolve({ ok: false, state: 'unsupported', msg: '当前微信版本过低，请升级后再试' })
            return
        }

        wx.requestSubscribeMessage({
            tmplIds: [tmplId],
            success: function (res) {
                // res[tmplId] 的取值：
                //   accept  → 允许，获得一次发送额度
                //   reject  → 拒绝
                //   ban     → 模板被封禁（运营问题，不是用户问题）
                //   filter  → 模板标题命中过滤（很少见）
                var answer = res && res[tmplId]

                if (answer === 'accept') {
                    setLocalState('accept')
                    resolve({ ok: true, state: 'accept' })
                    return
                }

                if (answer === 'ban') {
                    // 这种不是家长的选择，是配置问题。要显式说出来，
                    // 否则线上表现是「点了没反应」。
                    resolve({ ok: false, state: 'banned', msg: '提醒模板已失效，请联系机构处理' })
                    return
                }

                // reject / filter 都按「这次没同意」处理。
                // filter 不记成 reject：它不是用户的意愿，下次还该正常提示。
                if (answer === 'reject') setLocalState('reject')
                resolve({ ok: false, state: answer === 'reject' ? 'reject' : 'filter' })
            },
            fail: function (err) {
                // 常见失败：errCode 20004 用户关闭了订阅消息总开关（在设置里关的），
                // 这种只能引导去设置页开，弹不出授权框。
                var code = (err && err.errCode) || 0
                var msg = '授权失败'
                if (code === 20004) {
                    msg = '你在微信设置里关闭了订阅消息，需要先去开启'
                } else if (err && err.errMsg) {
                    msg = err.errMsg
                }
                resolve({ ok: false, state: 'error', code: code, msg: msg })
            }
        })
    })
}

module.exports = {
    requestCheckin: requestCheckin,
    getLocalState: getLocalState
}
