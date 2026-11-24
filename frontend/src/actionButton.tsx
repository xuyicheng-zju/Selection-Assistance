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
        type="button"
        onClick={() => trigger("translate")}
        className="action-choice is-primary"
      >
        <span className="action-glyph">
          <TranslateGlyph />
        </span>
        翻译
      </button>
      <i aria-hidden="true" />
      <button
        type="button"
        onClick={() => trigger("explain")}
        className="action-choice"
      >
        <span className="action-glyph">
          <ExplainGlyph />
        </span>
        解释
      </button>
      <i aria-hidden="true" />
      <button type="button" onClick={() => trigger("chat")} className="action-choice">
        <span className="action-glyph">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 3h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 3Z" />
            <path d="M5.5 6.2h5M5.5 8.5h3.1" />
          </svg>
        </span>
        聊天
      </button>
    </div>
  );
}

function TranslateGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4.2h6.8M5.9 2.5v1.7M4.1 4.2c.4 2.4 1.6 4.2 3.5 5.4M7.7 4.2c-.5 2-1.7 3.7-3.6 4.9" />
      <path d="m8.8 13.5 2.4-6.2 2.4 6.2M9.6 11.4h3.2" />
    </svg>
  );
}

function ExplainGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2c.45 2.9 1.4 3.85 4.3 4.3-2.9.45-3.85 1.4-4.3 4.3-.45-2.9-1.4-3.85-4.3-4.3 2.9-.45 3.85-1.4 4.3-4.3Z" />
      <path d="M12.2 10.2c.2 1.35.65 1.8 2 2-1.35.2-1.8.65-2 2-.2-1.35-.65-1.8-2-2 1.35-.2 1.8-.65 2-2Z" />
    </svg>
  );
}

createRoot(document.getElementById("root")!).render(<ActionButtonApp />);
