<p align="center">
  <img src="https://img.shields.io/badge/Hermes%20Web-气泡版%20v1.7-8B5CF6?style=for-the-badge" alt="Hermes Web Chat v1.7">
  <img src="https://img.shields.io/badge/状态-稳定-green?style=for-the-badge" alt="Status: stable">
  <img src="https://img.shields.io/badge/测试-345%20passed-22c55e?style=for-the-badge" alt="Tests: 345 passed">
  <img src="https://img.shields.io/badge/后端-479%20passed-22c55e?style=for-the-badge" alt="Backend tests: 479 passed">
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
| 🎚️ **自动滚动开关** | 右下角悬浮按钮；上滚/触摸**立即脱离**跟随，滚回底部恢复 |
| 🧩 **有序片段展示** | thinking/工具调用/答复按**到达顺序**流式显示（终端式时间线），非固定三块 |
| 🤏 **thinking 折叠预览** | 思考块默认收起，只显示最新几行预览；点开看完整内容 |
| 🏷️ **终端命令徽标** | slash 补全列表中需要 TUI 交互的命令（`/memory`、`/skills` 等）标注「终端」徽标 |
| 💡 **终端命令提示** | 在聊天框发送终端专属命令时，追加本地提示气泡（命令仍会转发到终端执行） |
| 🔄 **会话列表自动刷新** | 左栏 `ChatSessionList` 三源刷新：`?resume` 参数变化立即刷新、30s 静默轮询、标签页回前台静默刷新（`load({silent})` 不闪 loading） |
| 🎚️ **PortalSelect 下拉** | 思考程度下拉改用 portal+fixed 定位（`PortalSelect`），不再被 `overflow-y-auto` 容器裁剪，8 个选项完整可滚；位置实时跟随 + 翻转 + 键盘导航 |
| 🔦 **当前会话高亮** | 会话列表高亮当前激活会话（`session.info` 的 `stored_session_id`，fresh chat 也能识别），带「当前」徽标 + 主题色背景/边框 |
| 📶 **会话排序切换** | 会话列表支持「最近活跃 / 创建时间」两种排序（后端 `order` 参数已支持，前端切换即时重拉） |
| 🕐 **消息时间戳** | 每条消息（用户/助手/系统气泡）显示发送时间 `YYYY-MM-DD HH:mm:ss`，兼容秒/毫秒时间戳 |
| 🧒 **子代理会话标记** | 列表包含子代理会话（`include_children`）并显示「子代理」徽标（`_delegate_from` 标记识别），当前对话即使由 delegate 生成也能看到并选中 |
| 🔁 **终端切会话同步** | TUI 内 `/resume`、`/sessions`、`/compact`（session key 旋转）后气泡自动清空旧消息并重拉新会话历史，与终端保持一致（v1.6） |
| 📊 **上下文使用量** | 消息列表顶部显示 context 用量条（`used/max tok` + 填充条）+ 压缩次数徽标，数据来自 `session.info.usage`（v1.6） |
| 🗜️ **压缩兼容** | `/compact`/`/compress` 时显示「正在压缩上下文」banner（`status.update` kind=compacting/compressing），压缩后用量/历史自动刷新（v1.6） |
| ⏹️ **停止生成** | agent 运行中显示红色 Stop 按钮（`session.interrupt` RPC，同 TUI Ctrl+C）（v1.7） |
| ↶↻ **撤销/重试** | 一键撤销上一轮（`session.undo`）或重试最后一条消息（v1.7） |
| 🧭 **当前模型+切换** | 状态栏显示 model + 推理强度，点击弹出官方模型选择器（`model.options`/`config.set`）（v1.7） |
| ⛓️ **子代理 HUD** | `subagent.*` 事件渲染活跃子代理数（v1.7） |
| 📋 **todo 面板** | `tool.start.todos` 渲染 agent 任务列表 + 进度（v1.7） |
| 📺 **会话状态栏** | 忙碌指示 + 会话时长 + cwd + 后台任务数（`process.list` 轮询）（v1.7） |
| 📎 **多文件上传** | 拖入/选择多个任意文件 → 附件 chips（可移除）→ 与文字一并发送；落盘 `~/workspace/uploads/`，走 `@file:` 引用通道（v1.7.5） |
| ⚡ **流式分段即时格式化** | 工具调用/思考块之后，前面的文本段立即 Markdown 化，不必等整条消息完成（v1.7.6） |
| ♻️ **刷新/重连恢复进行中状态** | 订阅 `/api/events` 时补发进行中回合快照（thinking + 工具卡片 + 部分文本），刷新/手机切回不再干等（v1.7.7-v1.7.8） |
| 🕐 **实时进度轮询** | `events_ws` 每 1.5s 轮询 inflight 快照，变化即推 `turn.snapshot`（幂等替换，不闪烁）；回合结束自动收尾（v1.7.8） |
| 🔀 **有序片段还原** | inflight 记录有序 segments（文本→工具→文本→…），刷新后按真实到达顺序还原，不再工具挤一堆/文本连成墙（v1.7.9） |
| 🎨 **亮色聊天区配色** | win11-purple 主题下代码块/表格/行内代码/选中文字用柔和淡紫（`#8F7FE0` 系），不再深紫灰"荧光块" |
| 📱 **手机端紧凑头部** | 移动端两层 header 瘦身：brand 栏 `min-h-14`→`min-h-11`、标题行 py 12px→6px，聊天区多出 ~24px 可用空间，功能全保留 |
| 🧹 **幽灵连接清理** | events 轮询推送失败自动 `close(1011)` 断开半死 socket，强制浏览器重连换新；subscribe/unsubscribe 全日志（v1.7.10） |
| ⏹️ **Stop 按钮实时点亮** | `turn.snapshot` 的 streaming 标志驱动 `meta.running`（无需等 session.info），任务开始即出现停止按钮，结束自动复位（v1.7.11） |
| 🇨🇳 **完整汉化** | zh 翻译补全（63 key，不再 fallback 英文）+ 默认语言中文（浏览器 `zh*` 自动识别，localStorage 手动选择优先）+ Chat 核心组件全 i18n（输入框/气泡/澄清/媒体） |
| 🎤 **语音输入** | 浏览器麦克风 → 本地 faster-whisper 转写：ChatGPT 点击式 → 微信式按住说话/上滑取消（v1.7.12/v1.7.16），识别引擎可切换 local/mimo/groq/openai（v1.7.13） |
| 🔊 **语音回复** | 助手回复经服务器 TTS 朗读：文本清洗、精炼指令、静音开关（可恢复）、历史不重播、单实例（v1.7.14-22），合成引擎可切换 mimo/edge/openai/elevenlabs（v1.7.19） |
| ⚙️ **语音设置弹窗** | 主开关/自动发送/语音回复/识别引擎/合成引擎/语速，localStorage 持久化；手机窄屏自适应对齐（v1.7.13-23） |
| 🚀 **TTS 语速调节** | 语音设置里可选 0.5x~2.0x 语速，`/api/audio/speak` 透传 `speed`，Edge/OpenAI 等后端原生支持（v1.7.23） |
| 📱 **设置弹窗手机适配** | 弹窗按触发按钮动态选择左/右展开方向并限制最大宽度，窄屏不再向左溢出视口被裁剪（v1.7.23） |
| 🎤 **语音输入消息标记** | 语音转写发送的消息带内嵌标记（模型可见，知道是语音输入、可简单纠正识别误差），用户气泡显示 🎤 徽标且隐藏标记，刷新后徽标仍在（v1.7.24） |
| 🔈 **关闭语音回复恢复详细回复** | 语音回复开关从开→关后，下一条消息一次性提示模型"已关闭、恢复正常回复"，防止延续简短风格（v1.7.25） |

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
4. **流式期间纯文本渲染，回复结束后才格式化 markdown。**（关键性能决策，见下节）
   流式期间**绝不**渲染结构化 markdown DOM——无论全量解析还是增量解析，持续重建
   代码块/表格 DOM 都会让主线程过载，长输出必卡死（多轮对照实验验证）。

