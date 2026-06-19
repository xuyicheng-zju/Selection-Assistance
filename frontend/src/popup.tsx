import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Action } from "./lib/types";
import type { TriggerPayload } from "../electron/ipc";
import { PopupView } from "./components/PopupView";
import "./styles/index.css";

interface TriggerState {
  action: Action;
  text: string;
}

function PopupApp() {
  const [trigger, setTrigger] = useState<TriggerState | null>(null);

  useEffect(() => {
    // 监听主进程 ACTION_RUN
    const api = window.doubaoAPI;
    if (!api) return;
    const off = api.onTriggerAction((payload: TriggerPayload) => {
      setTrigger({ action: payload.action, text: payload.text });
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
      key={trigger.text + trigger.action}
      text={trigger.text}
      initialAction={trigger.action}
      onClose={() => window.doubaoAPI?.closeWindow()}
    />
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
