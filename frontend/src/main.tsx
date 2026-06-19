import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppSettings } from "../electron/ipc";
import { PopupView } from "./components/PopupView";
import { getBackendBase } from "./lib/api";
import "./styles/index.css";

function MainApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "fail">("checking");
  const [healthMsg, setHealthMsg] = useState<string>("");
  const [testText, setTestText] = useState("serendipity");
  const [previewAction, setPreviewAction] = useState<"translate" | "explain" | null>(null);

  useEffect(() => {
    const api = window.doubaoAPI;
    api?.getSettings().then((s) => setSettings(s));

    const backendBase = getBackendBase();
    setHealthMsg(`正在连接 ${backendBase}/api/health …`);
    fetch(`${backendBase}/api/health`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.ok) {
          setHealth("ok");
          setHealthMsg("已连接");
        } else {
          setHealth("fail");
          setHealthMsg(`响应异常: ${JSON.stringify(d)}`);
        }
      })
      .catch((err) => {
        setHealth("fail");
        setHealthMsg(`连接失败: ${err?.message || err}`);
      });

    // 选区上报演示：主窗口里选中文字，弹出悬浮按钮
    const onMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection()?.toString().trim();
      if (!sel) return;
      const x = window.screenX + e.clientX;
      const y = window.screenY + e.clientY;
      api?.reportSelection(sel, x, y);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const saveSettings = (patch: Partial<AppSettings>) => {
    window.doubaoAPI?.setSettings(patch).then((s) => setSettings(s));
  };

  return (
    <div className="min-h-screen p-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">划词助手</h1>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              health === "ok"
                ? "bg-green-500"
                : health === "checking"
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-gray-500">
            {health === "ok"
              ? "后端已连接"
              : health === "checking"
              ? "连接中…"
              : "后端未连接"}
          </span>
          {healthMsg && (
            <span className="text-gray-400 max-w-[280px] truncate" title={healthMsg}>
              · {healthMsg}
            </span>
          )}
        </div>
      </header>

      {/* 手动测试区 */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-medium text-gray-700 mb-3">手动测试</h2>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={2}
          className="selectable w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none resize-none"
          placeholder="输入要翻译/解释的文字"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setPreviewAction("translate")}
            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
          >
            翻译
          </button>
          <button
            onClick={() => setPreviewAction("explain")}
            className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            解释
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          提示：在任意应用选中文字后按 <kbd className="px-1 bg-gray-100 rounded">Ctrl+Shift+D</kbd> 触发（自动读剪贴板）。
        </p>
      </section>

      {/* 预览浮窗（内嵌） */}
      {previewAction && testText.trim() && (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-[420px]">
            <PopupView
              key={testText + previewAction}
              text={testText}
              initialAction={previewAction}
              onClose={() => setPreviewAction(null)}
            />
          </div>
        </section>
      )}

      {/* 设置 */}
      {settings && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-700 mb-3">设置</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <label className="flex items-center justify-between">
              <span className="text-gray-600">翻译热键（直接翻译）</span>
              <input
                value={settings.hotkeyTranslate}
                onChange={(e) => saveSettings({ hotkeyTranslate: e.target.value })}
                className="px-2 py-1 text-xs rounded border border-gray-200 w-48 text-right font-mono"
                placeholder="CommandOrControl+Shift+D"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-gray-600">解释热键（直接解释）</span>
              <input
                value={settings.hotkeyExplain}
                onChange={(e) => saveSettings({ hotkeyExplain: e.target.value })}
                className="px-2 py-1 text-xs rounded border border-gray-200 w-48 text-right font-mono"
                placeholder="CommandOrControl+Shift+E"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-gray-600">开启 DeepSeek 思考模式（更慢但更深入）</span>
              <input
                type="checkbox"
                checked={settings.showThinking}
                onChange={(e) => saveSettings({ showThinking: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-gray-600">鼠标选中弹悬浮按钮</span>
              <input
                type="checkbox"
                checked={settings.enableActionButton}
                onChange={(e) => saveSettings({ enableActionButton: e.target.checked })}
              />
            </label>
          </div>
          <div className="mt-3 text-[11px] text-gray-400">
            用法：选中文字 → 按「翻译热键」直接翻译 / 按「解释热键」直接解释。后端地址：{getBackendBase()}
          </div>
        </section>
      )}

      <footer className="mt-auto pt-4 border-t border-gray-200 flex justify-between text-xs text-gray-400">
        <span>doubao-selection · DeepSeek v4-pro + Qwen-VL</span>
        <button onClick={() => window.doubaoAPI?.quit()} className="hover:text-red-500">
          退出
        </button>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<MainApp />);