### 流式渲染性能决策记录（2026-08-05 实测结论）

> 这段是给后续维护者的**血泪教训**，改渲染策略前必读。

| 尝试过的方案 | 结果 | 原因 |
|-------------|------|------|
| 每次 delta 全量 `parseBlocks` | ❌ 卡死 | O(n²) 解析 + 全量 DOM 重建 |
| 流式期间纯文本（当前方案） | ✅ **稳定** | 每次只更新一个文本节点 |
| 增量块解析器（G 方案） | ❌ 卡死 | 解析快了，但**渲染仍全量重建 markdown DOM** |
| 隐藏 xterm 门控 | ⚠️ 部分有效 | 减少一个 CPU 大户，但非根治 |
| 历史消息窗口化（只渲染 30 条） | ❌ 仍卡 | 当前消息的 DOM 增长才是主因 |
| WS delta 合并调度（16ms/100ms） | ❌ 仍卡 | 把风暴变持续 60fps/10fps 渲染，仍过载 |

**结论**：流式期间渲染**任何**结构化 markdown DOM（代码块/表格/列表）都会让主线程过载。
唯一稳定方案是**流式期间纯文本（单文本节点）+ `message.complete` 后一次性格式化**。

**实施要点**（当前代码）：
- `MessageBubble.tsx`：`streaming` 时渲染 `whitespace-pre-wrap` 纯文本 div + 闪烁光标；
  `complete` 后才用 `<Markdown>` 渲染
- `MessageBubble` 包 `React.memo`：历史消息引用不变时跳过重渲染
- `ChatMessageList.tsx`：自动滚动开关 + wheel/触摸**立即脱离**跟随（不等 120px 阈值，
  否则流式持续拉回让用户永远无法上翻）；外层容器必须 `flex flex-col`（否则 flex-1 失效，
  气泡溢出到输入框下面——已两次踩坑）

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
| `message.start` | — | 开启新 assistant 流式消息（`segments: []`） |
| `message.delta` | `text`（增量） | 追加到**最后一个 text 片段**（无则新建片段） |
| `message.complete` | `text`（**全量**）`reasoning` | 替换最后一个 text 片段（勿拼接！官方 finalTail 语义） |
| `thinking.delta` / `reasoning.delta` | `text`（增量） | 追加到**最后一个 thinking 片段**（无则新建片段） |
| `tool.start` | `tool_id, name, args_text, todos` | push 新 tool 片段（开工具卡片） |
| `tool.progress` | `name, preview` | 更新对应 tool 片段预览 |
| `tool.complete` | `tool_id, name, error, summary, duration_s, result_text` | 更新对应 tool 片段收尾 |
| `clarify.request` | `request_id, question, choices, multi_select?` | 渲染选项卡片 |

⚠️ **`message.complete.text` 是全量最终文本**。官方 TUI 用 `finalTail` 剥掉已流式前缀，
web reducer 必须**替换**最后一个 text 片段而不是拼接（否则重复渲染）。

### 消息数据模型（ChatMessage）

```typescript
interface ChatMessage {
  segments: ChatSegment[];   // 有序片段：thinking/tool/text 按事件到达顺序
  text?: string;             // 派生：最后一个 text 片段内容（兼容旧引用）
  thinking?: string;         // 派生：所有 thinking 片段 join
  tools?: ToolCallInfo[];    // 派生：所有 tool 片段
  status: "streaming" | "complete";
}
```

reducer 收到 `thinking.delta` / `message.delta` 时**追加到最后一个同类型片段**（类型切换才新建），
`tool.start` 总是新建片段——因此渲染顺序 = 真实到达顺序（可交错）。已完成片段保持**对象引用稳定**，
配合 React.memo 避免流式期间重渲染历史片段。

### 本地 action（非事件）

