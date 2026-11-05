# 未蓝科技 · 智慧教育小程序

面向 K12 家长、教务老师、代课老师的微信小程序。

| 角色 | 要做的事 |
|---|---|
| 家长 | 看孩子学习日常、查课程与剩余课时、请假与取消、积分兑换礼品 |
| 教务 | 上传学习图片、发通知、维护礼品、课程签到 |
| 代课老师 | 查看代课安排 |

## 项目信息

| 项 | 值 |
|---|---|
| 小程序名称 | 未蓝科技 |
| AppID | wx878ab2baaa9c34be |
| 技术栈 | 微信小程序原生 + TDesign 1.17.0 |
| 后端 | Django 6 + DRF + SimpleJWT（独立仓库 `weilan-keji-backend`） |
| 后端地址 | `http://127.0.0.1:8000/smart`（开发环境） |

> 项目全貌与关键决策见 `../docs/PROJECT_BRIEF.md`；
> 分步开发进度见 `../docs/分步开发手册.md`。

## 目录结构

```
weilan-keji-miniapp/
├── app.js                  # 全局逻辑：登录态管理、退出登录
├── app.json                # 页面注册 + tabBar + TDesign 全局组件
├── app.wxss                # 全局样式：设计令牌 --wl-* 与 --td-*
├── sitemap.json            # 微信搜索配置
├── project.config.json     # 开发者工具项目配置
├── config/
│   └── settings.js         # 环境切换 + 所有后端接口路由
├── utils/
│   ├── request.js          # 统一请求（Promise + token 注入 + 错误分类）
│   └── track.js            # 埋点工具（开发期只打 console）
├── pages/
│   ├── index/              # 首页：Banner + 公告 + 上课日常
│   ├── activity/           # 学习服务：功能菜单网格
│   ├── my/                 # 我的：用户信息 + 统计 + 功能入口
│   └── login/              # 登录：手机号 + 验证码
├── images/
│   └── icon/               # tabBar 图标 + 应用图标
└── static/
    └── css/iconfont.wxss   # 图标字体
```

## 页面说明

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/index/index` | Banner 轮播、公告栏、上课日常卡片（可收藏、可分享） |
| 学习服务 | `pages/activity/activity` | 功能菜单网格（课表、请假、作业、课时查询、成绩单、电子相册、积分商城） |
| 我的 | `pages/my/my` | 用户信息、学习统计、功能入口、退出登录 |
| 登录 | `pages/login/login` | 手机号 + 验证码 |

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

开发环境下后端是 `http://127.0.0.1:8000`（非 HTTPS），需要在：

**详情 → 本地设置 → ✅ 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**

### 5. 启动后端

```bash
cd ../weilan-keji-backend
./.venv/Scripts/python.exe manage.py runserver 8000
```

后端未启动时前端仍可打开，各页面会退化为本地占位数据并提示「当前展示离线数据」。

### 6. 演示模式登录

后端未启动时，登录页输入**任意手机号** + 验证码 **8888** 即可进入。

## 后端接口

### 环境切换

编辑 `config/settings.js` 第一行：

```js
var env = 'dev'   // 开发环境：http://127.0.0.1:8000/smart
var env = 'prod'  // 生产环境：https://your-domain.com/smart
```

### 接口清单

**已可用**（后端已实现）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/smart/banner/` | GET | 首页 Banner + 内嵌最新公告 |
| `/smart/notice/` | GET | 公告列表（最新在前） |

**待实现**（前端已预留路由，后端阶段 1–4 陆续补上）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/smart/user/send_sms/` | POST | 发送验证码（开发期固定 8888） |
| `/smart/user/login/` | POST | 双入口登录：`{mobile, code}` 或 `{code}` |
| `/smart/user/profile/` | GET | 当前家长信息 + 已绑孩子（需 token） |
| `/smart/user/bind_mobile/` | POST | 为微信登录用户补手机号（需 token） |
| `/smart/menu/` | GET | 学习服务功能菜单 |

### 统一请求工具

```js
import request from '../../utils/request'
import api from '../../config/settings'

request({ url: api.banner, method: 'GET' })
  .then(data => { /* 成功 */ })
  .catch(err => {
    // err.type ∈ 'business' | 'http' | 'network'
  })
```

**特性**：自动 loading / hideLoading、自动注入 `token` 请求头、401 自动清登录态并跳登录页、
业务失败抛 `business` 类型错误（不伪装成网络问题）。

### 接口字段约定

#### 学习服务菜单 `/menu/`

```json
[
  {
    "id": 1,
    "name": "课表",
    "icon": "calendar",
    "color": "#2F6BED",
    "bg": "#EAF1FF",
    "path": "",
    "badge": 0
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 唯一标识 |
| `name` | string | 菜单名称 |
| `icon` | string | TDesign 图标名，如 `calendar` |
| `color` / `bg` | string | 图标颜色 / 底色（十六进制） |
| `path` | string | 跳转路径，**空字符串表示功能开发中**（点击弹提示） |
| `badge` | number | 红点数字，0 或空则不显示 |

#### Banner + 公告 `/banner/`

```json
{
  "code": 100,
  "msg": "成功",
  "banner": [{ "id": 1, "img": "http://.../media/banner/banner1.png" }],
  "notice": { "id": 1, "title": "标题", "content": "内容", "img": "http://..." }
}
```

## 登录与鉴权

```
手机号 + 验证码                      微信静默登录
      ↓                                   ↓
POST /user/login/ {mobile, code}   POST /user/login/ {code}
      └──────────────┬──────────────────┘
                     ↓
              { code:100, token, need_mobile, parent, students }
                     ↓
        前端存 Storage：token + userInfo
                     ↓
        后续请求自动带 Header: { token: xxx }
```

**孩子绑定**：家长登录后按 `Parent.mobile` ↔ `Student.mobile` 自动匹配，支持一个家长多个孩子。
匹配不上不报错，只是返回空列表，前端展示空态。

**退出登录**：清 token → 清 userInfo → `wx.reLaunch` 到登录页。

## 开发注意事项

1. **统一用绝对路径跳转**：`wx.navigateTo({ url: '/pages/login/login' })`
2. **新接口加在 `config/settings.js`**，新页面请求统一用 `utils/request.js`
3. **图片走 CDN**：后端 `ImageField` 返回的是 `/media/...` 相对路径，需要拼 `PUBLIC_BASE_URL`
4. **埋点默认关闭**：`utils/track.js` 的 `SEND = false`，上线前改这个开关和 `REPORT_URL`

## 技术依赖

| 包 | 版本 | 用途 |
|---|---|---|
| `tdesign-miniprogram` | ^1.17.0 | 主 UI 组件库 |

## 许可证

ISC
