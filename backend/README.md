# selection-assistant / backend

豆包桌面版式划词后端：鼠标划词后可选**翻译（带音标）**或**解释**，并能**直接处理图像**（截图 OCR、看图解释、图文问答），还支持**多轮追问**。

所有大模型调用**统一走阿里云百炼（DashScope）**，一个 Key 搞定：

| 场景 | 模型 | 能力 |
|------|------|------|
| 纯文本（选中文字）翻译/解释 | `deepseek-v4-pro` | 带 `enable_thinking` 思考过程；音标由词典 API + 本地兜底 + LLM 兜底 |
| 含图像 / 图文 | `qwen-vl-max` | 截图 OCR 提取文字、看图解释/问答、图文混合问答 |

**多模态自动路由**：`/api/translate`、`/api/explain` 同一端点，根据请求里有没有图片自动切到对应模型，前端无需关心。

---

## 快速开始

```bash
cd selection-assistant/backend
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY（百炼控制台 → API-KEY 管理）

uv sync --extra dev                     # 安装依赖
uv run uvicorn app.main:app --reload --port 8000
```

打开 http://127.0.0.1:8000/docs 查看交互式 API 文档。

健康检查：

```bash
curl http://127.0.0.1:8000/api/health   # {"ok":true}
```

---

## API 一览

所有翻译/解释/OCR 端点用 `multipart/form-data`（`text` + `images` 两个可选字段）。

### 1. 翻译 `POST /api/translate`

```bash
curl -X POST http://127.0.0.1:8000/api/translate \
  -F "text=serendipity" \
  -F "target_lang=zh"
```

返回：

```json
{
  "text": "serendipity",
  "phonetics": {"ipa": "/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/", "uk": null, "us": "/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/", "pinyin": null},
  "translation": "意外发现珍奇事物的本领(n.)",
  "detected_lang": null,
  "model": "deepseek-v4-pro",
  "reasoning": "（DeepSeek 思考过程，前端可隐藏）"
}
```

中文单词会带拼音：`"phonetics": {"pinyin": "nǐ hǎo"}`。

### 2. 解释 `POST /api/explain`

```bash
curl -X POST http://127.0.0.1:8000/api/explain \
  -F "text=closure" \
  -F "style=detailed"
```

返回 Markdown 解释（定义、词性、用法、例句、近义词），同样带音标。

### 3. 流式（豆包式打字机）`POST /api/translate/stream`、`POST /api/explain/stream`

Server-Sent Events，事件序列：

```
event: phonetics        ← 最先到，前端可立即渲染音标
data: {"phonetics": {"ipa": "/əˈfɛ.mə.ɹəl/", ...}}

event: thinking         ← DeepSeek 思考过程增量（可选展示/折叠）
data: {"delta": "首先，理解用户的要求"}

event: delta            ← 正文增量
data: {"delta": "短暂的"}

event: done             ← 结束，带模型名
data: {"model": "deepseek-v4-pro", "detected_lang": null}
```

出错时发 `event: error`，`data: {"code":"...","message":"..."}`。

### 4. 多模态（含图自动走 Qwen-VL）

直接给 `/api/translate` 或 `/api/explain` 传 `images` 即可，自动路由：

```bash
# 看图解释
curl -X POST http://127.0.0.1:8000/api/explain \
  -F "text=这张图怎么用" \
  -F "images=@screenshot.png"
```

纯 OCR 提取文字：

```bash
curl -X POST http://127.0.0.1:8000/api/ocr -F "images=@screenshot.png"
# -> {"texts": ["..."], "full_text": "...", "model": "qwen-vl-max"}
```

### 5. 取词辅助 `POST /api/selection` / `GET /api/detect`

热键触发时，前端把选区/剪贴板文本 POST 上来，后端返回类型与建议动作：

```bash
curl -X POST http://127.0.0.1:8000/api/selection \
  -H "Content-Type: application/json" \
  -d '{"text": "serendipity"}'
# -> {"text":"serendipity","kind":"word","needs_phonetics":true,
#     "suggested_actions":["translate","explain"]}
```

---

## 配置（`.env`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DASHSCOPE_API_KEY` | （必填） | 百炼 Key，DeepSeek + Qwen-VL 共用 |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 百炼 OpenAI 兼容端点 |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | 纯文本模型 |
| `ENABLE_THINKING` | `true` | DeepSeek 思考模式（reasoning_content） |
| `QWEN_VL_MODEL` | `qwen-vl-max` | 多模态模型 |
| `DEFAULT_TARGET_LANG` | `zh` | 默认目标语言 |
| `CORS_ORIGINS` | `http://localhost:5173,...` | 允许的前端来源 |

---

## 音标混合策略

`app/services/phonetics.py`，逐级兜底，任一失败不阻塞主流程：

- **英文单词**：Free Dictionary API（`api.dictionaryapi.dev`，含 UK/US）→ 失败转 `eng_to_ipa` 本地 → 再失败用 DeepSeek 生成。
- **中文**：`pypinyin` 本地输出带调拼音。
- **短语/句子/代码**：不查音标。