| action | 用途 |
|--------|------|
| `user_message` | 发送成功后本地添加用户气泡（事件流里没有用户输入帧） |
| `system_message` | 本地提示气泡（如终端专属命令已转发、请到 Terminal 查看） |
| `history` | 替换为加载的会话历史 |
| `clarify_answered` | 提交答案后清除选项卡片 |

### 关键文件地图

```
web/src/lib/chat-event-stream.ts      # 核心：reducer 状态机 + useChatEventStream hook
web/src/lib/media.ts                  # 媒体路径 → /api/media URL 工具
web/src/components/ChatMessageList.tsx # 消息列表（自动滚动开关 + wheel/触摸立即脱离）
web/src/components/MessageBubble.tsx   # 消息气泡（segments 顺序渲染 + thinking 折叠预览固定高度）
web/src/components/ToolCallBlock.tsx   # 工具调用卡片（纯 CSS 状态徽标）
web/src/components/ClarifyCard.tsx     # 选项卡片（单选/多选/Other）
web/src/components/MediaImage.tsx      # 图片卡片 + 点击放大 lightbox
web/src/components/Markdown.tsx        # 轻量 Markdown（表格 + MEDIA: 行）
web/src/components/ChatInput.tsx       # 输入框（多行/多文件附件 chips/发送）
web/src/lib/chatImagePaste.ts          # 剪贴板/拖拽图片 → /api/chat/image-upload → /image
web/src/lib/chatFileUpload.ts          # 多文件上传 /api/chat/files-upload + @file: 引用构造
web/src/components/SlashPopover.tsx    # slash 补全（Tab/Enter 选中，终端命令徽标）
web/src/lib/terminal-commands.ts       # 终端专属命令清单（徽标 + 提示的单一事实源）
web/src/pages/ChatPage.tsx             # Chat/Terminal 视图切换 + PTY 连接
web/src/lib/voiceMode.ts               # 语音：VoiceRecorder(MediaRecorder+VAD) + 设置(localStorage) + transcribeAudio/speakText
web/src/components/VoiceButton.tsx     # 语音入口：VoiceModeButton(模式切换) + VoiceHoldButton(微信式按住说话)
web/src/components/VoiceSettings.tsx   # 语音设置弹窗（主开关/自动发送/语音回复/STT/TTS 引擎/语速 + 视口自适应定位）
web/src/components/VoiceReply.tsx      # 语音回复（朗读助手回复 + 静音开关，单一实例渲染在 ChatInput 上方）
hermes_cli/web_server.py               # 后端（/api/media + /api/chat/image-upload + /api/chat/files-upload + /api/audio/transcribe + /api/audio/speak）
hermes_cli/web_models.py               # 请求模型（TTSSpeakRequest 含 provider/speed 透传字段）
tools/voice_mode.py                    # transcribe_recording（本地 faster-whisper + 请求级 provider 覆盖）
tools/tts_tool.py                      # text_to_speech_tool（provider/speed 原生支持，speed 注入 tts_config）
```

### 语音输入与语音回复（v1.7.12-23）

浏览器端完整语音链路，两个方向都**后端零新增端点**（web_server.py 早有 `/api/audio/transcribe` 与 `/api/audio/speak`，前端直接复用，仅加了请求级 provider/speed 字段透传）：

**语音输入（STT）**：浏览器麦克风录音（MediaRecorder，VAD 静音自动停止或微信式按住说话）→ base64 → `POST /api/audio/transcribe`（`data_url` + `provider`）→ 服务器 faster-whisper（本地）/mimo/groq/openai → 返回文字进输入框或自动发送。识别引擎在设置里切换，走请求级 `provider` 覆盖（不改全局 config，对 gateway 零影响）。

**语音回复（TTS）**：ChatPage 跟踪本会话内 streaming→complete 的实时消息（历史加载不触发朗读）→ `VoiceReply` 清洗文本（去代码/表格/URL/emoji，>800 字句号截断）→ `speakText(text, provider, speed)` → `POST /api/audio/speak` → base64 audio → `<audio>` 播放。右下角是**静音开关**（可静音可恢复，不是一次性暂停）。

**精炼回复指令**：`voiceReply && !muted` 时，`sendChatPrompt` 在发送文本后追加 `[系统提示] 当前处于语音播报模式…`（模型可见、用户气泡不可见，display 用原始 text）。注意：**只要语音回复开着且未静音，任何消息（文字/语音输入）都会注入**，与是否用语音说话无关。

**TTS 语速链路（v1.7.23）**：设置弹窗语速下拉（0.5/0.75/1.0/1.25/1.5/2.0x）→ `voiceSettings.ttsSpeed`（localStorage 持久化，clamp 0.25-4.0）→ `VoiceReply` `ttsSpeed` prop → `speakText(text, provider, speed)` → `POST /api/audio/speak {speed}` → `TTSSpeakRequest.speed` → `text_to_speech_tool(text, provider=…, speed=…)` → 注入 `tts_config["speed"]` → Edge（rate ±%）/OpenAI（speed）/xAI/MiMo 等后端原生变速。command 型 provider 只有命令模板带 `{speed}` 占位符才生效。

**设置弹窗手机适配（v1.7.23）**：面板 `absolute bottom-10 right-0 w-64` 相对触发按钮（包含块只有按钮宽），`right-0` 向左展开 256px，手机窄屏下按钮又在工具栏左侧 → 面板左缘溢出视口被裁剪（"没显示完整，都到左边去了"）。修复：打开时 `getBoundingClientRect()` 测量，向左会溢出则改 `left-0` 向右展开，右缘仍超视口则 `maxWidth` 夹紧；面板加 `max-h-[55vh] overflow-y-auto` 防超高。

