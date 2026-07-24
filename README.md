<p align="center">
  <img src="frontend/assets/icon.png" width="128" alt="Selection-Assistance Logo">
</p>

<h1 align="center">Selection-Assistance</h1>

> Linux 桌面上的现代划词与 AI 助手：选中即翻译/解释，也可独立 Chat；支持多图与剪贴板输入、音标、多轮追问、LaTeX、流式输出、后台托盘和开机自启。

---

## 💡 为什么做这个（Motivation）

如果你从 Windows/Mac 切到 Linux，会发现一个扎心的现实：**Linux 上几乎没有一款好用的划词翻译工具。**

- Windows 上有有道、必应、豆包、Quicker，选中即弹；
- macOS 上有 Bob、Easydict，体验丝滑；
- **Linux 上？** 星火商店里能用的寥寥无几，多数是基于老旧 Electron 壳的网页翻译，要么不支持划词热键，要么在 VSCode / 终端 / 浏览器里直接失效，多轮追问、看图 OCR 更是想都别想。

日常在 Linux 上读论文、看英文文档、查代码报错时，只能反复 `Ctrl+C` → 切到浏览器 → 粘贴 → 翻译，**割裂感极强**。

本项目就是为了补上这块短板：把豆包桌面版那种「选中即翻译、能追问、能看图」的现代体验带到 Linux。

### 核心痛点 → 解决方案

| Linux 上的痛点 | 本项目怎么解决 |
|----------------|----------------|
| 没有划词即弹的翻译工具 | 双全局热键 `Ctrl+Shift+D` / `Ctrl+Shift+E`，选中即翻译/解释 |
| VSCode / 终端 / PDF 阅读器里划词被应用自身弹窗抢占 | 热键 + `xdotool` 自动复制选区，与原生弹窗**共存** |
| 翻译完还想再问一句「举个例子」无能为力 | 浮窗内**聊天式多轮追问**，完整历史保留，支持新开会话 |
| 论文里的数学公式显示成 `$E=mc^2$` 原文 | **KaTeX 公式渲染**，行内/块级 LaTeX 正确显示 |
| 遇到代码报错截图、公式图片无法识别 | 多模态自动路由 Qwen-VL，截图 OCR / 看图解释 / 图文问答 |
| 现有工具翻译质量差、不懂上下文 | DeepSeek-v4-pro 驱动，带思考模式，理解语境 |
| 英文单词没音标、没词性 | 三级音标混合链（词典 API + 本地 + LLM 兜底） |
| 高吞吐模型输出时界面掉帧、滚动乱跳 | SSE token 合帧渲染、Markdown 缓存、智能贴底，保持连续流畅 |
| 没选中文字却误用旧剪贴板 | 新选区哨兵检测；空选区只唤回已有会话，绝不自动发请求 |

---

## ✨ 功能特性

### 划词翻译 / 解释
- **双热键直达**：`Ctrl+Shift+D` 直接翻译，`Ctrl+Shift+E` 直接解释，无需二次点击
- **丝滑流式输出**：先出音标再出正文；token 按浏览器节奏合并刷新，避免高吞吐时频繁重排
- **带音标**：英文单词出 IPA / 英音 / 美音，中文出带调拼音

### 多轮对话追问（核心）
- 浮窗内**聊天式 UI**：完整对话历史保留（user/assistant 气泡），新消息不覆盖旧消息
- 可继续提问：「换个说法」「举个例句」「还有什么意思」「更通俗的解释」
- **独立 Chat**：无需先划词，直接输入文字或图片开始新对话
- **空选区唤回**：已经有会话时，未选文字再按快捷键只会唤回窗口，方便继续 Chat，不会重跑旧内容
- **新会话按钮**：清空历史并重新处理当前选区，不会无限追加

### 思考模式
- DeepSeek `enable_thinking`，浮窗右上角「深度」按钮一键开关
- 默认关闭（快），开启后显示 AI 推理过程（可折叠）
- 设置持久化，请求级 `X-Enable-Thinking` header 控制

### LaTeX 公式渲染
- 行内 `$E=mc^2$`、块级 `$$\int_0^1 x^2 dx$$` 正确渲染
- KaTeX 驱动，支持分数、上下标、根号、积分、矩阵等
- 公式语法错误时原样显示，不崩溃

### 多模态（看图 / OCR）
- 翻译、解释和 Chat 均支持图文混合输入，单次最多 8 张图片（每张最大 12 MB）
- 支持文件多选、拖拽、点击「从剪贴板」和输入框内 `Ctrl+V`
- 后续追问持续携带图片上下文，可用于截图 OCR、看图解释和图文问答
- 同一端点**自动路由**：有图走 Qwen-VL，无图走 DeepSeek，前端无感知

### 桌面 App
- 应用菜单与桌面快捷方式自带专属 Logo
- 关闭窗口后驻留系统托盘，翻译与解释热键继续可用
- 支持开机静默启动，可在主窗口设置中随时关闭

