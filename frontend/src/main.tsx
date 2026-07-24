import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppSettings } from "../electron/ipc";
import appIconUrl from "../assets/icon.png";
import {
  ImageAttachments,
  imageFilesFromClipboard,
  mergeImageFiles,
} from "./components/ImageAttachments";
import { PopupView } from "./components/PopupView";
import type { Action } from "./lib/types";
import { getBackendBase } from "./lib/api";
import "./styles/index.css";

type Health = "checking" | "ok" | "fail";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-all duration-200 ${
        checked
          ? "border-[#5b6ef5] bg-[#5b6ef5] shadow-[0_5px_14px_rgba(91,110,245,0.28)]"
          : "border-slate-200 bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[20px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-[68px] items-center justify-between gap-5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 transition-colors hover:border-indigo-200">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-700">{title}</div>
        <div className="mt-1 text-[11px] leading-4 text-slate-400">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function HealthPill({
  health,
  message,
}: {
  health: Health;
  message: string;
}) {
  const label =
    health === "ok" ? "服务运行中" : health === "checking" ? "正在连接" : "服务异常";
  const dot =
    health === "ok"
      ? "bg-emerald-500"
      : health === "checking"
      ? "bg-amber-400 animate-pulse"
      : "bg-rose-500";
  return (
    <div
      title={message}
      className="flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

function MainApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<Health>("checking");
  const [healthMsg, setHealthMsg] = useState("");
  const [testText, setTestText] = useState("serendipity");
  const [testImages, setTestImages] = useState<File[]>([]);
  const [previewAction, setPreviewAction] = useState<Action | null>(null);

  useEffect(() => {
    const api = window.doubaoAPI;
    api?.getSettings().then((s) => setSettings(s));

    const backendBase = getBackendBase();
    setHealthMsg(`正在连接 ${backendBase}/api/health …`);
    fetch(`${backendBase}/api/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data.ok) {
          setHealth("ok");
          setHealthMsg(`已连接 ${backendBase}`);
        } else {
          setHealth("fail");
          setHealthMsg(`响应异常: ${JSON.stringify(data)}`);
        }
      })
      .catch((err) => {
        setHealth("fail");
        setHealthMsg(`连接失败: ${err?.message || err}`);
      });

    // 主窗口中的选区也可触发悬浮操作条。
    const onMouseUp = (event: MouseEvent) => {
      const selected = window.getSelection()?.toString().trim();
      if (!selected) return;
      api?.reportSelection(
        selected,
        window.screenX + event.clientX,
        window.screenY + event.clientY
      );
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const saveSettings = (patch: Partial<AppSettings>) => {
    window.doubaoAPI?.setSettings(patch).then((next) => setSettings(next));
  };

  const updateDraft = (patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f6fb]">
      <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-28 h-72 w-72 rounded-full bg-cyan-100/55 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen max-w-[980px] flex-col gap-4 p-6">
        <header className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white bg-white shadow-[0_10px_30px_rgba(50,64,120,0.14)]">
              <img
                src={appIconUrl}
                alt=""
                className="h-10 w-10 object-contain"
                draggable={false}
              />
            </div>
            <div>
              <h1 className="text-[18px] font-bold tracking-tight text-slate-800">
                划词助手
              </h1>
              <p className="mt-0.5 text-[11px] tracking-wide text-slate-400">
                SELECT · UNDERSTAND · CONTINUE
              </p>
            </div>
          </div>
          <HealthPill health={health} message={healthMsg} />
        </header>

        <div className="grid grid-cols-[1.25fr_0.75fr] gap-4">
          <section className="relative overflow-hidden rounded-[22px] border border-white/90 bg-white/90 p-5 shadow-[0_18px_50px_rgba(44,56,94,0.08)] backdrop-blur">
            <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] bg-gradient-to-bl from-indigo-100/80 to-transparent" />
            <div className="relative">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-500">
                    Quick try
                  </div>
                  <h2 className="mt-1 text-[15px] font-semibold text-slate-800">
                    先试一句
                  </h2>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-600">
                  流式输出
                </span>
              </div>
              <textarea
                value={testText}
                onChange={(event) => setTestText(event.target.value)}
                onPaste={(event) => {
                  const images = imageFilesFromClipboard(event.clipboardData);
                  if (images.length > 0) {
                    event.preventDefault();
                    setTestImages((current) => mergeImageFiles(current, images));
                  }
                }}
                rows={3}
                className="selectable w-full resize-none rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-[13px] leading-5 text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100/60"
                placeholder="输入要翻译、解释或 Chat 的内容…"
              />
              <div className="mt-2">
                <ImageAttachments files={testImages} onChange={setTestImages} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewAction("translate")}
                    disabled={!testText.trim() && testImages.length === 0}
                    className="rounded-xl bg-[#5b6ef5] px-5 py-2 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(91,110,245,0.25)] transition hover:-translate-y-0.5 hover:bg-[#4e60e8] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    翻译
                  </button>
                  <button
                    onClick={() => setPreviewAction("explain")}
                    disabled={!testText.trim() && testImages.length === 0}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-[12px] font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    解释
                  </button>
                  <button
                    onClick={() => setPreviewAction("chat")}
                    disabled={!testText.trim() && testImages.length === 0}
                    className="rounded-xl border border-cyan-200 bg-cyan-50 px-5 py-2 text-[12px] font-semibold text-cyan-700 transition hover:-translate-y-0.5 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Chat
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">文字 · 多图 · Markdown</span>
              </div>
            </div>
          </section>

          <aside className="rounded-[22px] bg-gradient-to-br from-[#172033] to-[#283452] p-5 text-white shadow-[0_20px_55px_rgba(23,32,51,0.18)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                Always ready
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                ✓
              </span>
            </div>
            <h2 className="mt-4 text-[16px] font-semibold">后台常驻已开启</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-300">
              关闭窗口不会退出，翻译与解释热键始终可用。
            </p>
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <span className="text-[11px] text-slate-300">翻译</span>
                <kbd className="font-mono text-[10px] text-white">Ctrl ⇧ D</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <span className="text-[11px] text-slate-300">解释</span>
                <kbd className="font-mono text-[10px] text-white">Ctrl ⇧ E</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <span className="text-[11px] text-slate-300">Chat</span>
                <kbd className="font-mono text-[10px] text-cyan-200">文字 + 多图</kbd>
              </div>
            </div>
          </aside>
        </div>

        {previewAction && (testText.trim() || testImages.length > 0) && (
          <section className="animate-fade-in overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(44,56,94,0.1)]">
            <div className="h-[430px]">
              <PopupView
                key={`${testText}-${previewAction}-${testImages
                  .map((image) => `${image.name}:${image.lastModified}`)
                  .join("|")}`}
                text={testText}
                images={testImages}
                initialAction={previewAction}
                onClose={() => setPreviewAction(null)}
              />
            </div>
          </section>
        )}

        {settings ? (
          <section className="rounded-[22px] border border-white/90 bg-white/85 p-5 shadow-[0_16px_46px_rgba(44,56,94,0.07)] backdrop-blur">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-500">
                  Preferences
                </div>
                <h2 className="mt-1 text-[15px] font-semibold text-slate-800">偏好设置</h2>
              </div>
              <span className="text-[10px] text-slate-400">修改后自动保存</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SettingRow
                title="开机自动启动"
                description="登录桌面后静默进入托盘"
                checked={settings.launchAtLogin}
                onChange={(checked) => saveSettings({ launchAtLogin: checked })}
              />
              <SettingRow
                title="深度思考"
                description="更深入地解释，响应时间会稍长"
                checked={settings.showThinking}
                onChange={(checked) => saveSettings({ showThinking: checked })}
              />
              <SettingRow
                title="悬浮操作条"
                description="在主窗口选中文字时显示快捷按钮"
                checked={settings.enableActionButton}
                onChange={(checked) => saveSettings({ enableActionButton: checked })}
              />
              <div className="flex min-h-[68px] items-center justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div>
                  <div className="text-[13px] font-semibold text-slate-700">托盘驻留</div>
                  <div className="mt-1 text-[11px] text-slate-400">关闭窗口后继续响应热键</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                  已启用
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3">
                <span className="block text-[11px] font-medium text-slate-500">翻译热键</span>
                <input
                  value={settings.hotkeyTranslate}
                  onChange={(event) =>
                    updateDraft({ hotkeyTranslate: event.target.value })
                  }
                  onBlur={(event) =>
                    saveSettings({ hotkeyTranslate: event.target.value })
                  }
                  className="mt-2 w-full bg-transparent font-mono text-[11px] text-slate-700 outline-none"
                  placeholder="CommandOrControl+Shift+D"
                />
              </label>
              <label className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3">
                <span className="block text-[11px] font-medium text-slate-500">解释热键</span>
                <input
                  value={settings.hotkeyExplain}
                  onChange={(event) =>
                    updateDraft({ hotkeyExplain: event.target.value })
                  }
                  onBlur={(event) =>
                    saveSettings({ hotkeyExplain: event.target.value })
                  }
                  className="mt-2 w-full bg-transparent font-mono text-[11px] text-slate-700 outline-none"
                  placeholder="CommandOrControl+Shift+E"
                />
              </label>
            </div>
          </section>
        ) : (
          <div className="h-36 animate-pulse rounded-[22px] bg-white/70" />
        )}

        <footer className="mt-auto flex items-center justify-between px-1 pb-1 pt-2 text-[10px] text-slate-400">
          <span>DeepSeek v4-pro · Qwen-VL · {getBackendBase()}</span>
          <button
            onClick={() => window.doubaoAPI?.quit()}
            className="rounded-lg px-2 py-1 transition hover:bg-rose-50 hover:text-rose-500"
          >
            彻底退出
          </button>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<MainApp />);