**语音输入消息标记（v1.7.24）**：语音转写自动发送时在消息文本尾部追加 `VOICE_INPUT_DIRECTIVE`（"【语音输入】本条消息由语音输入转写，可能存在识别误差，如有不通顺请结合上下文简单纠正。"）——**模型可见**（知道是语音输入、可简单纠正识别误差）；用户气泡由 `MessageBubble` 统一 `stripVoiceDirective` 剥离标记并显示 🎤 徽标。标记随消息持久化，刷新后徽标仍在。confirm 模式（转写进输入框）不标记——用户已确认文本。

**关闭语音回复恢复正常回复（v1.7.25）**：`voiceReply` 从开→关切换后，下一条消息**一次性**注入"[系统提示] 语音回复已关闭，请正常详细回复，无需保持简短。"（`voiceReplyWasOnRef` 跟踪切换，只触发一次），防止模型延续简短风格。静音（muted）不触发——用户只是暂停朗读。

**坑点全集**：见私有技能 `voice-provider-integration` Pitfall 1-20（HF 离线变量、TTS/STT provider 覆盖、朗读触发、微信式交互、单实例、语速、弹窗定位、语音标记、关闭恢复等）。

### 多文件上传（v1.7.5 新增）

用户可以在输入框一次拖入/选择**多个任意类型文件**，显示为附件 chips（可移除），
输入文字后**一并发送**。文件固定落在 `~/workspace/uploads/`（用户指定目录）。

**交互流程**：
1. 拖拽（任意位置，ChatPage host capture 拦截防止浏览器打开）或点📎选择文件 → 进
   ChatInput 附件列表（去重，chips 显示文件名+大小，可移除）
2. 输入文字（可空）→ 点发送/Enter
3. ChatPage `sendChatPrompt` 先 `POST /api/chat/files-upload`（multipart，多文件）
   上传全部文件 → 构造 `@file:<绝对路径>` 行 + 文字 → 走 PTY 一次提交
4. TUI 侧 `prompt.submit` → `input.detect_drop` → `@file:` 引用展开：文本文件内容
   注入上下文、二进制文件生成"可用工具读取"的引用块 → agent 用 read_file/vision 等
   工具处理

**消息格式**（走 PTY 的完整文本）：
```
@file:/home/hermes/workspace/uploads/20260808_2330_a1b2_报告.xlsx
@file:/home/hermes/workspace/uploads/20260808_2330_c3d4_截图.png
用户输入的文字
```

**关键点**：
- 上传目录 `~/workspace/uploads/` 必须在会话 cwd（dashboard 进程 cwd，实测为 `~`）
  之下——`@file:` 引用展开有 allowed_root 限制，目录选在 cwd 内才能展开
- 路径含空格/引号时用反引号包裹（`formatRefValue` 对齐后端 format_reference_value）
- 剪贴板粘贴图片仍走 `/image` 立即发送路径（与拖拽"攒着发"心智分开，未统一）
- 单文件上限 100MB（`_CHAT_FILE_UPLOAD_MAX_BYTES`，与前端 MAX_FILE_BYTES 同步）
- 文件名 sanitize 保留中文/空格，只去路径与控制字符；时间戳+随机前缀保证唯一
- 发送是异步的（先上传后提交），上传失败返回 false → 输入框保留文字+附件可重试

### 流式分段即时格式化（v1.7.6）

**问题**：一次回复里，前面已经说完整的一段话要等整个消息 `message.complete` 才从
纯文本变成 Markdown。中间工具调用时，前面那段话一直停留在"流式纯文本"状态。

**根因**：`MessageBubble.tsx` 的 `SegmentSequence` 把"最后一个 text segment"一律
当作流式中（`isStreamingText = streaming && i === lastTextIdx`）。但工具调用发生后
segments 是 `[text段落A, tool]` —— 段落A虽是最后一个 text segment，后面却有
tool segment，模型已经说完这段话了，却仍被当流式纯文本渲染。

**修复**：text segment 只有在**整个 segments 列表的末尾**（后面没有 tool/thinking）
才算流式中：`isStreamingText = streaming && i === lastTextIdx && i === tailIdx`。
一旦后面出现工具调用/思考块，前面的话立即定型渲染 Markdown。
（安全性：reducer 的 message.delta 只追加到"最后一个 text segment"，所以
text 段后面出现 tool 后它不会再增长，定型是安全的。）

**测试**：`MessageBubble.test.tsx` 新增 "finalizes the pre-tool text as markdown
while the tool is still running"。

### 刷新/重连恢复进行中状态（v1.7.7）

**问题**：刷新页面或手机切后台重连时，重新订阅 `/api/events` 只会收到补发的
`session.info` 元数据；进行中的 `thinking.delta` / `tool.start` / `message.delta`
事件（纯广播无重放）全部错过，直到 `message.complete` 才冒出完整结果——
"处理中刷新 → 看不到调用中状态"。

**实现**：
- `tui_gateway` 的 `inflight_turn` 快照扩展：新增 `thinking`（思考累积）与
  `tools`（工具生命周期 running→complete/error）记录；thinking/reasoning 回调、
  工具 start/complete 时同步写入
- `web_server` 新增补发：订阅 `/api/events` 时从快照合成标准事件帧序列
  （`message.start → thinking.delta → tool.start/complete → message.delta`）补发，
  前端 reducer 照常消费、重建进行中 segments

**注意**：v1.7.8 将补发演进为幂等 `turn.snapshot` 帧 + 1.5s 轮询（见下），
v1.7.7 的序列补发被取代。

### 实时进度轮询 + 幂等快照（v1.7.8）

**问题**：① 实时事件流（TUI sidecar mirror → /api/pub）在部分环境下不工作，
工具卡片/thinking/流式文字实时不可见，用户只能刷新看结果；② 刷新时旧补发
（message.start + delta 序列）与 REST 历史加载竞态，导致已格式化的 MD 和工具
块乱掉。

**根因**：
- 实时链路：tui_gateway 事件 → PTY stdio → node TUI（attach 模式走 WS）→
  sidecar mirror → /api/pub → /api/events。实测 TUI mirror 未发布（/api/pub 空），
  属原有环境问题，非本次功能引入
