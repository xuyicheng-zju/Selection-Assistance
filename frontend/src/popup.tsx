import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Action } from "./lib/types";
import type { TriggerPayload } from "../electron/ipc";
import { PopupView } from "./components/PopupView";
import "./styles/index.css";

interface TriggerState {
  id: number;
  action: Action;
  text: string;
}

function PopupApp() {
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const triggerIdRef = useRef(0);

  useEffect(() => {
    // 监听主进程 ACTION_RUN
    const api = window.doubaoAPI;
    if (!api) return;
    const off = api.onTriggerAction((payload: TriggerPayload) => {
      if (!payload.text.trim()) {
        api.closeWindow();
        return;
      }
      triggerIdRef.current += 1;
      setTrigger({ id: triggerIdRef.current, action: payload.action, text: payload.text });
    });
    return off;
  }, []);

  if (!trigger) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-white">
        <div className="text-gray-400 text-sm">准备中…</div>
      </div>
    );
  }

  return (
    <PopupView
      key={trigger.id}
      text={trigger.text}
      initialAction={trigger.action}
      onClose={() => window.doubaoAPI?.closeWindow()}
    />
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
