// 微信订阅消息授权
//
// 这里只做一件事：请家长授权「上课提醒」，拿到发送额度。
//
// ============================================================
// 必须理解「一次性订阅」的语义，否则整个功能会做错
// ============================================================
//
// 一次性订阅 = **点一次「允许」，只能发一条消息**。发完额度归零。
// 它不是一个「开启后永久有效」的开关。
//
// 但有两个机制能让它「用起来像长期」：
//
//   ① **一次弹窗可以勾多个模板，各自 +1 额度。**
//      所以我们把「上课前提醒」和「签到通知」合在一次弹窗里，
//      家长点一次「允许」，两个模板各得一条 —— 比弹两次转化率高得多。
//
//   ② **勾了「总是保持以上选择，不再询问」之后，
//      再调用不会弹窗，静默保持之前的选择。**
//      也就是说家长第二次点「开启」时不会有任何打扰。
//      但这个勾选框**只在真机显示，模拟器上没有** ——
//      开发和测试时看不到它属正常，不要据此以为功能没做。
//
// 所以：
//   ① 文案写「点一次，之后每次上课都会提醒」是**不准确**的。
//      准确的说法是「每次授权可收若干条」，但家长不关心额度机制。
//      折中：文案说清「会收到什么」，不承诺「永久」，也不提「1 条」
//      这种会让家长觉得「给一条有什么意义」的说法。
//   ② 不能一进小程序就弹（微信明令禁止诱导/骚扰，会封消息能力）。
//      只能在用户自己点按钮时弹，且必须有明确的上下文。
//   ③ 家长点「拒绝」是正常选择，不能反复骚扰。记下拒绝状态，
//      下次进页面只显示「点击开启」，不主动弹。
//
// 关于「为什么不按额度记账」
// --------------------------
// 曾考虑建一张表记「家长还有几条额度」，并在页面提示续额。
// 放弃了，原因：微信**没有查询剩余额度的接口**，本地记账必然
// 与真实状态漂移（家长换手机、清缓存、在别处授权都算不到），
// 记错的账比不记账更糟 —— 会出现「显示还有 3 条但一条都发不出去」。
// 现在按「发不出去就算了」处理：43101 当正常状态，家长打开
// 小程序看课表/上课记录，信息一样拿得到。
//
// 将来整体迁移到公司主体后，服务号模板消息能做到「关注后随时发」，
// 届时换掉这个文件即可，调用方不用改。
//
// 参考：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html

var STORAGE_KEY = 'wl_subscribe_checkin'
// 「弹过几次」与「上次弹的时间」，用来控制频率
var PROMPT_COUNT_KEY = 'wl_subscribe_prompt_count'
var PROMPT_LAST_KEY = 'wl_subscribe_prompt_last'
// 「别再来烦我」——用户明确拒绝过 N 次或点了「不再提示」
var PROMPT_MUTE_KEY = 'wl_subscribe_prompt_mute'

// 首页弹层最多主动出现几次。
//
// 为什么要有上限：微信把「反复弹订阅框」明确列为骚扰行为，
// 屡犯会被收回消息能力 —— 那等于把整个提醒功能砸了。
// 3 次是经验值：正常用户第 1 次就会决定，愿意等的人第 2、3 次也够了。
// 之后只剩课表页那个常驻按钮，用户想开自己点。
var MAX_PROMPT = 3
// 两次主动弹之间至少隔多久（毫秒）。一天最多烦一次。
var PROMPT_INTERVAL = 24 * 60 * 60 * 1000

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

function _readNum(key) {
    var v = wx.getStorageSync(key)
    return typeof v === 'number' ? v : 0
}

// 首页该不该主动弹订阅引导。
//
// 四个条件全满足才弹：
//   ① 后台配了模板（没配弹了也是白弹）
//   ② 用户没点过「不再提示」
//   ③ 还没授权过（授权过就不用再劝了）
//   ④ 弹的次数 < MAX_PROMPT，且距上次 ≥ PROMPT_INTERVAL
//
// **不满足第 ③ 条时返回 false 很重要**：已授权还反复弹，用户会觉得
// 这小程序有病。额度耗尽时的补授权走课表页那个常驻按钮，
// 那是用户主动点，不构成骚扰。
function shouldPrompt() {
    try {
        if (wx.getStorageSync(PROMPT_MUTE_KEY)) return false
        if (getLocalState() === 'accept') return false
        if (_readNum(PROMPT_COUNT_KEY) >= MAX_PROMPT) return false
        var last = _readNum(PROMPT_LAST_KEY)
        if (last && Date.now() - last < PROMPT_INTERVAL) return false
        return true
    } catch (e) {
        // 读存储失败就不弹 —— 宁可少弹一次，也不要因为异常反复弹
        return false
    }
}

