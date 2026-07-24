# selection-assistant / frontend

豆包桌面版式划词浮窗 —— Electron + React + Vite + Tailwind，对接 [selection-assistant/backend](../backend)。

## 功能

- **划词翻译 / 解释**：任意应用选中文字后按全局热键，浮窗立即流式展示结果；主窗口内选区也支持迷你操作条。
- **带音标**：英文单词出 IPA/英音/美音，中文出带调拼音。
- **思考过程**：DeepSeek `enable_thinking` 的 reasoning 单独折叠展示。
- **多轮追问**（核心）：翻译/解释后可在浮窗内继续提问，如「换个说法」「举个例句」「还有什么意思」，前端维护完整对话历史。
- **独立 Chat + 多图对话**：主窗口可直接进入 Chat；翻译、解释和 Chat 均支持最多 8 张图片，可多选、拖拽、连续读取剪贴板图片或在输入框按 `Ctrl+V`。
- **双全局热键**：`Ctrl+Shift+D` 翻译，`Ctrl+Shift+E` 解释；通过 `xdotool` 获取本次真实选区，与 VSCode、终端等应用的原生弹窗共存。
- **安全的空选区行为**：没有新选区时不读取旧剪贴板、不发模型请求；已有对话时只唤回窗口继续 Chat。
- **平滑流式渲染**：SSE token 约 30 FPS 合帧提交，完成消息缓存 Markdown，自动滚动不会打断用户阅读。
- **多模态输入**：图片随翻译、解释或 Chat 自动路由到 Qwen-VL，后续追问会持续保留视觉上下文。
- **内嵌后端**：Electron 启动时自动 spawn 后端进程，退出时清理，无需手动起后端。

## 快速开始

```bash
# 1. 先确保后端依赖装好（backend/.env 已配好 DASHSCOPE_API_KEY）
cd ../backend && uv sync

# 2. 前端
cd ../frontend
npm install
npm run dev          # 开发：Vite(5173) + Electron 同时起，后端独立运行
```

开发模式下，Electron 加载 `http://localhost:5173`，后端需另开终端 `uv run uvicorn app.main:app --port 8000`。

### 安装为 Linux 桌面 App

```bash
cd frontend
npm run install:linux
```

该命令会构建生产版，并在当前用户的应用菜单与桌面安装“划词助手”图标，同时开启开机静默启动。点击窗口关闭按钮只会隐藏到系统托盘；从托盘菜单或主窗口底部选择“退出”才会彻底结束进程。开机自启也可在主窗口“设置”中随时关闭。

### 生产 / 打包

```bash
npm run build        # 编译 electron + 构建 Vite 产物
npm run dist         # electron-builder 打包成安装包（release/）
```

打包后双击运行：Electron 自动启动内嵌后端进程（`uv run uvicorn`，端口 8000 起自动避让）。

## 使用方式

| 场景 | 操作 |
|------|------|
| 任意应用选词 | 选中文字 → 按 `Ctrl+Shift+D` 翻译或 `Ctrl+Shift+E` 解释 |
| 未选中文字 | 有历史时唤回原会话；无历史时静默，不发送请求 |
| 追问 | 浮窗底部输入框输入，Enter 发送 |
| 多图输入 | 多选/拖拽图片，或连续点“从剪贴板”；输入框内也可按 `Ctrl+V` |
| 独立 Chat | 主窗口输入文字或图片后点击 `Chat` |

## 架构

```
electron/                     主进程
├── main.ts                   入口：lifespan、托盘、全局热键、IPC
├── backend.ts                内嵌 uvicorn 子进程管理 + health 探测
├── windows.ts                窗口工厂（主窗/悬浮按钮/浮窗）+ 鼠标定位
├── selection.ts              跨应用取词（剪贴板优先）
├── ipc.ts                    IPC 通道与 AppSettings 类型
└── preload.ts                contextBridge 暴露 doubaoAPI + 后端地址

src/                          渲染进程（React）
├── main.tsx                  主窗口：设置 + 健康状态 + 手动测试 + 选区上报
├── popup.tsx                 划词浮窗入口（接收 ACTION_RUN 触发）
├── actionButton.tsx          悬浮迷你按钮入口
├── components/
│   ├── PopupView.tsx         浮窗主体：Tab、音标、结果、思考、追问输入
│   ├── ImageAttachments.tsx  多图选择、拖拽、剪贴板读取与缩略图
│   ├── PhoneticsBar.tsx      IPA/UK/US/拼音
│   ├── MessageList.tsx       历史消息 + Markdown 缓存 + 智能贴底
│   ├── ThinkingPanel.tsx     折叠思考过程
│   └── ErrorBanner.tsx
├── hooks/
│   └── useSelectionAction.ts 初始动作 + 多轮追问状态机
└── lib/
    ├── types.ts              与后端 schemas 对齐
    ├── api.ts                multipart / JSON / 错误体解析
    ├── sse.ts                POST SSE 解析器（fetch + ReadableStream）
    └── markdown.ts           marked + DOMPurify
```

### 双窗口 + 三入口
- **主窗口** (`index.html`)：托盘入口，设置、健康检查、手动测试。
- **悬浮按钮窗** (`actionButton.html`)：`frame:false`，贴鼠标，两个按钮。
- **划词浮窗** (`popup.html`)：`frame:false, alwaysOnTop`，展示结果 + 追问。

### 划词交互流
1. 任意应用选中 + `mouseup` → 主窗口上报选区+坐标 → 主进程显示悬浮按钮窗。
2. 点「翻译/解释」→ 打开浮窗 → `useSelectionAction.runInitial()` → SSE 流式。
3. 事件：`phonetics`（音标先出）→ `thinking`（折叠）→ `delta`（打字机）→ `done`。
4. **追问**：输入框 Enter → `useSelectionAction.ask()` → `/api/chat/stream`，前端把历史一起发。

### 全局热键流（VSCode 兼容）
`Ctrl+Shift+D/E` → 写入剪贴板哨兵 → `xdotool` 复制当前选区 → 验证本次确有新文本 → `positionAtPoint` 弹浮窗。没有新选区时不发送请求；若已有会话则仅唤回窗口。

## SSE 说明
后端流式端点是 **POST**（浏览器原生 `EventSource` 只支持 GET），因此 `src/lib/sse.ts` 用 `fetch` + `ReadableStream` 手写解析器，按 `\n\n` 切事件块，分发 `phonetics/thinking/delta/done/error`。

## 测试
```bash
npm test             # 21 个：SSE 解析、API 客户端、Markdown
npx tsc --noEmit     # 类型检查
```

## 与后端的契约要点
- 错误体：`{ detail: { code, message } }`（FastAPI 信封），`api.ts` 已解析。
- CORS：后端 `.env` 的 `CORS_ORIGINS` 已含 `http://localhost:8000`（内嵌后端源）和 `5173`（Vite dev）。
- 音标：`{ ipa, uk, us, pinyin }`，短语/句子为空。