---

## 多模态自动路由

`app/router_engine.py`：

```
输入 text?, images?
├── images 非空 → Qwen-VL（OCR / 看图 / 图文问答）
└── images 空 + text 非空 → DeepSeek v4-pro（翻译/解释）
```

响应里的 `model` 字段透出实际用了哪个模型，前端可显示。

---

## 🔑 与 VSCode 等自带划词弹窗应用的兼容方案

这是本项目的核心难点：VSCode、浏览器、PDF 阅读器、IDE 常自带划词弹窗，会**抢占选中事件**，导致「选中即弹翻译」拿不到选区。本后端提供两条互补路径保证这些应用里划词也能用。

### 方案 A：全局热键取词（推荐，覆盖最广）

完全不依赖目标应用配合。前端（Electron/Tauri）注册一个**全局热键**（如 `Ctrl+Shift+D`），触发时：

1. 读取当前选区（`selection` / 原生 API）或剪贴板文本；
2. POST 到 `POST /api/selection`，拿到 `kind` 和 `suggested_actions`；
3. 在鼠标位置弹出「翻译 / 解释」浮窗，用户点击后再调 `/api/translate` 或 `/api/explain`。

这条路径对 **VSCode、Chrome、终端、PDF 阅读器**全部适用——因为热键是系统级的，不受应用内划词弹窗影响。用户可以在 VSCode 里正常用 VSCode 自带划词，需要我们的翻译时按热键即可，**两者并存、互不冲突**。

### 方案 B：OCR 截图兜底

连选区都拿不到的应用（某些受保护文档、远程桌面），用热键触发截屏 → 调 `POST /api/ocr` 取词 → 再走翻译/解释。也可直接 `POST /api/explain -F images=@shot.png` 一步看图解释。

### 前端集成要点（Electron 示例）

```js
// 注册全局热键
globalShortcut.register('CommandOrControl+Shift+D', async () => {
  // 1. 取选区/剪贴板（Electron clipboard / 渲染进程 selection）
  const text = getSelectionOrClipboard();
  if (!text) { triggerScreenCapture(); return; }  // 取不到就截图走 OCR
  // 2. 调后端判断类型与建议动作
  const { suggested_actions } = await api.post('/api/selection', { text });
  // 3. 在光标位置弹浮窗
  showPopupAtCursor(text, suggested_actions);  // ['translate','explain']
});
```

### 常见应用分类建议

| 应用 | 推荐策略 |
|------|----------|
| VSCode / JetBrains | 全局热键（自带划词弹窗会抢占选中事件，热键不冲突） |
| Chrome / Edge | 全局热键；或浏览器扩展接管选中 |
| PDF 阅读器 / 受保护文档 | OCR 截图兜底（部分阅读器禁用选区复制） |
| 终端 | 全局热键（终端选区即复制，热键直接读剪贴板） |
| 普通文本编辑器 | 可选「选中即弹悬浮按钮」，被拦截则回退热键 |

**核心原则**：热键优先 + OCR 兜底，保证任何应用都能用，且与原生划词弹窗共存而非互斥。

---

## 测试

```bash
uv run pytest -q          # 38 个用例，外部 API 全 mock，不消耗真实额度
```

覆盖：音标混合链、文本分类、多模态路由、翻译/解释（非流式 + SSE 事件序列）、OCR/看图、错误传播。

---

## 目录结构

```
app/
├── main.py              # 入口：lifespan、CORS、路由挂载
├── config.py            # 百炼统一配置
├── schemas.py           # 请求/响应/SSE 模型
├── deps.py              # 客户端单例 + 生命周期
├── router.py            # 所有 API 端点（含 SSE）
├── router_engine.py     # 多模态自动路由
├── prompts.py           # 翻译/解释/OCR/看图 prompt
└── services/
    ├── deepseek.py      # DeepSeek（百炼，enable_thinking）
    ├── qwen_vl.py       # Qwen-VL（百炼，多模态）
    ├── phonetics.py     # 音标混合链
    ├── translate.py     # 翻译编排
    ├── explain.py       # 解释编排
    └── vision.py        # OCR / 看图 / 图文问答
tests/                   # pytest + respx
```

---

## 设计约定

- **统一百炼接入**：DeepSeek 与 Qwen-VL 共用一个 `DASHSCOPE_API_KEY` 与端点。
- **同端点自动路由**：`/api/translate`、`/api/explain` 按「有无图片」自动切模型，前端零感知。
- **思考模式**：DeepSeek 的 `reasoning_content` 单独透出，前端可折叠展示。
- **音标三级兜底**：词典 → 本地 → LLM，任一失败不影响主流程。
- **错误统一**：`{"detail":{"code":...,"message":...}}` + 合适状态码；SSE 用 `error` 事件。
- **全程中文界面文案**。
