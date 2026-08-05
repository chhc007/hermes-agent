<p align="center">
  <img src="https://img.shields.io/badge/Hermes%20Web-气泡版%20v1-8B5CF6?style=for-the-badge" alt="Hermes Web Chat v1">
  <img src="https://img.shields.io/badge/状态-稳定-green?style=for-the-badge" alt="Status: stable">
  <img src="https://img.shields.io/badge/测试-226%20passed-22c55e?style=for-the-badge" alt="Tests: 226 passed">
  <img src="https://img.shields.io/badge/后端-137%20passed-22c55e?style=for-the-badge" alt="Backend tests: 137 passed">
</p>

# 💬 Hermes Web 气泡对话视图（v1）

> 把 dashboard 的 Chat 页面从「原始 xterm 终端」升级为**美观的结构化对话视图**——
> AI 回复气泡、可折叠工具卡片、可交互的选项卡片、Markdown 表格、图片展示。
> 原始终端仍可一键切换保留。

基于官方 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的
`feature/web-chat-view` 分支。**零后端协议改动**，完全复用官方已有的结构化事件流。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 💬 **气泡对话视图** | AI 回复渲染为消息气泡（Markdown），用户消息右对齐，替代原始终端 |
| 🛠️ **可折叠工具卡片** | 每次工具调用显示为卡片：名称、状态（运行中/完成/失败）、参数、输出预览、耗时 |
| 🔄 **视图切换** | Chat（气泡）/ Terminal（原始终端）一键切换，PTY 在两种视图下持续运行 |
| 🧠 **thinking 折叠区** | 模型思考过程可折叠，正文保持干净 |
| 📜 **历史消息加载** | 打开已恢复的会话时，自动加载存储的消息记录 |
| 📊 **Markdown 表格** | 支持管道表格渲染（含对齐冒号） |
| 🖼️ **图片展示** | agent 输出的 `MEDIA:/path` 或 Markdown 图片 → 点击放大（手机友好 lightbox） |
| 🎯 **交互式选项卡片** | 单选 / 多选 / Other 自由输入，经 JSON-RPC 直接应答 |
| 📱 **手机适配** | 响应式布局，触屏放大预览，输入框多行 + 图片粘贴 |

---

## 🚀 快速开始（别人想怎么装）

### 前置要求

