# selection-assistant / frontend

豆包桌面版式划词浮窗 —— Electron + React + Vite + Tailwind，对接 [selection-assistant/backend](../backend)。

## 功能

- **划词翻译 / 解释**：选中文字 → 鼠标旁弹「翻译/解释」迷你按钮（豆包式），点击后浮窗流式展示结果。
- **带音标**：英文单词出 IPA/英音/美音，中文出带调拼音。
- **思考过程**：DeepSeek `enable_thinking` 的 reasoning 单独折叠展示。
- **多轮追问**（核心）：翻译/解释后可在浮窗内继续提问，如「换个说法」「举个例句」「还有什么意思」，前端维护完整对话历史。
- **全局热键**：`Ctrl+Shift+D`（Mac: `Cmd+Shift+D`）→ 读剪贴板 → 直接弹浮窗。**VSCode、终端等自带划词弹窗的应用**用这条路径，与原生弹窗共存。
- **看图 / OCR**：截图后走 `/api/explain/vision` 或 `/api/ocr`（多模态自动切 Qwen-VL）。
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

### 生产 / 打包

```bash
npm run build        # 编译 electron + 构建 Vite 产物
npm run dist         # electron-builder 打包成安装包（release/）
```

打包后双击运行：Electron 自动启动内嵌后端进程（`uv run uvicorn`，端口 8000 起自动避让）。

## 使用方式

| 场景 | 操作 |
|------|------|
| 任意应用选词翻译 | 选中文字 → 点鼠标旁的「翻译」按钮 |
| VSCode / 终端等 | 选中文字（或 Ctrl+C 复制）→ 按 `Ctrl+Shift+D` |
| 追问 | 浮窗底部输入框输入，Enter 发送 |
| 看图解释 | 调 `/api/explain/vision`（需前端扩展上传图片） |

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
│   ├── PhoneticsBar.tsx      IPA/UK/US/拼音
│   ├── ResultPane.tsx        Markdown 渲染 + 流式打字机光标
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
`Ctrl+Shift+D` → 读剪贴板 → `positionAtPoint` 弹浮窗 → 默认翻译 Tab。不依赖目标应用配合，与自带划词弹窗共存。

## SSE 说明
后端流式端点是 **POST**（浏览器原生 `EventSource` 只支持 GET），因此 `src/lib/sse.ts` 用 `fetch` + `ReadableStream` 手写解析器，按 `\n\n` 切事件块，分发 `phonetics/thinking/delta/done/error`。

## 测试
```bash
npx vitest run       # 15 个：SSE 解析、API 客户端（multipart/JSON/错误体）
npx tsc --noEmit     # 类型检查
```

## 与后端的契约要点
- 错误体：`{ detail: { code, message } }`（FastAPI 信封），`api.ts` 已解析。
- CORS：后端 `.env` 的 `CORS_ORIGINS` 已含 `http://localhost:8000`（内嵌后端源）和 `5173`（Vite dev）。
- 音标：`{ ipa, uk, us, pinyin }`，短语/句子为空。
