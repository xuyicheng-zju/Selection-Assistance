import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppSettings, ModelBackend } from "../electron/ipc";
import { BrandLogo } from "./components/BrandLogo";
import { ClipboardIcon, ImageAttachments, imageFilesFromClipboard, mergeImageFiles } from "./components/ImageAttachments";
import { PopupView } from "./components/PopupView";
import type { Action } from "./lib/types";
import { getBackendBase } from "./lib/api";
import "./styles/index.css";
import "./styles/workspace.css";

type BackendHealth = {
  ok: boolean;
  provider: ModelBackend;
  model: string;
  effort?: string;
  vision_model?: string;
};

type CodexModel = { id: string; label: string; efforts: string[]; default_effort: string; image: boolean };

type Submission = { action: Action; text: string; images: File[]; targetLang: string };

const IS_MAC = navigator.platform.startsWith("Mac");

function formatKeycaps(accelerator: string): string[] {
  return accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === "commandorcontrol" || lower === "cmdorctrl") return IS_MAC ? "⌘" : "Ctrl";
      if (lower === "command" || lower === "cmd" || lower === "super") return "⌘";
      if (lower === "control" || lower === "ctrl") return IS_MAC ? "⌃" : "Ctrl";
      if (lower === "shift") return IS_MAC ? "⇧" : "Shift";
      if (lower === "alt" || lower === "option") return IS_MAC ? "⌥" : "Alt";
      return token.length === 1 ? token.toUpperCase() : token;
    });
}

function SettingRow({ label, description, checked, onChange, disabled }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function HotkeyField({ label, value, onCommit }: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const keycaps = formatKeycaps(draft || value);

  return (
    <label className="hotkey-field">
      <div className="hotkey-head">
        <span>{label}</span>
        <span className="keycap-group" aria-hidden="true">
          {keycaps.map((cap, index) => (
            <kbd key={`${cap}-${index}`} className="keycap">{cap}</kbd>
          ))}
        </span>
      </div>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed && trimmed !== value) onCommit(trimmed);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        spellCheck={false}
      />
    </label>
  );
}

function MainApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<BackendHealth | "checking" | "offline">("checking");
  const [accessibility, setAccessibility] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CodexModel[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [targetLang, setTargetLang] = useState("zh");
  const [submission, setSubmission] = useState<{ input: Submission; id: number } | null>(null);
  const [canSwitchBackend] = useState(() => Boolean(window.doubaoAPI?.getBackendHeaders()["X-Model-Backend"]));
  const healthCheck = useRef<AbortController>();

  const checkHealth = async () => {
    healthCheck.current?.abort();
    const controller = new AbortController();
    healthCheck.current = controller;
    const { signal } = controller;
    const headers = window.doubaoAPI?.getBackendHeaders();
    const base = getBackendBase();
    setHealth("checking");
    setCatalogFailed(false);
    try {
      const response = await fetch(`${base}/api/health`, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
      if (!response.ok) throw new Error(String(response.status));
      const status: BackendHealth = await response.json();
      if (!status.ok || !status.model) throw new Error("模型服务离线");
      if (signal.aborted) return;
      setHealth(status);
      if (status.provider !== "codex") return;
    } catch {
      if (!signal.aborted) setHealth("offline");
      return;
    }

    try {
      const response = await fetch(`${base}/api/models`, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error(String(response.status));
      const result: { models: CodexModel[] } = await response.json();
      if (!signal.aborted) setCatalog(result.models);
    } catch {
      if (!signal.aborted) setCatalogFailed(true);
    }
  };

  useEffect(() => {
    const api = window.doubaoAPI;
    api?.getSettings().then(setSettings);
    void checkHealth();
    const checkAccess = () => api?.accessibility().then(setAccessibility);
    void checkAccess();
    window.addEventListener("focus", checkAccess);

    const onMouseUp = (event: MouseEvent) => {
      const selected = window.getSelection()?.toString().trim();
      api?.reportSelection(selected ?? "", window.screenX + event.clientX, window.screenY + event.clientY);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      healthCheck.current?.abort();
      document.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("focus", checkAccess);
    };
  }, []);

  const saveSettings = async (patch: Partial<AppSettings>) => {
    const api = window.doubaoAPI;
    if (!api) return;
    setSaving(true);
    setNotice("");
    try {
      setSettings(await api.setSettings(patch));
      if (patch.modelBackend) void checkHealth();
    } catch (error) {
      setSettings(await api.getSettings());
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const submit = (action: Action) => {
    if (!text.trim() && !images.length) return;
    setSubmission((previous) => ({
      input: { action, text: text.trim(), images, targetLang },
      id: (previous?.id ?? 0) + 1,
    }));
  };

  const online = typeof health === "object";
  const useCodex = online && health.provider === "codex";
  const activeModel = settings?.codexModel ?? (online ? health.model : "");
  const activeEffort = settings?.codexEffort ?? (online ? health.effort : undefined);
  const modelInfo = catalog.find((model) => model.id === activeModel);
  const changeModel = (id: string) => {
    const model = catalog.find((entry) => entry.id === id);
    if (!model) return;
    const effort = activeEffort && model.efforts.includes(activeEffort) ? activeEffort : model.default_effort;
    void saveSettings({ codexModel: id, codexEffort: effort });
  };
  const hasInput = Boolean(text.trim() || images.length);

  return (
    <main className={`workspace ${IS_MAC ? "platform-mac" : ""}`}>
      <header className="workspace-header draggable">
        <div className="workspace-brand">
          <BrandLogo size={38} className="workspace-brand-logo" />
          <div>
            <h1>划词助手</h1>
            <p>Selection Assistance</p>
          </div>
        </div>
        <button
          type="button"
          className={`service-status no-drag ${online ? "online" : health === "checking" ? "checking" : "offline"}`}
          onClick={checkHealth}
          title={`${getBackendBase()} · 点击重新检查`}
        >
          <i aria-hidden="true" />
          {online ? "本地服务已连接" : health === "checking" ? "正在连接" : "服务离线 · 重试"}
        </button>
      </header>

      <div className="workspace-grid">
        <div className="workspace-primary">
          <section className="input-panel" aria-labelledby="input-title">
            <div className="panel-heading">
              <div className="panel-title-group">
                <h2 id="input-title">文本与图片</h2>
                <span className="shortcut-hint">{IS_MAC ? "⌘⏎ 快捷翻译" : "Ctrl+Enter 翻译"}</span>
              </div>
              {window.doubaoAPI && (
                <button
                  type="button"
                  className="pill-ghost-button"
                  onClick={async () => {
                    const value = await window.doubaoAPI?.readClipboardText();
                    if (value) setText(value);
                  }}
                >
                  <ClipboardIcon />
                  粘贴文本
                </button>
              )}
            </div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit("translate");
                }
              }}
              onPaste={(event) => {
                const pasted = imageFilesFromClipboard(event.clipboardData);
                if (pasted.length) {
                  event.preventDefault();
                  setImages((current) => mergeImageFiles(current, pasted));
                }
              }}
              rows={5}
              className="selectable workspace-input"
              aria-label="输入文本"
              placeholder="输入、粘贴文本或图片，也可以直接在任意应用中划词唤醒…"
            />
            <ImageAttachments files={images} onChange={setImages} />
            <div className="input-actions">
              <button type="button" className="workspace-button primary" onClick={() => submit("translate")} disabled={!hasInput}>
                <TranslateIcon />
                翻译
              </button>
              <button type="button" className="workspace-button" onClick={() => submit("explain")} disabled={!hasInput}>
                <ExplainIcon />
                解释
              </button>
              <button type="button" className="workspace-button" onClick={() => submit("chat")} disabled={!hasInput}>
                <ChatIcon />
                聊天
              </button>
              <label className="language-choice">
                <span>译为</span>
                <span className="select-wrap">
                  <select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                    <option value="zh">中文</option><option value="en">英文</option><option value="ja">日文</option>
                    <option value="ko">韩文</option><option value="fr">法文</option><option value="de">德文</option>
                  </select>
                  <ChevronDownIcon />
                </span>
              </label>
            </div>
          </section>

          {submission && (
            <section className="workspace-result" aria-label="结果与追问">
              <PopupView
                key={submission.id}
                text={submission.input.text}
                images={submission.input.images}
                initialAction={submission.input.action}
                targetLang={submission.input.targetLang}
                embedded
                onClose={() => setSubmission(null)}
              />
            </section>
          )}
        </div>

        <aside className="workspace-sidebar">
          <section className="model-panel" aria-label="模型服务">
            <div className="model-panel-head">
              <h2>模型服务</h2>
              <span className={`provider-pill ${online ? "is-online" : ""}`}>
                {online ? "已连接" : health === "checking" ? "连接中" : "离线"}
              </span>
            </div>
            {settings && canSwitchBackend && (
              <div className="model-fields">
                <label htmlFor="model-backend">模型后端</label>
                <div className="select-wrap">
                  <select id="model-backend" value={settings.modelBackend} disabled={saving}
                    onChange={(event) => saveSettings({ modelBackend: event.target.value as ModelBackend })}>
                    <option value="dashscope">阿里云百炼</option>
                    <option value="codex">Codex app-server</option>
                  </select>
                  <ChevronDownIcon />
                </div>
              </div>
            )}
            {useCodex && catalog.length > 0 ? (
              <div className="model-fields">
                <label htmlFor="codex-model">模型</label>
                <div className="select-wrap">
                  <select id="codex-model" title={modelInfo?.label} value={activeModel} disabled={saving} onChange={(event) => changeModel(event.target.value)}>
                    {!modelInfo && <option value={activeModel} disabled>{activeModel}</option>}
                    {catalog.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
                  </select>
                  <ChevronDownIcon />
                </div>
                <label htmlFor="codex-effort">推理强度</label>
                <div className="select-wrap">
                  <select id="codex-effort" value={activeEffort} disabled={!modelInfo || saving}
                    onChange={(event) => saveSettings({ codexModel: activeModel, codexEffort: event.target.value })}>
                    {(modelInfo?.efforts ?? [activeEffort]).map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                  </select>
                  <ChevronDownIcon />
                </div>
                {modelInfo && !modelInfo.image && <small className="model-capability">当前模型仅支持文本</small>}
              </div>
            ) : (
              <div className="model-detail">
                <strong>{online ? health.model : "等待本地服务连接…"}</strong>
                {online && (health.effort || health.vision_model) && <span>{health.effort || health.vision_model}</span>}
                {useCodex && catalogFailed && <button className="text-button" onClick={checkHealth}>模型列表加载失败 · 重试</button>}
              </div>
            )}
          </section>

          {settings && (
            <section className="settings-panel" aria-labelledby="settings-title">
              <h2 id="settings-title">偏好设置</h2>
              <SettingRow label="开机自启" description="登录后静默驻留系统托盘" checked={settings.launchAtLogin}
                disabled={saving} onChange={(launchAtLogin) => saveSettings({ launchAtLogin })} />
              <SettingRow label={online && health.provider === "codex" ? "思考摘要" : "深度思考"}
                description={online && health.provider === "codex" ? "在结果里显示模型返回的摘要" : "请求模型返回思考过程"}
                checked={settings.showThinking} disabled={saving} onChange={(showThinking) => saveSettings({ showThinking })} />
              <SettingRow label="悬浮操作条" description="在可读取选区的应用中显示" checked={settings.enableActionButton}
                disabled={saving} onChange={(enableActionButton) => saveSettings({ enableActionButton })} />
              {notice && <p className="settings-notice" role="status">{notice}</p>}
              <div className="hotkey-list">
                <HotkeyField
                  label="翻译热键"
                  value={settings.hotkeyTranslate}
                  onCommit={(hotkeyTranslate) => void saveSettings({ hotkeyTranslate })}
                />
                <HotkeyField
                  label="解释热键"
                  value={settings.hotkeyExplain}
                  onCommit={(hotkeyExplain) => void saveSettings({ hotkeyExplain })}
                />
              </div>
              {accessibility === false && (
                <button
                  type="button"
                  className="access-button"
                  onClick={async () => {
                    const trusted = await window.doubaoAPI?.accessibility(true);
                    setAccessibility(trusted ?? null);
                  }}
                >
                  <ShieldIcon />
                  授权跨应用划词权限
                </button>
              )}
            </section>
          )}
        </aside>
      </div>

      <footer className="workspace-footer">
        <span className="endpoint-chip">{getBackendBase()}</span>
        {window.doubaoAPI && (
          <button className="footer-quit-button" onClick={() => window.doubaoAPI?.quit()}>
            退出助手
          </button>
        )}
      </footer>
    </main>
  );
}

function TranslateIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4.2h6.8M5.9 2.5v1.7M4.1 4.2c.4 2.4 1.6 4.2 3.5 5.4M7.7 4.2c-.5 2-1.7 3.7-3.6 4.9" />
      <path d="m8.8 13.5 2.4-6.2 2.4 6.2M9.6 11.4h3.2" />
    </svg>
  );
}
function ExplainIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2c.45 2.9 1.4 3.85 4.3 4.3-2.9.45-3.85 1.4-4.3 4.3-.45-2.9-1.4-3.85-4.3-4.3 2.9-.45 3.85-1.4 4.3-4.3Z" />
      <path d="M12.2 10.2c.2 1.35.65 1.8 2 2-1.35.2-1.8.65-2 2-.2-1.35-.65-1.8-2-2 1.35-.2 1.8-.65 2-2Z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5A1.75 1.75 0 0 1 4.75 2.75h6.5A1.75 1.75 0 0 1 13 4.5v4.75A1.75 1.75 0 0 1 11.25 11H6.9l-2.65 2.25V11h-.5A1.75 1.75 0 0 1 3 9.25V4.5Z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="select-chevron" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 3.2 4v3.8c0 3.1 2.05 5.4 4.8 6.2 2.75-.8 4.8-3.1 4.8-6.2V4L8 2Z" />
      <path d="M8 5.5v3M8 10.75h.01" />
    </svg>
  );
}

createRoot(document.getElementById("root")!).render(<MainApp />);