### 跨应用兼容
- 全局热键 + `xdotool` 自动复制选区，**不依赖目标应用配合**
- 与 VSCode / 终端 / 浏览器自带弹窗**共存**而非互斥

### 浮窗体验
- 冷灰蓝「聚焦镜片」视觉语言，无框圆角、可拖拽、alwaysOnTop 置顶
- Markdown 渲染（代码块、列表、表格、加粗）与流式呼吸光标
- 历史消息缓存渲染；用户阅读上文时不抢滚动位置，回到底部后自动继续跟随
- 键盘焦点清晰，并尊重系统 `prefers-reduced-motion` 设置

---

## 🖥️ 支持的系统与场景

### 操作系统

| 系统 | 支持度 | 说明 |
|------|--------|------|
| **Linux (X11)** | ✅ 完全支持 | 主要目标平台。自动复制选区需 `xdotool` |
| Linux (Wayland) | ⚠️ 有限支持 | `xdotool` 通常无法读取原生 Wayland 应用选区；XWayland 应用视桌面环境而定 |
| macOS | ⚠️ 未测试 | Electron 跨平台，热键改 `Cmd` 前缀理论上可用 |
| Windows | ⚠️ 未测试 | 需把 `xdotool` 替换为 PowerShell 模拟按键 |

> **推荐环境**：Ubuntu / Debian 系 + X11 桌面（GNOME / KDE / XFCE 均可）。

### 划词场景兼容性

| 场景 | 划词方式 | 效果 |
|------|----------|------|
| VSCode / JetBrains 等 IDE | 选中 → `Ctrl+Shift+D` | ✅ 自动复制并翻译（与 IDE 自带划词弹窗共存） |
| 终端 (GNOME Terminal / Konsole / Alacritty) | 选中 → `Ctrl+Shift+D` | ✅ 终端选中即复制，热键直接读到 |
| Chrome / Firefox / Edge | 选中 → `Ctrl+Shift+D` | ✅ 自动复制 |
| PDF 阅读器 (Evince / Okular) | 选中 → `Ctrl+Shift+D` | ✅ 普通文本可自动复制；禁止复制的受保护文档不支持 |
| 论文阅读器 (Zotero) | 选中 → `Ctrl+Shift+D` | ✅ |
| 任意文本框 | 选中 → `Ctrl+Shift+D` | ✅ |

> 设计原则：**热键优先 + 自动复制**，保证任何应用都能用，且与原生划词弹窗共存而非互斥。

---

## 🏗️ 架构

```
selection-assistant/
├── backend/    # FastAPI 后端 —— DeepSeek-v4-pro（纯文本）+ Qwen-VL（多模态），统一走百炼
└── frontend/   # Electron + React 划词浮窗 —— 全局热键 + 流式渲染 + 聊天历史
```

| 层 | 技术 | 说明 |
|----|------|------|
| 后端 | Python 3.13 + FastAPI + httpx + uv | DeepSeek + Qwen-VL 统一走阿里云百炼（一个 Key） |
| 前端 | Electron 31 + React 18 + Vite + TypeScript + Tailwind | 内嵌后端进程，双击即用 |

### 大模型路由

所有调用统一走**阿里云百炼（DashScope）OpenAI 兼容端点**，单 Key：

| 场景 | 模型 | 能力 |
|------|------|------|
| 纯文本翻译/解释/追问 | `deepseek-v4-pro` | 带 `enable_thinking` 思考模式 |
| 含图（OCR/看图/图文问答） | `qwen-vl-max` | 多模态自动路由 |

> 同一端点 `/api/translate`、`/api/explain` 根据**有无图片自动切模型**，前端无感知。

### API 端点

| 端点 | 说明 |
|------|------|
| `POST /api/translate` `/api/explain` | 翻译/解释（multipart，含图自动切 Qwen-VL） |
| `POST /api/translate/stream` `/api/explain/stream` | SSE 流式（思考开关经 `X-Enable-Thinking` header 控制） |
| `POST /api/chat` `/api/chat/stream` | 独立 Chat / 多轮追问；JSON 走纯文本，multipart 支持多图 |
| `POST /api/ocr` | 截图 OCR 提取文字 |
| `POST /api/selection` `GET /api/detect` | 取词辅助 / 文本类型检测 |

---

## 🚀 快速开始

### 前置依赖

```bash
# 1. Linux 划词自动复制需要 xdotool
sudo apt install -y xdotool

# 2. Python + uv（后端）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 3. Node.js 20+（前端）
#    从 https://nodejs.org 安装
```

### 配置后端

```bash
git clone https://github.com/xuyicheng-zju/Selection-Assistance.git
cd Selection-Assistance/backend
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY（百炼控制台 → API-KEY 管理）
uv sync --extra dev
```

### 运行（开发模式）

```bash
# 终端 1：后端
cd workspace/Selection-Assistance/backend
uv run python -m uvicorn app.main:app --reload --port 8000

# 终端 2：前端
cd workspace/Selection-Assistance/frontend
npm install
npm run dev
```

> ⚠️ 注意：`uv run uvicorn` 在部分环境会 spawn 失败，请用 `uv run python -m uvicorn`。