- 刷新竞态：message.start 的 sealAll + REST history 替换互相覆盖

**修复**：
- 前端 reducer 新增 `turn.snapshot` 事件：**幂等替换**进行中消息的 segments
  （thinking + tools + text），不 seal 不重开 → 重复帧不闪烁、不与历史竞态
- 后端 events_ws 改为**轮询** inflight_turn 快照（1.5s），内容变化时推送
  `turn.snapshot`；回合结束（inflight 变空）推 `message.complete` 收尾
- 订阅时仍立即补发一次 snapshot（刷新/重连恢复进行中状态）

**验证**：`tests/tui_gateway/test_inflight_replay.py`（8）+ `test_web_server.py`
新增 snapshot 帧测试；前端 `chat-event-stream.test.ts` 新增 4 个 turn.snapshot 用例；
后端 163 + 前端 354 全绿。

### 刷新后顺序修复（v1.7.9）

**问题**：刷新后工具块挤成一堆、文本全部连在下面。两个来源：
1. **补发快照丢失顺序**：inflight_turn 用扁平的 `tools[]` + `assistant` 分开存，
   snapshot 还原成"全部工具 + 一段文本"，真实交织顺序（文本→工具→文本→…）丢失
2. **历史近似顺序反了**：`sessionMessagesToChatMessages` 把 tool_calls 放在文本前，
   但 DB 行实际是"先输出文本、再发起工具"——渲染成工具卡片堆 + 文本墙

**修复**：
- `inflight_turn` 新增**有序 `segments` 列表**（thinking/tool/text 按到达顺序记录，
  thinking/text 增量合并到末尾同类段，工具 start/complete 追加/更新段）
- `turn.snapshot` 优先透传有序 segments；旧扁平字段作兼容回退
- 历史转换改为**文本先、工具后**（符合 DB 行的真实写入顺序）

**验证**：`test_inflight_replay.py` 断言更新（snapshot 含 segments）；前端新增
"text→tool→text 顺序保持"用例；后端 500 + 前端 356 全绿。

### 多标签页频道打架 + 幽灵连接加固（v1.7.10）

**问题**：气泡 chat 与终端不同步（聊天框无实时、刷新才出内容）。两个根因：
1. **多标签页频道打架**：每开一个标签页就有一个独立 channel（基于 localStorage
   attach token + resume）。若用户看的标签页 channel ≠ 当前会话 TUI 发布的
   channel（另一标签/旧标签），该标签只显示历史（REST 加载）而收不到实时事件
2. **幽灵连接**：events_ws 的轮询推送遇半死 socket（radio 切换、stale TCP）
   只静默失败，连接仍留在订阅集合里 → subscribers 累积、浏览器看似"已连接"
   实际收不到任何推送

**修复**：
- 用户侧：只保留一个标签页（多标签天然产生多 channel，旧标签必然不同步）
- 后端加固（`web_server.py` events_ws）：
  - 推送 `send_text` 失败 → **主动 `close(1011)`** 断开半死连接，强制浏览器
    走重连路径换新 socket
  - 新增 `events subscribe/unsubscribe` 日志（peer + channel + 订阅数），
    排查连接生命周期一目了然

**验证**：`scripts/run_tests.sh tests/hermes_cli/test_web_server.py` → 147/147 全绿。
用户实测（单标签 + 刷新）气泡 chat 实时同步 ✓。

### Stop 按钮实时显示（v1.7.11）

**问题**：agent 开始跑任务时停止按钮不出现，刷新后才出现。
**根因**：Stop 按钮基于 `meta.running`，但该字段只在 `session.info` 事件更新；
`turn.snapshot` 轮询帧（streaming 标志）未更新它，`message.complete` 也不重置。
实时事件不可靠时 running 状态无法到达前端 → 按钮不实时出现；刷新后
session.info 补发才点亮。
**修复**（`chat-event-stream.ts` reducer）：
- `turn.snapshot` → `meta.running = streaming`（即使 segments 为空也更新，
  thinking/tool 帧可能晚于回合开始）
- `message.complete` → 重置 `meta.running = false`（回合结束按钮消失）
**验证**：前端新增 Stop 按钮驱动用例（snapshot 点亮 / complete 复位）；
357 测试全绿。纯前端，刷新即生效。

### 后端改动（唯一一处）

`hermes_cli/web_server.py` 的 `/api/media`：
- 返回**原始图片二进制**（`Response` + 正确 media_type），而非 JSON data_url（img 才能直接渲染）
- 目录白名单放宽为**任意可读路径**（保留图片扩展名白名单 + 64MB 大小上限 + 会话认证）
- `Cache-Control: private, max-age=3600`

`hermes_cli/web_server.py` 的 `/api/chat/files-upload`（v1.7.5 新增）：
- `POST` multipart/form-data，`files` 字段可传多个文件（FastAPI `list[UploadFile]`）
- 保存到 `~/workspace/uploads/`（`_CHAT_UPLOADS_DIR`），文件名
  `{YYYYMMDD_HHMMSS}_{hex4}_{原文件名}`，返回
  `{ok, files: [{path, name, bytes, mime_type}]}`

### 已知边界

- `/api/media` 只服务图片扩展名；agent 写非图片附件（pdf 等）不会显示（可后续扩展）
- `message.delta` 流式渲染期间若刷新页面，历史重新从 `/api/sessions/{id}/messages` 加载
- clarify 提交走独立的 GatewayClient（/api/ws），与 PTY 连接相互独立
- **流式期间显示纯文本**（无 markdown 格式），`message.complete` 后才格式化——这是稳定性
  的代价，属有意设计（见「流式渲染性能决策记录」）。流式时最后一行（无换行）可能延迟
  到行完结才完整显示。

---

## 🔧 故障排查：气泡不显示（历史能加载、新事件不显示）

> 2026-08-06 实战记录。症状、根因、修复、诊断方法全流程。