// 记一次「弹过了」。**必须在真正弹给用户看的时候调**，
// 不能提前调 —— 否则弹层因为别的原因没显示出来，次数也白白扣掉了。
function markPrompted() {
    try {
        wx.setStorageSync(PROMPT_COUNT_KEY, _readNum(PROMPT_COUNT_KEY) + 1)
        wx.setStorageSync(PROMPT_LAST_KEY, Date.now())
    } catch (e) { }
}

// 用户点了「不再提示」。永久生效，只有清缓存才会恢复。
function mutePrompt() {
    try {
        wx.setStorageSync(PROMPT_MUTE_KEY, 1)
    } catch (e) { }
}

// 请家长授权上课提醒。
//
// 参数 tmplIds：模板 id 数组，由后端 /smart/notify_config/ 下发。
//   通常含两个：上课前提醒 + 签到通知。传数组是因为微信支持
//   一次弹窗勾多个 —— 分成两次弹，第二次的拒绝率明显更高。
//
// 兼容：老版本调用方传的是单个字符串，这里统一成数组。
//
// 返回 Promise，resolve 一个结果对象：
//   { ok: true,  state: 'accept', accepted: ['tmplA'] }  至少一个模板被允许
//   { ok: false, state: 'reject' }                       全部被拒绝（正常选择）
//   { ok: false, state: 'banned' }                       模板被后台封禁/删除
//   { ok: false, state: 'error', msg }                   其它异常
//
// **绝不 reject**：调用方大多是「顺手点一下」的场景，
// 让每个调用点都写 catch 只会让人漏掉。
function requestRemind(tmplIds) {
    return new Promise(function (resolve) {
        var ids = []
        if (Object.prototype.toString.call(tmplIds) === '[object Array]') {
            ids = tmplIds.filter(function (t) { return !!t })
        } else if (tmplIds) {
            ids = [tmplIds]
        }

        if (!ids.length) {
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
            tmplIds: ids,
            success: function (res) {
                // res[tmplId] 的取值：
                //   accept  → 允许，该模板获得一次发送额度
                //   reject  → 拒绝
                //   ban     → 模板被封禁（运营问题，不是用户问题）
                //   filter  → 模板标题命中过滤（很少见）
                var accepted = []
                var rejected = 0
                var banned = false

                ids.forEach(function (id) {
                    var answer = res && res[id]
                    if (answer === 'accept') accepted.push(id)
                    else if (answer === 'ban') banned = true
                    else if (answer === 'reject') rejected += 1
                })

                if (accepted.length) {
                    setLocalState('accept')
                    // banned 单独带出去：哪怕有一个模板成功了，
                    // 被 ban 的那个也是运营必须处理的问题（模板被删/违规下架）。
                    // 吞掉的话线上表现是「有一个通知永远收不到，但没人知道为什么」。
                    resolve({
                        ok: true,
                        state: 'accept',
                        accepted: accepted,
                        banned: banned
                    })
                    return
                }

                if (banned) {
                    // 这种不是家长的选择，是配置问题。要显式说出来，
                    // 否则线上表现是「点了没反应」。
                    resolve({ ok: false, state: 'banned', msg: '提醒模板已失效，请联系机构处理' })
                    return
                }

                // 全部 reject（或 filter，都不是用户意愿）按「这次没同意」处理。
                // filter 不记成 reject：它不是用户的意愿，下次还该正常提示。
                if (rejected === ids.length) setLocalState('reject')
                resolve({ ok: false, state: rejected === ids.length ? 'reject' : 'filter' })
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
    requestRemind: requestRemind,
    // 兼容旧调用点（签到通知单模板时期的名字），等价于 requestRemind
    requestCheckin: requestRemind,
    getLocalState: getLocalState,
    shouldPrompt: shouldPrompt,
    markPrompted: markPrompted,
    mutePrompt: mutePrompt
}
