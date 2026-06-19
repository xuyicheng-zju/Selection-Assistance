# Selection-Assistance

> Linux 桌面上的「豆包式」划词助手 —— 选中即翻译/解释，带音标、多轮追问、看图 OCR，深度适配 Linux 工作流。

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
| 没有划词即弹的翻译工具 | 全局热键 `Ctrl+Shift+D`，选中文字自动复制并弹浮窗 |
| VSCode / 终端 / PDF 阅读器里划词被应用自身弹窗抢占 | 热键 + `xdotool` 自动复制选区，不依赖目标应用配合，与原生弹窗**共存** |
| 翻译完还想再问一句「举个例子」无能为力 | 浮窗内多轮追问，前端维护完整对话历史 |
| 遇到代码报错截图、公式图片无法识别 | 多模态自动路由 Qwen-VL，截图 OCR / 看图解释 / 图文问答 |
| 现有工具翻译质量差、不懂上下文 | DeepSeek-v4-pro 驱动，带思考模式，理解语境 |
| 英文单词没音标、没词性 | 三级音标混合链（词典 API + 本地 + LLM 兜底） |

---

## ✨ 功能特性

- **划词翻译 / 解释**：选中文字 → 热键 → 流式展示译文/解释（豆包式打字机效果）
- **双热键**：`Ctrl+Shift+D` 直接翻译，`Ctrl+Shift+E` 直接解释，无需二次点击
- **带音标**：英文单词出 IPA / 英音 / 美音，中文出带调拼音
- **思考模式**：DeepSeek `enable_thinking`，浮窗 💡 按钮一键开关，可看推理过程
- **多轮追问**：翻译/解释后在浮窗内继续提问（「换个说法」「举个例句」「还有什么意思」）
- **多模态**：截图 OCR 提取文字、看图解释、图文混合问答（自动切 Qwen-VL）
- **跨应用兼容**：全局热键 + 自动复制，VSCode / 终端 / 浏览器 / PDF 都能用
- **浮窗可拖动**：无框圆角浮窗，标题栏拖拽，alwaysOnTop

---

## 🖥️ 支持的系统与场景

### 操作系统

| 系统 | 支持度 | 说明 |
|------|--------|------|
| **Linux (X11)** | ✅ 完全支持 | 主要目标平台。自动复制选区需 `xdotool` |
| Linux (Wayland) | ⚠️ 部分支持 | 划词热键可用，但 `xdotool` 在 Wayland 下失效，需手动 Ctrl+C |
| macOS | ⚠️ 未测试 | Electron 跨平台，热键改 `Cmd` 前缀理论上可用 |
| Windows | ⚠️ 未测试 | 需把 `xdotool` 替换为 PowerShell 模拟按键 |

> **推荐环境**：Ubuntu / Debian 系 + X11 桌面（GNOME / KDE / XFCE 均可）。

### 划词场景兼容性

| 场景 | 划词方式 | 效果 |
|------|----------|------|
| VSCode / JetBrains 等 IDE | 选中 → `Ctrl+Shift+D` | ✅ 自动复制并翻译（与 IDE 自带划词弹窗共存） |
| 终端 (GNOME Terminal / Konsole / Alacritty) | 选中 → `Ctrl+Shift+D` | ✅ 终端选中即复制，热键直接读到 |
| Chrome / Firefox / Edge | 选中 → `Ctrl+Shift+D` | ✅ 自动复制 |
| PDF 阅读器 (Evince / Okular) | 选中 → `Ctrl+Shift+D` | ✅ 自动复制（部分受保护文档需手动 Ctrl+C） |
| 论文阅读器 (Zotero) | 选中 → `Ctrl+Shift+D` | ✅ |
| 任意文本框 | 选中 → `Ctrl+Shift+D` | ✅ |

> 设计原则：**热键优先 + 自动复制**，保证任何应用都能用，且与原生划词弹窗共存而非互斥。

---

## 🏗️ 架构

```
selection-assistant/
├── backend/    # FastAPI 后端 —— DeepSeek-v4-pro（纯文本）+ Qwen-VL（多模态），统一走百炼
└── frontend/   # Electron + React 划词浮窗 —— 全局热键 + 流式渲染 + 追问
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
cd selection-assistant/backend
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY（百炼控制台 → API-KEY 管理）
uv sync
```

### 运行（开发模式）

```bash
# 终端 1：后端
cd backend
uv run python -m uvicorn app.main:app --reload --port 8000

# 终端 2：前端
cd frontend
npm install
npm run dev
```

### 打包（生产模式，内嵌后端）

```bash
cd frontend
npm run dist       # 输出到 release/，双击运行自动起后端
```

---

## ⌨️ 使用方式

| 操作 | 效果 |
|------|------|
| 选中文字 + `Ctrl+Shift+D` | 直接翻译（流式展示） |
| 选中文字 + `Ctrl+Shift+E` | 直接解释 |
| 浮窗内输入 + Enter | 多轮追问 |
| 点 💡 按钮 | 开关思考模式 |
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
└── tests/                   # pytest（42 用例，外部 API 全 mock）

frontend/
├── electron/                # 主进程：内嵌后端、全局热键、窗口管理
│   ├── main.ts / backend.ts / windows.ts / preload.ts / ipc.ts
└── src/                     # 渲染进程（React）
    ├── components/          # PopupView / PhoneticsBar / ResultPane / ThinkingPanel
    ├── hooks/               # useSelectionAction（初始动作 + 多轮追问状态机）
    └── lib/                 # api / sse（POST SSE 解析）/ markdown / types
```

---

## 🧪 测试

```bash
cd backend && uv run python -m pytest -q          # 42 用例
cd frontend && npx vitest run                     # 15 用例（SSE 解析 + API 客户端）
cd frontend && npx tsc --noEmit                   # 类型检查
```

---

## 📝 设计要点

- **统一百炼接入**：DeepSeek 与 Qwen-VL 共用一个 Key 与端点
- **同端点自动路由**：按「有无图片」自动切模型，前端零感知
- **思考模式可控**：默认关闭（快），浮窗 💡 一键开（深），请求级 `X-Enable-Thinking` header 控制
- **音标三级兜底**：词典 API → 本地 eng_to_ipa/pypinyin → LLM 生成，任一失败不阻塞
- **POST SSE**：流式端点是 POST，自写 `fetch + ReadableStream` 解析器
- **跨应用划词**：全局热键 + xdotool 自动复制，与 VSCode 等原生弹窗共存

---

## 📄 License

MIT
