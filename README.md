# 未蓝科技 · 智慧教育小程序

面向 K12 学生家长的智慧教育服务平台，提供上课日常、学习服务、积分商城等功能。

## 项目信息

| 项 | 值 |
|---|---|
| 小程序名称 | 未蓝科技 |
| AppID | wx878ab2baaa9c34be |
| 技术栈 | 微信小程序原生 + TDesign 1.17.0 |
| 后端 | Django REST Framework（Python） |
| 后端地址 | `http://127.0.0.1:8000/smart`（开发环境） |

## 目录结构

```
weilan-keji-miniapp/
├── app.js                  # 全局逻辑：登录态管理、退出登录
├── app.json                # 页面注册 + tabBar + TDesign 全局组件
├── app.wxss                # 全局样式：TDesign CSS 变量 + 通用类
├── sitemap.json            # 微信搜索配置
├── project.config.json     # 开发者工具项目配置
├── project.private.config.json
├── config/
│   └── settings.js         # 环境切换 + 所有后端接口路由
├── utils/
│   └── request.js          # 统一请求工具（Promise 封装 + token 自动注入 + 错误处理）
├── pages/
│   ├── index/              # 首页：Banner 轮播 + 通知栏 + 上课日常
│   ├── activity/           # 学习服务：彩色功能菜单网格
│   ├── my/                 # 我的：用户信息 + 统计 + 功能入口
│   └── login/              # 登录：手机号 + 短信验证码（演示模式可用）
├── images/
│   ├── icon/               # tabBar 图标（home / aid / my）
│   ├── menu/               # 学习服务功能菜单图标
│   └── home/               # 首页 Banner + 上课日常图片
├── static/                 # iconfont 字体资源
├── miniprogram_npm/        # TDesign 构建产物（开发者工具自动生成）
└── package.json            # npm 依赖
```

## 页面说明

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/index/index` | Banner 轮播、通知栏、上课日常记录卡片 |
| 学习服务 | `pages/activity/activity` | 功能菜单网格（课表、请假、作业、课时查询、成绩单、电子相册、积分商城） |
| 我的 | `pages/my/my` | 用户信息、学习统计、功能入口、退出登录 |
| 登录 | `pages/login/login` | 手机号 + 验证码登录 |

### TabBar 导航

```
┌──────────────────────────────┐
│   成长   │ 学习服务 │   我的   │
└──────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建 npm

在微信开发者工具中：**菜单 → 工具 → 构建 npm**

### 3. 导入项目

开发者工具 → 导入项目 → 选择项目根目录 → 填入 AppID

### 4. 开启「不校验合法域名」

开发环境下，后端是 `http://127.0.0.1:8000`（非 HTTPS），需要在：

**详情 → 本地设置 → ✅ 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**

### 5. 启动后端

确保 Django 后端运行在 `8000` 端口。没有后端也能跑——前端有完整 mock 数据降级。

### 6. 演示模式登录

后端未启动时，登录页输入**任意手机号** + 验证码 **8888** 即可登录。

## 后端接口

### 环境切换

编辑 `config/settings.js` 第一行：

```js
var env = 'dev'   // 开发环境：http://127.0.0.1:8000/smart
var env = 'prod'  // 生产环境：https://your-domain.com/smart
```

### 接口列表

| 接口 | 方法 | 说明 |
|---|---|---|
| `/smart/banner/` | GET | 首页 Banner + 通知 |
| `/smart/menu/` | GET | 学习服务功能菜单 |
| `/smart/welcome/` | GET | 启动页广告（已隐藏） |
| `/smart/collection/` | GET/POST | 住户信息列表 / 新增 |
| `/smart/area/` | GET | 楼栋区域列表 |
| `/smart/statistics/` | GET | 统计数据 |
| `/smart/face/` | POST | 人脸检测（上传图片） |
| `/smart/voice/` | POST | 语音识别（上传音频） |
| `/smart/notice/` | GET | 公告列表 |
| `/smart/activity/` | GET | 活动列表 |
| `/smart/join/join/` | POST | 活动报名（需 token） |
| `/smart/user/send_sms/` | GET | 发送短信验证码 |
| `/smart/user/login/` | POST | 手机号 + 验证码登录 |

