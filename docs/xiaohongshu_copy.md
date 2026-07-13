# 小红书发布宣传稿｜Selection-Assistance

## 标题备选

1. Linux 终于有一款顺手的划词助手了｜开源免费
2. 读论文不用反复切网页了：我给 Linux 做了个划词翻译
3. 开源了！Linux 划词翻译 + 连续追问，DeepSeek 驱动

推荐第 1 个，信息直接，也方便搜索。

## 封面文字

主标题：

> Linux 划词助手

副标题：

> 选中即译 · 连续追问 · 开源免费

角标：

> DeepSeek + Electron

## 正文

从 Windows / macOS 换到 Linux 之后，我一直缺一个真正顺手的划词工具。

读论文、看英文文档、查代码报错时，最常见的流程居然还是：

选中 → 复制 → 切浏览器 → 粘贴 → 翻译 → 再切回来。

一天重复几十次，非常打断思路。

所以我做了 **Selection-Assistance**，一个面向 Linux 桌面的开源划词助手。

现在可以这样用：

- ✨ 选中文字，按 `Ctrl + Shift + D`，直接翻译
- ✨ 按 `Ctrl + Shift + E`，直接解释概念、术语和代码
- ✨ 英文单词自动显示 IPA / 英音 / 美音，中文支持拼音
- ✨ 翻译完可以继续追问：“举个例子”“换个说法”“这段代码是什么意思”
- ✨ Markdown、代码块和 LaTeX 公式可以直接渲染
- ✨ DeepSeek 深度思考可随时开关
- ✨ 后端还提供 Qwen-VL 的 OCR / 看图解释能力

这次还专门重做了 UI 和流式性能：

- 新浮窗采用冷灰蓝的“聚焦镜片”设计，信息更清楚；
- 模型 token 会按浏览器刷新节奏合并渲染，高吞吐时不再疯狂重排；
- 已完成消息会缓存 Markdown，长对话更轻；
- 自动滚动只在你停留底部时跟随，上滚看内容不会被抢位置；
- 没有选中文字时，不会误用旧剪贴板，更不会把报错提示发给模型；
- 已经有对话时，空选区按快捷键只会唤回原窗口，方便继续 Chat。

我最在意的是跨应用体验。目前在 Linux X11 下，通过全局热键 + `xdotool` 自动复制选区，VSCode、JetBrains、Chrome、终端、PDF 阅读器和 Zotero 都可以走同一套操作。

技术栈：

- Electron + React + TypeScript
- FastAPI + SSE 流式输出
- DeepSeek-v4-pro + Qwen-VL
- marked + KaTeX + DOMPurify
- 后端 42 项测试、前端 20 项测试

项目已按 MIT 协议开源：

https://github.com/xuyicheng-zju/Selection-Assistance

如果你也在 Linux 上读论文、写代码或者啃英文文档，欢迎试试。觉得有帮助的话，可以点一个 Star；遇到兼容问题也欢迎提 Issue。

说明：目前主要支持 Linux X11。Wayland 对全局模拟复制有限制，XWayland 应用的可用性取决于桌面环境。

## 置顶评论

安装要点：需要 Node.js 20+、Python 3.11+、`uv` 和 `xdotool`，再配置一个阿里云百炼 `DASHSCOPE_API_KEY`。完整命令已经写进 GitHub README；安装卡住可以在评论区或 Issue 里告诉我系统版本和桌面环境。

## 标签

#Linux #Linux桌面 #开源项目 #划词翻译 #DeepSeek #程序员工具 #科研工具 #效率工具 #Electron #React #Python #GitHub

## 发布建议

- 首图放新版浮窗，选区示例建议使用 `serendipity` 或一段论文摘要。
- 第二张展示 VSCode / PDF 中“选中 → 快捷键 → 浮窗”的连续过程。
- 第三张展示多轮追问与 LaTeX 渲染。
- 最后一张放 GitHub 仓库名、安装依赖和 X11 支持说明。