### 打包（生产模式，内嵌后端）

```bash
cd frontend
npm run dist       # 输出到 release/，双击运行自动起后端
```

### 安装为 Linux 桌面 App

```bash
cd frontend
npm run install:linux
```

安装脚本会构建生产版，并为当前用户安装应用菜单入口、桌面快捷方式、系统图标与开机自启项。关闭主窗口只会隐藏到托盘；从托盘菜单或主窗口底部选择「退出」才会结束进程。

---

## ⌨️ 使用方式

| 操作 | 效果 |
|------|------|
| 选中文字 + `Ctrl+Shift+D` | 直接翻译（流式展示） |
| 选中文字 + `Ctrl+Shift+E` | 直接解释 |
| 未选文字 + 任一快捷键 | 有历史时唤回原会话；无历史时静默，不发送模型请求 |
| 浮窗内输入 + Enter | 多轮追问（历史保留） |
| 主窗口输入文字或图片后点 `Chat` | 开始独立对话 |
| 选择/拖拽图片，或点「从剪贴板」 | 添加一张或多张图片 |
| 输入框内 `Ctrl+V` | 直接粘贴剪贴板图片 |
| 点「新会话」按钮 | 清空历史并重新处理当前选区 |
| 点「深度」按钮 | 开关思考模式 |
| 拖动浮窗顶部 | 移动浮窗位置 |

> 热键可在主窗口「设置」里自定义。

---

## 📁 项目结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── router.py            # 所有 API 端点（含 SSE、思考开关）
│   ├── services/
│   │   ├── deepseek.py      # DeepSeek（百炼，enable_thinking 可控）
│   │   ├── qwen_vl.py       # Qwen-VL（百炼，多模态）
│   │   ├── phonetics.py     # 音标混合链（词典→本地→LLM）
│   │   ├── translate.py / explain.py / chat.py
│   │   └── vision.py        # OCR / 看图 / 图文问答
│   └── prompts.py
└── tests/                   # pytest（44 用例，外部 API 全 mock）

frontend/
├── electron/                # 主进程：内嵌后端、全局热键、窗口管理
│   ├── main.ts              # 双热键注册 + xdotool 自动复制 + 托盘/剪贴板
│   ├── desktop.ts           # 开机自启与 Linux 桌面集成
│   ├── backend.ts / windows.ts / preload.ts / ipc.ts
└── src/                     # 渲染进程（React）
    ├── components/
    │   ├── PopupView.tsx    # 浮窗主体（Tab、音标、消息列表、追问）
    │   ├── ImageAttachments.tsx # 多图、拖拽与剪贴板附件
    │   ├── MessageList.tsx  # 聊天气泡式历史 + 流式光标 + 公式渲染
    │   ├── PhoneticsBar.tsx / ThinkingPanel.tsx / ErrorBanner.tsx
    ├── hooks/
    │   └── useSelectionAction.ts  # 初始动作 + 多轮追问状态机
    └── lib/
        ├── api.ts           # API 客户端（multipart + 错误解析）
        ├── sse.ts           # POST SSE 解析（fetch + ReadableStream）
        ├── markdown.ts      # marked + KaTeX + DOMPurify
        └── types.ts
```

---

## 🧪 测试

```bash
cd backend && uv run python -m pytest -q          # 44 用例
cd frontend && npx vitest run                     # 21 用例（SSE/API/Markdown）
cd frontend && npx tsc --noEmit                   # 类型检查
```

---

## 📝 设计要点

- **统一百炼接入**：DeepSeek 与 Qwen-VL 共用一个 Key 与端点
- **同端点自动路由**：按「有无图片」自动切模型，前端零感知
- **多图上下文**：附件在初始请求与后续追问间持续保留，图文对话不丢上下文
- **桌面常驻**：单实例、托盘驻留与开机静默启动，窗口关闭后热键仍然可用
- **思考模式可控**：默认关闭（快），浮窗「深度」按钮一键开启，请求级 `X-Enable-Thinking` header 控制
- **聊天式历史**：前端维护完整对话，气泡 UI，支持新开会话而非无限追加
- **流式性能治理**：高频 SSE delta 先写入缓冲，再以约 30 FPS 合并提交；完成消息缓存 Markdown 结果
- **不打断阅读**：仅在消息列表贴底时跟随输出，用户上滚后不会被强制拉回底部
- **空选区安全**：哨兵检测区分本次选区与旧剪贴板；没有新文本时不发请求，只按需唤回已有会话
- **LaTeX 渲染**：KaTeX `output:html` + DOMPurify 放行 style，流式安全
- **音标三级兜底**：词典 API → 本地 eng_to_ipa/pypinyin → LLM 生成，任一失败不阻塞
- **POST SSE**：流式端点是 POST，自写 `fetch + ReadableStream` 解析器
- **跨应用划词**：全局热键 + xdotool 自动复制（等修饰键释放再发 Ctrl+C），与 VSCode 等原生弹窗共存

---

## 📄 License

MIT
