var api = require('../../config/settings')
var request = require('../../utils/request')
var upload = require('../../utils/upload')

var app = getApp()

var NICKNAME_MAX = 32

Component({
  options: {
    // 允许外部页面通过 class 微调样式
    addGlobalClass: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    // 默认展示名（后端算好的「张小明家长」或「家长」），用作输入框 placeholder
    defaultName: {
      type: String,
      value: '家长'
    },
    // 已有的昵称，用户之前设过就带出来
    nicknameValue: {
      type: String,
      value: ''
    },
    // 已有头像 URL
    avatarValue: {
      type: String,
      value: ''
    }
  },

  data: {
    nickname: '',
    // 本地预览用的临时路径；为空表示沿用已有头像
    avatarPreview: '',
    // chooseAvatar 拿到的临时路径，提交时才上传
    tempAvatarPath: '',
    submitting: false
  },

  observers: {
    'visible, nicknameValue, avatarValue': function (visible, nicknameValue, avatarValue) {
      if (!visible) return
      // 每次打开都同步一次外部值，避免上次编辑到一半的内容残留
      this.setData({
        nickname: nicknameValue || '',
        avatarPreview: avatarValue || '',
        tempAvatarPath: '',
        submitting: false
      })
    }
  },

  methods: {
    // 头像选择：只存临时路径 + 本地预览，等点「保存」再上传。
    // 这样用户改了主意直接关掉，不会在服务器留下垃圾文件。
    onChooseAvatar(e) {
      var tempPath = e && e.detail && e.detail.avatarUrl
      if (!tempPath) {
        // 基础库 2.24.4 起，未通过微信内容安全检测不会返回路径
        wx.showToast({ title: '这张图片没有通过审核，请换一张', icon: 'none' })
        return
      }
      this.setData({
        avatarPreview: tempPath,
        tempAvatarPath: tempPath
      })
    },

    onNicknameInput(e) {
      this.setData({ nickname: e.detail.value })
    },

    // blur 时微信可能把不合规的内容清空，这里跟着同步，
    // 避免界面上显示着字、提交时却是空的
    onNicknameBlur(e) {
      var val = (e.detail.value || '').trim()
      if (val !== this.data.nickname) {
        this.setData({ nickname: val })
      }
    },

    onSubmit(e) {
      // 用 form 提交时收集到的值，而不是 this.data.nickname。
      //
      // 关键点：**必须信任 form 的空值**。
      // 微信在 blur 阶段异步做内容安全检测，未通过会直接清空 input；
      // 清空动作不会再触发 bindinput，所以 this.data.nickname 里留的还是
      // 那个违规的旧值。如果这里在「form 值为空」时 fallback 回 data，
      // 就等于把刚被拦下的昵称又提交上去了 —— 整套兜底完全失效。
      var hasFormValue = !!(e && e.detail && e.detail.value)
      var fromForm = hasFormValue ? (e.detail.value.nickname || '') : this.data.nickname
      var nickname = String(fromForm || '').trim()

      // 区分「用户自己删空」和「被微信清空」：
      // 手动删除会触发 bindinput，data.nickname 同步变空；
      // 而内容安全清空不触发 bindinput，data 里仍是旧的非空值。
      // 后者要明确告知用户，否则他会以为自己的输入莫名其妙消失了。
      if (hasFormValue && !nickname && this.data.nickname) {
        this.setData({ nickname: '' })
        wx.showToast({ title: '昵称未通过审核，请换一个', icon: 'none' })
        return
      }

      if (nickname.length > NICKNAME_MAX) {
        wx.showToast({ title: '昵称最多 ' + NICKNAME_MAX + ' 个字', icon: 'none' })
        return
      }

      if (this.data.submitting) return
      this.setData({ submitting: true })

      var that = this
      var payload = {}
      // 昵称为空时不提交 —— 后端 nickname 不接受空串，
      // 而「没填」本来就该走 placeholder 的默认值
      if (nickname) payload.nickname = nickname

      this.saveProfile(payload, this.data.tempAvatarPath)
        .then(function () {
          that.setData({ submitting: false })
          that.triggerEvent('done', { skipped: false })
        })
        .catch(function (err) {
          that.setData({ submitting: false })
          wx.showToast({
            title: (err && err.msg) || '保存失败，请重试',
            icon: 'none'
          })
        })
    },

    onSkip() {
      this.triggerEvent('done', { skipped: true })
    },

    onPopupVisibleChange(e) {
      // 用户点遮罩关闭，等同跳过
      if (!e.detail.visible) {
        this.triggerEvent('done', { skipped: true })
      }
    },

    // 先传头像（如果有），再提交昵称。合并成一次请求会更好，
    // 但 uploadFile 和 json 请求是两个通道，只能分两步。
    saveProfile(payload, tempAvatarPath) {
      var that = this

      if (!tempAvatarPath) {
        if (!payload.nickname) {
          // 什么都没改，直接当完成处理
          return Promise.resolve()
        }
        return request({
          url: api.update_profile,
          method: 'POST',
          data: payload,
          showLoading: true,
          showError: false
        }).then(function (data) {
          app.applyProfilePayload(data)
        })
      }

      return upload({
        url: api.update_profile,
        filePath: tempAvatarPath,
        name: 'avatar',
        formData: payload.nickname ? { nickname: payload.nickname } : {},
        loadingText: '保存中'
      }).then(function (data) {
        app.applyProfilePayload(data)
      })
    }
  }
})
