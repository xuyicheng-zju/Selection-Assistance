import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TriggerPayload } from "../electron/ipc";
import { BrandLogo } from "./components/BrandLogo";
import { PopupView } from "./components/PopupView";
import "./styles/index.css";

function PopupApp() {
  const [trigger, setTrigger] = useState<(TriggerPayload & { id: number }) | null>(null);
  const [fallback, setFallback] = useState<TriggerPayload | null>(null);
  const [clipboardEmpty, setClipboardEmpty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [lang, setLang] = useState("zh");
  const triggerId = useRef(0);

  const start = (payload: TriggerPayload) => {
    setFallback(null);
    setExpanded(false);
    triggerId.current += 1;
    setTrigger({ ...payload, id: triggerId.current });
  };

  useEffect(() => {
    const api = window.doubaoAPI;
    if (!api) return;
    return api.onTriggerAction((payload) => {
      if (payload.text.trim()) {
        start(payload);
      } else {
        setClipboardEmpty(false);
        setFallback(payload);
      }
    });
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        window.doubaoAPI?.closeWindow();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const resize = (next: boolean) => {
    setExpanded(next);
    window.doubaoAPI?.setPopupExpanded(next);
  };
  const close = () => window.doubaoAPI?.closeWindow();

  return (
    <>
      {trigger && (
        <div hidden={Boolean(fallback)}>
          <PopupView
            key={trigger.id}
            text={trigger.text}
            initialAction={trigger.action}
            targetLang={lang}
            onClose={close}
            floating={{
              expanded,
              pinned,
              setExpanded: resize,
              changeLanguage: setLang,
              setPinned: (next) => {
                window.doubaoAPI?.setPopupPinned(next);
                setPinned(next);
              },
            }}
          />
        </div>
      )}
      {fallback && (
        <div className="popup-shell compact-popup">
          <header className="popup-header draggable">
            <div className="brand-lockup">
              <BrandLogo size={24} />
              <strong>{fallback.action === "explain" ? "划词解释" : "划词翻译"}</strong>
            </div>
            <button className="no-drag icon-button" onClick={close} aria-label="关闭浮窗">×</button>
          </header>
          <div className="capture-help" role="status">
            <strong>{fallback.selectionIssue === "authorization" ? "请开启辅助功能权限" : "未读取到选中文本"}</strong>
            <p>{fallback.selectionIssue === "authorization"
              ? "在系统设置中重新添加并开启 Selection Assistance，然后选中文字再按快捷键。"
              : "选中文字后再按快捷键，或先复制需要处理的文字。"}</p>
            {clipboardEmpty && <p>剪贴板中没有文字。</p>}
          </div>
          <footer className="compact-footer capture-actions">
            {fallback.selectionIssue === "authorization" && (
              <button className="mode-button is-active" onClick={() => window.doubaoAPI?.accessibility(true)}>
                打开辅助功能设置
              </button>
            )}
            <button className="mode-button" onClick={async () => {
              try {
                const text = (await window.doubaoAPI?.readClipboardText())?.trim();
                if (!text) {
                  setClipboardEmpty(true);
                  return;
                }
                resize(false);
                start({ action: fallback.action, text });
              } catch {
                setClipboardEmpty(true);
              }
            }}>使用剪贴板</button>
            {trigger && <button className="mode-button" onClick={() => {
              setFallback(null);
              resize(expanded);
            }}>上次结果</button>}
          </footer>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