### 症状

- 气泡窗口**历史消息能加载**（REST `/api/sessions/{id}/messages` 正常），但**新消息的
  thinking / 工具卡片 / 文字回复全不显示**
- 终端（xterm）能看到 agent 在处理；agent 日志（`agent.log`）也在正常跑
- **只影响单个会话**，开新会话就正常

### 根因（时间线还原）

1. 用户在会话里 `delegate_task` 委托了 subagent —— **气泡显示的是 subagent 的 mirror 事件**
2. subagent 事件（`reasoning.delta` / `tool.start` / `message.delta` …）由
   `tui_gateway/server.py` 的 `_mirror_subagent_to_child` 发给 **subagent 会话自己的 sid**
3. 用户**刷新页面 / 切换会话**时，浏览器 `/api/pty` 连接断开 → 会话 transport 被重定向为
   `_detached_ws_transport`（`_DropTransport`，**静默丢弃一切**）
4. subagent 的 agent 循环还在跑（在 dashboard 进程内），但事件全部写进 DropTransport → 气泡静默
5. 全局广播（`sessions.changed` 等）走 `_live_transports` 不受影响 —— 所以不是"连接全断"，
   而是**只有 session 定向事件丢失**

### 修复（v1.2.2，`tui_gateway/server.py`）

`write_json()`：session transport 是 `_detached_ws_transport` 时，回退到
`_broadcast_frame_to_live()` —— 把原帧广播到所有 live transports（node → sidecar → channel →
气泡），而不是丢弃。健康会话仍只走单 transport（不双发）。

```python
if sid and (t := (_sessions.get(sid) or {}).get("transport")) is not None:
    if t is not _detached_ws_transport:
        return t.write(obj)
    return _broadcast_frame_to_live(obj)   # detached → 广播兜底
```

### 诊断方法（下次直接照做）

```bash
# 1. 用 internal credential 订阅事件流（可从 PTY 进程 env 拿 HERMES_TUI_SIDECAR_URL 的 channel）
#    ws://127.0.0.1:9119/api/events?internal=<cred>&channel=<channel>
#    若 thinking/tool/message 全无、只有 sessions.changed → session 定向事件丢失

# 2. 查 live 会话（subagent 也在列）
#    /api/ws 发 JSON-RPC: {"method":"session.active_list"}
#    找不到目标会话 / status=working 但事件不发 → transport detached

# 3. 看 gui.log：刷新时段大量 `ws closed ... detached_sessions=N` → 会话被 detach
```

### 预防

- 前端：`ChatPage` 的 keep-alive channel 逻辑保持稳定（token 派生，刷新不变）
- 后端：`write_json` 的 detached fallback（已修）保证 subagent 事件不因连接断开而消失
- **表格解析**要求表头行下一行是 GFM 分隔行（`|---|`）；段落/列表后无空行直接接表格
  已支持（2026-08-05 修复）
- **移动端键盘**：Android Chrome 走 `interactive-widget=resizes-content`；iOS 靠
  visualViewport 兜底滚动到底

---

## 🔧 故障排查：侧边栏切会话无效（气泡加载历史、终端是新对话、打字无效）

> 2026-08-07 实战记录。症状、根因（两个独立 bug）、修复、诊断方法全流程。

### 症状

- 点击侧边栏某历史会话：**气泡正确加载了该会话历史**（REST），但**终端显示的是
  另一个「新对话」**，会话没有真正切换
- 气泡里打字**无效**（输入走 PTY，但 PTY 实际跑的是别的会话；回复事件也不回来）
- 之后再点侧边栏任何会话都**切不进去**（卡死状态）

### 根因（两个 bug 叠加）

**Bug 1 — `fresh=1` 与 `resume` 并发导致幽灵 PTY（前端，`ChatPage.tsx`）**

- `forceFreshPtyRef` 是跨 render 的 latch。点「新对话」后**立即**点侧边栏会话时，
  connect effect 可能带着 `fresh=1 + resume=<旧会话>` 的请求运行
- 后端 `pty_ws` 的 fresh 分支**优先清空 resume** → spawn 出一个「新对话」PTY，
  但它仍占用 resume 会话派生出的 **channel**（channel 由前端 resume 参数派生，
  attach key 由后端 registry_resume 派生，fresh 场景两者脱钩）
- 结果：**两个 PTY 同时 publish 到同一个 channel**，还共用同一个
  active_session_file → 事件流互相污染、active 会话文件被覆盖

**Bug 2 — attach key 复用不校验 PTY 内部实际会话（后端，`web_server.py`）**

- keep-alive attach key = `token\0profile\0registry_resume`，只反映**请求的**
  resume 目标，不反映 PTY 子进程**当前的**会话
- TUI 子进程内部可切换会话（`/new`、`/resume`、agent 切换）→ active_session_file
  更新，但 registry key 不变
- 之后点击原 resume 会话 → attach_or_spawn **复用漂移的旧 PTY** → 终端显示旧
  PTY 内部会话，气泡加载 resume 目标历史，事件流跟 channel → **三方脱节**

### 修复（v1.5）

**前端 `web/src/pages/ChatPage.tsx`：**
- `params.fresh` 只在 `resumeParam` 为空时发送（`if (forceFresh && !resumeParam)`）
  → 杜绝 fresh + resume 并存
- `startFreshDashboardChat` / `startFreshPty` **同步 rotate** attach token
  （在 setSearchParams 之前），channel 与 attach key 保持一致

**后端 `hermes_cli/web_server.py` + `pty_session.py`：**
- `PtySessionRegistry.discard(key)`：强制移除并异步关闭 PTY（重建用）
- `_live_sid_matches_resume(live_sid, stored_key)`：active_session_file 里的
  会话是否等于 resume 目标。**兼容两种格式**：resume/activate 路径写入存储 id
  （`20260807_...`），新会话路径写入内部短 id（`e71bf884`）
