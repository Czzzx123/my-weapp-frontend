Page({
    data: {
        userInfo: {
            name: '吴彦祖',
            score: 100
        },
    },
    getPhoneNumber() {

    },
    handleOtherLogin() {
        wx.navigateTo({
            url: '/pages/login/login'
        })
    }
})