### 统一请求工具

```js
import request from '../../utils/request'
import api from '../../config/settings'

request({ url: api.banner, method: 'GET' })
  .then(data => { console.log(data) })
  .catch(err => { /* 后端未就绪时降级处理 */ })
```

**特性**：自动 loading / hideLoading、自动注入 token 请求头、401 自动清登录态并跳转、统一错误 Toast、网络异常静默降级。

### 接口字段约定

#### 学习服务菜单 `/menu/`

```json
[
  {
    "id": 1,
    "name": "课表",
    "image": "/images/menu/ht.png",
    "path": "",
    "badge": 0
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 唯一标识 |
| `name` | string | 菜单名称 |
| `image` | string | 图标路径（本地 `/images/xxx.png` 或网络 `https://cdn.xxx.com/...`） |
| `path` | string | 跳转页面路径，**空字符串**表示功能开发中（点击弹 Toast） |
| `badge` | number | 红点提示数字，0 或空则不显示 |

#### Banner + 通知 `/banner/`

```json
{
  "banner": [{ "img": "/images/home/cute_1.jpg" }, ...],
  "notice": { "content": "社区上线啦" }
}
```

## 用户认证流程

```
手机号 + 验证码
    ↓
POST /user/login/
    ↓
返回 { token, name, score, avatar }
    ↓
前端存 Storage：token + userInfo
    ↓
后续请求自动带 Header: { token: xxx }
```

**退出登录**：清 token → 清 userInfo → `wx.reLaunch` 跳登录页。

## Mock 数据降级

所有页面都有 mock 数据，**后端未启动时也能完整演示**：

- **首页 Banner**：3 张本地图片 `/images/home/cute_1~3.jpg`
- **上课日常**：3 条写死的课程记录
- **学习服务菜单**：7 个功能入口（`/images/menu/*.png`）
- **登录**：验证码 `8888` 触发 mock 登录

后端接口就绪后，前端代码**零改动**自动切换为真实数据（接口优先，失败降级 mock）。

## 通用样式 Token

在 `app.wxss` 中定义，全局复用：

| Token | 值 | 用途 |
|---|---|---|
| `.container` | `padding: 24rpx` | 页面容器 |
| `.card` | `bg:white; border-radius:24rpx; shadow` | 卡片容器 |
| `.section-title` | `34rpx; font-weight:600` | 区块标题 |
| `.muted` / `.muted-md` | `24/26rpx; color:#999/#666` | 辅助文字 |
| `.divider` | `1rpx solid #f0f0f0` | 分隔线 |
| `.hover-btn` | `opacity:0.7` | 点击反馈 |
| `--td-brand-color` | `#1890ff` | 主题蓝 |

## 商用前检查清单

- [ ] 后端配置 HTTPS 证书
- [ ] 微信公众平台配置合法域名
- [ ] 登录页加隐私协议勾选
- [ ] 小程序主体改为企业（教育类需办学资质）
- [ ] 后端接口加 token 过期机制
- [ ] 敏感接口后端校验权限

## 开发注意事项

1. **统一用绝对路径跳转**：`wx.navigateTo({ url: '/pages/login/login' })`
2. **新接口加在 `config/settings.js`**，新页面请求用 `utils/request.js`
3. **图片放 CDN**：后端返回的图片 URL 应为 CDN 链接，本地图只做占位
4. **字段名修正**：`settings.js` 里有个拼写错误 `statstics`（应为 `statistics`），后端对接时注意

## 技术依赖

| 包 | 版本 | 用途 |
|---|---|---|
| `tdesign-miniprogram` | ^1.17.0 | 主 UI 组件库 |

## 许可证

ISC