- `pty_ws` 复用前校验：`attach_or_spawn` 返回复用（`created=False`）且请求带
  resume 时，读 active_session_file 校验；不一致 → discard 旧 PTY + 清空
  active 文件 + 重新 spawn

### 诊断方法

```bash
# 1. 看 gui.log 是否有漂移重建记录
grep "pty resume drift" ~/.hermes/logs/gui.log
# → WARNING pty resume drift: channel=... resume=... live_sid=... → respawn

# 2. 查 live 会话（dashboard 进程内 tui_gateway）
# /api/ws 发 JSON-RPC: {"method":"session.active_list"}
# 对比每个 PTY 子进程的 HERMES_TUI_RESUME（/proc/<pid>/environ）与
# active_session_file 内容，不一致即漂移

# 3. 查同 channel 双 PTY（Bug 1 残留）
# 多个 node ui-tui 进程的 HERMES_TUI_SIDECAR_URL 含相同 channel → 污染
```

### 预防

- 前端：fresh 标志与 resume 参数互斥（已修）
- 后端：attach 复用前校验 active 会话（已修）；active_session_file 格式不统一
  的坑已记录（resume 写存储 id / 新会话写短 id）

---

## 🎨 自定义主题：Win11 Purple

> 本 fork 附带一个官方机制的自定义 dashboard 主题（见 `dashboard-themes/` 目录）。
> 纯 YAML 配置、零代码改动，后端自动发现，可在主题切换器里随时切换。

**Win11 Purple** — Windows 11 Fluent 风格深色主题：Mica 材质深紫背景、
紫罗兰强调色（`#8F7FE0` 系）、半透明卡片 + 柔和阴影、15.5px 字体。
**气泡聊天区为亮色**（`data-chat-surface` 作用域变量覆盖）：亮紫白背景 +
深紫灰文字，终端/侧栏保持深色。

> v3（2026-08-09）：整体再淡一档——背景提亮至 `#2b2545`、光晕/颗粒浓度
> 再降，色相更贴近亮色聊天区（`#f7f5fc`）更协调；字体 17px → 15.5px。

```bash
# 安装（官方路径）
mkdir -p ~/.hermes/dashboard-themes
cp dashboard-themes/win11-purple.yaml ~/.hermes/dashboard-themes/

# 激活
hermes config set dashboard.theme win11-purple
```

也可在 dashboard 页面右上角调色板图标切换（持久化到 `config.yaml`）。
完整主题资产与字段说明见 [`dashboard-themes/README.md`](./dashboard-themes/README.md)。

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

## 📌 待办（Backlog）

- **管理页面汉化（暂缓，用户决定先保持现状，2026-08-06）**
  - 范围：登录页整页（SIGN IN / USERNAME / PASSWORD 等硬编码）+ 主导航侧边栏
    6 项硬编码英文（Files / MCP / Channels / Webhooks / Pairing / System）+
    管理页面（System/Mcp/Webhooks/Channels 等）约 159 处次要硬编码文案。
  - 背景：v1.4 只汉化了 Chat 核心组件（chat 命名空间）；管理侧与登录页仍走
    硬编码英文，未接 i18n。
  - 用户决定：先保持现状，不做此项；后续要做时从本条目继续。

---

## 📦 版本

- **v1.8.1**（当前，稳定）：**撤销/重试/停止按钮可靠性修复** — 用户反馈 Web
  聊天页的 ↶ 撤销 / ↻ 重试 / 停止按钮"经常没效果、没交互感"。
  1) **根因**：`session.undo` 成功后 `/api/events` 不带用户帧，但
  `undoLast`/`retryLast` 缺了本地 `trimMessagesBefore`（`handleEditMessage`
  有、它们没有）→ 后端已回退、前端气泡纹丝不动；② undo/retry 按钮在
  `meta.running` 时不禁用，但后端 4009 拒绝运行中 undo → 点击必失败且
  catch 空吞；③ `stopTurn`/`undoLast` 的 catch 全部静默，无任何 banner。
  2) **修复**：undo 成功且 `removed>0` 时本地 trim 到最后一条 user 气泡
  （与 edit 同款契约）；undo/retry 按钮运行中禁用；`stopTurn`/`undoLast`
  失败时 `setBanner` 显示原因（新增 i18n：undoNoSession/undoBusy/
  undoFailed/stopNoSession/stopFailed）；`retryLast` 先取文本再 undo
  （避免 trim 后取到上一条 user）。测试 407 passed（新增 3 个）。
  改动：`web/src/pages/ChatPage.tsx` + `ChatPage.test.tsx` +
  `web/src/i18n/{types,en,zh}.ts`。
- **v1.8**（稳定）：**编辑历史用户消息 + 从此处重新生成** — 用户消息
  气泡悬停显示 ✎ 编辑按钮 → 内联 textarea（预填 `stripVoiceDirective` 后的原文，
  Enter 保存 / Esc 取消 / 空文本禁用）→ 保存时把会话回退到该消息之前并用编辑后
  文本重发，从该点重新生成。
  1) **后端**：`session.undo` RPC 新增可选 `count` 参数，镜像 CLI `undo_last(n)`
  （从尾部收集最近 N 条真实用户消息——沿用 `role=="user" and not display_kind`
  判定——取最旧者为截断点删其后全部；缺省 `count` 时行为与原来完全一致）；
  2) **前端**：`handleEditMessage` 计算目标消息到末尾的真实用户轮数 `turns` →
  `session.undo { session_id, count: turns }`，成功且 `removed>0` 后本地
  `trim` reducer 截断到目标消息之前（并清空 clarify/subagents/todos 临时态防
  stale 卡片残留）→ `sendChatPrompt` 重发编辑文本；会话 running 时 `session.undo`
  返回 4009 → 显示「会话正忙」banner，安全降级不重发；
  3) i18n：`chat.editMessage` / `chat.editBusy`（en/zh，其余语言回退英文）。
  测试 404 passed（新增 13 个）。改动：`tui_gateway/methods_session.py` +
  `web/src/pages/ChatPage.tsx` + `ChatMessageList.tsx` + `MessageBubble.tsx` +
  `chat-event-stream.ts`。
