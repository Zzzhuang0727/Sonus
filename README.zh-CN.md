<p align="right">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Sonus

Sonus 是一个本地优先的 AI DJ 和个人电台主播。它提供一个浏览器/PWA 电台控制台：你可以告诉 Sonus 当前想听的氛围，它会给出 5 首候选歌曲，你选择其中一首播放后，Sonus 会把这次选择记入当前用户的本地偏好文件，用于之后更准确地推荐音乐。

当前版本主要面向个人桌面使用：

- 像素科技风电台 UI，包含紫色液态玻璃聊天、播放队列、歌词和最近播放面板
- 本地 Fastify 服务，负责 AI 规划、音乐搜索、语音合成、播放状态、聊天历史和用户偏好
- 使用 DeepSeek V4 Pro 作为 DJ 大脑
- 网易云音乐搜索和播放适配器
- Fish Audio TTS 语音合成适配器，语音不可用时会自动降级为文本播报
- 本地用户系统，每个用户拥有独立的近期歌曲偏好文件

## 项目结构

```text
apps/web        React + Vite PWA 播放器，运行在 localhost:3000
apps/server     Fastify + TypeScript 本地服务，运行在 localhost:8787
packages/shared 前后端共享的 Zod schema 和 TypeScript API 类型
prompts         Sonus 主播人格提示词
cache/tts       生成后的主播语音缓存
user            仅保存在本机的用户数据库和偏好文件
```

## 快速开始

```bash
corepack enable
corepack pnpm install
cp .env.example .env
corepack pnpm dev
```

打开：

```text
http://localhost:3000
```

默认情况下，`.env.example` 会启用 mock 模式，因此即使没有真实 API key，也可以先启动应用查看 UI 和基础流程。

## 环境变量

在项目根目录创建 `.env` 文件。不要把 `.env` 提交到 Git。

### 真实 AI 推荐所需配置

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING=disabled
DEEPSEEK_REASONING_EFFORT=high
```

当 `SONUS_MOCK_AI=false` 时，必须配置 `DEEPSEEK_API_KEY`。

### Fish Audio 主播语音所需配置

```env
FISH_API_KEY=
FISH_BASE_URL=https://api.fish.audio
FISH_VOICE_ID=
```

`FISH_VOICE_ID` 对应 Fish Audio 官方文档中的 voice/reference id，用于 Sonus 的主播播报声音。

配置完成后，可以把 `SONUS_MOCK_TTS` 改为 `false`。

### 网易云音乐所需配置

```env
NETEASE_BASE_URL=https://music.163.com
NETEASE_COOKIE=
```

`NETEASE_COOKIE` 是你在浏览器中登录网易云音乐后的 Cookie。Sonus 会把它用于个人本地听歌流程。部分歌曲仍可能因为网易云账号、版权或播放限制而不可用；Sonus 会尝试降级或换歌，不会绕过平台限制。

配置完成后，可以把 `SONUS_MOCK_MUSIC` 改为 `false`。

### 可选上下文

```env
ICS_URL=
ICS_FILE=
OPENWEATHER_API_KEY=
OPENWEATHER_LOCATION=Shanghai,CN
```

这些字段用于日程和天气上下文。没有配置时，Sonus 会自动跳过对应能力。

### 本地应用设置

```env
SONUS_PORT=8787
SONUS_WEB_ORIGIN=http://localhost:3000
SONUS_MOCK_AI=true
SONUS_MOCK_MUSIC=true
SONUS_MOCK_TTS=true
```

mock 模式适合 UI 开发、本地调试，或者在没有付费服务 API key 时体验基础流程。

## 使用方式

1. 使用 `corepack pnpm dev` 启动项目。
2. 打开 `http://localhost:3000`。
3. 点击 `LOGIN` 注册一个本地 Sonus 用户。
4. 注册时用户名、电话、邮箱为必填；姓名、年龄、生日、偏好音乐类型、偏好歌手为选填。
5. 向 Sonus 描述想听的氛围，例如：`I want something soft and late-night in English.`
6. Sonus 会返回 5 张歌曲推荐卡片和 1 张重新推荐卡片。
7. 点击任意歌曲卡片即可播放。
8. 被选择的歌曲和歌手会保存到当前用户的本地偏好文件。
9. 之后的推荐会参考注册偏好和最近选择过的歌曲。

## 本地用户和偏好数据

Sonus 的用户数据只保存在当前电脑：

```text
user/users.db
user/preferences/<userId>.json
```

不同用户拥有独立的偏好文件。Sonus 会保留最近选择的 100 首歌曲，同时忽略超过 30 天的偏好记录。

这些文件已加入 `.gitignore`，不会被提交到仓库。

## 主要 API

```text
GET    /api/now
GET    /api/history
DELETE /api/history
POST   /api/chat
POST   /api/play/:id
GET    /api/stream
POST   /api/users/register
POST   /api/users/login
GET    /api/users/me
GET    /api/users/preferences
POST   /api/users/logout
POST   /api/plan/today
```

## 开发命令

```bash
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 隐私说明

以下文件只应保存在本地，已经被 Git 忽略：

- `.env`
- `state.db*`
- `user/users.db*`
- `user/preferences/*.json`
- `cache/tts/*.mp3`
- 旧版本地资料文件：`user/*.md` 和 `user/playlists.json`

## 当前限制

- Sonus 当前定位是本地个人使用，不是线上多用户托管服务。
- 歌曲能否播放取决于音乐来源、账号状态和平台限制。
- Fish Audio TTS 可能因为网络、额度或 voice id 不可用而失败；失败时 Sonus 仍会显示文本并播放音乐。
- UPnP/家庭音响投放能力已预留为未来 adapter，当前版本尚未实现。
