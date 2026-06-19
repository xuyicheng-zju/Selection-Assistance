# 小红书 PR 文案

---

## 标题（3 选 1，建议用第 1 个）

1. 🚨救命！Linux终于有豆包同款划词翻译了！选中即译+多轮追问+看图OCR🔥
2. 从Win/Mac换到Linux后最崩溃的事…现在终于解决了😭
3. 开源｜在Linux复刻豆包桌面版划词助手，DeepSeek驱动⚡

---

## 正文

姐妹们/兄弟们！！
用Linux做科研/敲代码的痛谁懂啊🆘

Windows有有道、Mac有Bob，选中即弹翻译丝滑得不行
结果换到Linux……😅 星火商店里翻烂了，能用的划词工具寥寥无几，还都在VSCode/终端里直接失效

每次读英文论文/查报错，只能：Ctrl+C → 切浏览器 → 粘贴 → 翻译 → 切回来
一天重复几百次，人都麻了💥

所以我自己搓了一个！开源免费👇

✨ **Selection-Assistance｜Linux划词助手**

🎯 解决了什么：
✅ 选中文字按 `Ctrl+Shift+D` → 直接弹翻译浮窗（带音标IPA/英音/美音/拼音）
✅ `Ctrl+Shift+E` → 直接出解释（定义+词性+例句+近义词）
✅ 翻译完还能继续追问！"换个说法""举个例句""还有什么意思"随便问💬
✅ 截图也能识别！代码报错截图、公式图，丢进去直接解释（自动切Qwen-VL多模态）
✅ DeepSeek思考模式，💡一键开关，能看到AI怎么推理的

💻 最爽的是兼容性：
VSCode / 终端 / Chrome / PDF / Zotero 全都能用！
原理是全局热键+自动复制选区，跟应用自带弹窗共存不打架
再也不用跟VSCode的划词弹窗抢了😭感动

🧠 技术栈（给会敲码的姐妹）：
• 后端：FastAPI + DeepSeek-v4-pro + Qwen-VL（统一走阿里云百炼，一个key搞定）
• 前端：Electron + React + Tailwind，豆包同款流式打字机效果
• 全局热键 + xdotool 自动复制，跨应用通杀
• 后端42个测试 + 前端15个测试全过✅

🌍 支持：Linux X11 完全支持（Ubuntu/Debian推荐），Wayland部分支持，Mac/Win未测但理论上能跑

📦 开源地址（GitHub）：
搜「Selection-Assistance」或主页见，MIT协议，欢迎star⭐和PR！

📚 已经写好详细README，clone下来照着跑就行，配个百炼API key就能用

---

💬 用Linux的姐妹举个手🙋‍♀️ 你们平时怎么查单词翻译的？评论区聊聊
要是装的时候有问题也可以问，我看到就回～

#Linux #程序员日常 #开源项目 #划词翻译 #DeepSeek #效率工具 #科研狗 #代码 #Linux桌面 #翻译软件 #开发者工具