- **v1.7**（稳定）：**TUI 功能对齐（高+中价值）** — 气泡视图补齐官方终端
  的常用能力：
  1) **停止生成**：`session.interrupt` RPC，agent 运行中显示红色 Stop 按钮；
  2) **撤销/重试**：`session.undo` RPC + 重发最后用户消息（↶/↻ 按钮）；
  3) **当前模型显示 + 切换**：状态栏显示 model/reasoning effort，点击打开
  `ModelPickerDialog`（复用官方 `model.options` + `config.set`，发送
  `/model … --session` 到 PTY）；4) **子代理 HUD**：`subagent.start/progress/
  complete` 事件渲染 `⛓ N`；5) **todo 面板**：`tool.start.todos` 渲染任务
  列表+进度（📋 done/total）；6) **会话状态栏**（SessionStatusBar）：忙碌指示
  （session.info.running）、会话时长（本地计时）、cwd、后台任务数
  （process.list 轮询）、排队计数；7) **压缩 banner 保持**（v1.6 已有）。
  全部复用现有事件/RPC，零后端改动。测试 345 passed。
- **v1.6.1**（当前，稳定）：**上下文用量条真正显示** — 用户反馈「看不到上下文用量」。
  根因：① PTY 启动时发出的初始 `session.info` 早于浏览器订阅 `/api/events`
  （实时广播、无重放），usage 一直是 null；② 新会话 usage 全 0 时组件 return null
  不渲染。修复：后端 `/api/events` 新订阅者接入时从 per-channel active-session
  文件 + 内嵌 gateway 的 live session 记录**补发一次 session.info**（时序无关）；
  `ChatUsageBar` 有 usage 即渲染（0 token 兜底）；事件流跟踪帧级 `session_id`
  （`lastEventSessionId`），ChatPage 拿到会话 id 后调 `session.usage` RPC 主动
  刷新（覆盖 agent 构建空窗）。验证：订阅 events 立即收到完整 usage
  （context_used 371890 / max 1M / 37%）。见上方「故障排查」。
- **v1.6**：**终端会话同步 + 上下文用量/压缩兼容** —
  1) **内部切会话同步**：TUI 内 `/resume`、`/sessions`、`/compact`（session key
  旋转）后，`session.info` 携带新 `stored_session_id`，气泡 reducer 检测到
  会话切换即清空旧消息，ChatPage 自动重拉该会话历史（不 rewrite URL resume，
  避免 channel 旋转导致 PTY 重连）；2) **上下文使用量**：解析
  `session.info.usage`（context_used/max/percent/compressions），新增
  `ChatUsageBar` 组件显示用量条 + 压缩次数；3) **压缩兼容**：`status.update`
  kind=compacting/compressing 驱动「正在压缩上下文」banner，聊天框发
  `/compact` 立即显示；4) `parseEventFrame` 提取帧级 `session_id`（供会话
  边界识别）。见上方「AI 架构说明」与「故障排查」。
- **v1.5**：**会话切换脱节修复** — 侧边栏切会话「气泡加载历史但终端
  是新对话、打字无效」双 bug 修复：前端 `fresh=1` 与 `resume` 互斥 + 同步 rotate
  attach token（杜绝幽灵 PTY 同 channel 双发）；后端 attach 复用前校验
  active_session_file 实际会话（`_live_sid_matches_resume`，兼容存储 id/短 id 两种
  格式），漂移时强制重建 PTY（`PtySessionRegistry.discard`）。见上方「故障排查」。
  另修复 lint 依赖缺失（eslint 相关包补入 devDependencies）+ `PortalSelect.tsx`
  未使用参数清理。
- **v1.4**：**完整汉化** — zh 翻译补全（63 key）、默认语言中文（浏览器
  `zh*` 识别 + localStorage 优先）、Chat 核心组件全 i18n（`chat` 命名空间：
  ChatInput/MessageBubble/ClarifyCard/MediaImage/ChatMessageList）、所有语言文件
  同步新 key（14 语言 × sessions/chat）
- **v1.3**：v1.2.2 + 会话列表**当前会话高亮**（`session.info.stored_session_id`，
  fresh chat 也识别）+ **排序切换**（最近活跃/创建时间）+ **消息时间戳**
  （`YYYY-MM-DD HH:mm:ss`，用户/助手/系统气泡）+ **子代理会话识别/标记**
  （列表 `include_children` 包含 delegate 子会话，「子代理」徽标，`_delegate_from` 判定）
- **v1.2.2**：v1.2.1 + 会话列表自动刷新（resume/30s 轮询/回前台）+ PortalSelect
  思考下拉（portal 定位防裁剪）+ **气泡事件流修复**：subagent 会话 transport 被 detach 时
  事件不再静默丢弃（`write_json` 回退 live transports 广播，见下方「故障排查」）
- **v1.2.1**：v1.2 + thinking 折叠预览固定高度（防闪）+ 终端命令徽标/提示
  （`terminal-commands.ts` 单一事实源；chat 发送终端专属命令时本地提示气泡；命令仍转发终端）
- **v1.2**：v1.1 + 有序片段（segments 时间线）+ thinking 折叠预览
  + 表格解析修复 + 移动端键盘适配
- **v1.1**：气泡对话 + 工具卡片 + 选项卡片 + 表格 + 图片 + 历史加载
  + 自动滚动开关；流式渲染性能修复（纯文本流式 + 完成后格式化）
- **v1.0**：气泡对话 + 工具卡片 + 选项卡片 + 表格 + 图片 + 历史加载（流式期间全量 markdown，
  长输出卡死，已修复）
- v0（已废弃）：基于终端文本解析的自定义，混乱且脆弱，已弃用

## 📄 License

MIT — 与上游 Hermes Agent 一致。
