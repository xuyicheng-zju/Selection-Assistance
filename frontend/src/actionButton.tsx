import { createRoot } from "react-dom/client";
import type { Action } from "./lib/types";
import "./styles/index.css";

function ActionButtonApp() {
  const trigger = (action: Action) => {
    window.doubaoAPI?.triggerAction(action);
  };

  return (
    <div className="action-popover">
      <button
        onClick={() => trigger("translate")}
        className="action-choice"
      >
        <span>译</span>翻译
      </button>
      <i />
      <button
        onClick={() => trigger("explain")}
        className="action-choice"
      >
        <span>析</span>解释
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ActionButtonApp />);