- Linux / macOS（Windows 请用 WSL2）
- Python 3.11+，Node.js ≥ 22
- [Hermes Agent](https://hermes-agent.nousresearch.com/) 已安装（`hermes` 命令可用）

### 安装

```bash
# 1. 克隆本分支（或你自己的 fork）
git clone -b feature/web-chat-view https://github.com/NousResearch/hermes-agent.git
cd hermes-agent

# 2. 安装 Python 依赖（用 hermes 自带 venv）
./venv/bin/pip install -e . 2>/dev/null || pip install -e .

# 3. 构建 web 前端
npm install --ignore-scripts        # 跳过 electron 等重型脚本
npm run build --workspace web

# 4. 配置 dashboard（端口、认证）
hermes config set dashboard.theme midnight
hermes config set dashboard.basic_auth.username <你的用户名>
# 密码在首次访问 dashboard 时通过登录页设置
```

### 启动

```bash
# 启动 web dashboard（默认 9119 端口）
hermes dashboard --host 0.0.0.0 --port 9119
```

浏览器打开 `http://<服务器IP>:9119` → 登录 → 进入 **Chat** 标签页。

### 验证安装

```bash
# 打开后应该看到：
# 1. 左侧会话列表
# 2. 中间是气泡对话视图（默认 Chat 视图）
# 3. 右上角 Chat / Terminal 切换
# 4. 底部输入框（Enter 发送，Shift+Enter 换行，可粘贴/拖拽图片）
```

---

## 🤖 AI 架构说明（给 AI 看的部分）

> 这一段是给后续维护者 / AI 编码助手看的**权威技术文档**。
> 遵循本段约束，不要从终端文本流解析——那正是 v0 的教训。

### 核心设计原则

1. **消费结构化事件流，绝不解析终端文本。**
   v0 曾用 ANSI 正则 + 文本分段猜工具调用（`ansi-stripper` / `pty-segments`），脆弱且必然出错。
   v1 直接消费官方已有的结构化事件通道。
2. **零后端协议改动。** 所有能力都建立在官方 `/api/events`、`/api/pty`、`/api/ws`、`/api/media` 之上。
3. **PTY 持续运行。** 气泡视图只是对同一 PTY 会话的结构化呈现；切回 Terminal 一切照旧。

### 数据流

```
node ui-tui (Ink TUI, 跑在 PTY 里)
   │  dispatcher emit（结构化事件）
   ▼
/api/pub  ←── TUI 侧 sidecar 推送
   │  广播（按 channel）
   ▼
/api/events?channel=<id>  ←── WebSocket（浏览器订阅）
   │
   ▼
web/src/lib/chat-event-stream.ts  ←── reducer 状态机
   │  输出 ChatMessage[] + clarify + sessionTitle
   ▼
ChatMessageList → MessageBubble → ToolCallBlock / MediaImage
ChatInput ──ws.send(text)──→ /api/pty（输入走同一 PTY）
ClarifyCard ──JSON-RPC──→ /api/ws（clarify.respond）
MediaImage ──<img>──→ /api/media（图片二进制）
```

### 事件契约（/api/events 帧）

帧格式：`{ "jsonrpc": "2.0", "method": "event", "params": { "type": "...", "payload": {...} } }`

消费的事件类型（`chat-event-stream.ts` reducer 处理）：

| 事件 | payload 关键字段 | 处理 |
|------|-----------------|------|
| `session.info` | `title` | 会话标题 |
| `message.start` | — | 开启新 assistant 流式消息 |
| `message.delta` | `text`（增量） | 追加到当前消息正文 |
| `message.complete` | `text`（**全量**）`reasoning` | 替换正文（勿拼接！官方 finalTail 语义） |
| `thinking.delta` / `reasoning.delta` | `text`（增量） | 追加 thinking 折叠区 |
| `tool.start` | `tool_id, name, args_text, todos` | 开工具卡片 |
| `tool.progress` | `name, preview` | 更新卡片预览 |
| `tool.complete` | `tool_id, name, error, summary, duration_s, result_text` | 卡片收尾 |
| `clarify.request` | `request_id, question, choices, multi_select?` | 渲染选项卡片 |

⚠️ **`message.complete.text` 是全量最终文本**。官方 TUI 用 `finalTail` 剥掉已流式前缀，
web reducer 必须**替换**累积的 delta 而不是拼接（否则重复渲染）。

### 本地 action（非事件）

| action | 用途 |
|--------|------|
| `user_message` | 发送成功后本地添加用户气泡（事件流里没有用户输入帧） |
| `history` | 替换为加载的会话历史 |
| `clarify_answered` | 提交答案后清除选项卡片 |

### 关键文件地图

```
web/src/lib/chat-event-stream.ts      # 核心：reducer 状态机 + useChatEventStream hook
web/src/lib/media.ts                  # 媒体路径 → /api/media URL 工具
web/src/components/ChatMessageList.tsx # 消息列表（自动滚底）
web/src/components/MessageBubble.tsx   # 消息气泡（thinking 折叠 + 正文 Markdown）
web/src/components/ToolCallBlock.tsx   # 工具调用卡片（纯 CSS 状态徽标）
web/src/components/ClarifyCard.tsx     # 选项卡片（单选/多选/Other）
web/src/components/MediaImage.tsx      # 图片卡片 + 点击放大 lightbox
web/src/components/Markdown.tsx        # 轻量 Markdown（表格 + MEDIA: 行）
web/src/components/ChatInput.tsx       # 输入框（多行/图片/发送）
web/src/pages/ChatPage.tsx             # Chat/Terminal 视图切换 + PTY 连接
hermes_cli/web_server.py               # 后端（仅 /api/media 放宽为任意目录 + 64MB）
```

### 后端改动（唯一一处）

`hermes_cli/web_server.py` 的 `/api/media`：
- 返回**原始图片二进制**（`Response` + 正确 media_type），而非 JSON data_url（img 才能直接渲染）
- 目录白名单放宽为**任意可读路径**（保留图片扩展名白名单 + 64MB 大小上限 + 会话认证）
- `Cache-Control: private, max-age=3600`

### 已知边界

- `/api/media` 只服务图片扩展名；agent 写非图片附件（pdf 等）不会显示（可后续扩展）
- `message.delta` 流式渲染期间若刷新页面，历史重新从 `/api/sessions/{id}/messages` 加载
- clarify 提交走独立的 GatewayClient（/api/ws），与 PTY 连接相互独立

---

## 🧪 开发

```bash
# 类型检查 + 测试 + lint
cd web && npm run check

# 只跑测试
npm run test --workspace web

# 构建
npm run build --workspace web

# 后端测试（/api/media 等）
./venv/bin/python -m pytest tests/hermes_cli/test_web_server.py -q
```

新增组件时请保持：纯函数放 `lib/`（可 node 单测）、组件只导出组件
（react-refresh 规则）、事件处理进 reducer（别放组件内部）。

---

## 📦 版本

- **v1.0**（当前）：气泡对话 + 工具卡片 + 选项卡片 + 表格 + 图片 + 历史加载
- v0（已废弃）：基于终端文本解析的自定义，混乱且脆弱，已弃用

## 📄 License

MIT — 与上游 Hermes Agent 一致。
