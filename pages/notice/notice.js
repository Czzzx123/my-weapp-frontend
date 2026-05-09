import api from '../../config/settings'
Page({
  data: {
    noticeList: [
      {
        title: '公告标题1',
        create_time: '2024-04-25',
        content: '公告内容描述1，公告内容描述1，公告内容描述1。', // 可以根据实际情况添加更多内容
        img: '/images/notice/notice1.jpg' // 图片路径，根据实际情况修改
      },
      {
        title: '公告标题2',
        create_time: '2024-04-26',
        content: '公告内容描述2，公告内容描述2，公告内容描述2。', // 可以根据实际情况添加更多内容
        img: '/images/notice/notice2.jpg' // 图片路径，根据实际情况修改
      },
      // 可以添加更多社区公告数据
    ]
  },

  // 页面加载完成，向后端发送请求，获取数据

  onLoad(){
    this.refresh()
  },
  refresh(){
    wx.showLoading({
      mask:true,
    })
    wx.request({
      url: api.notice,
      method:'GET',
      success:(res)=>{
        this.setData({
          noticeList:res.data
        })
      },
      complete:()=>{
        wx.hideLoading()
      }
    })
  }

})