import { createRoot } from "react-dom/client";
import type { Action } from "./lib/types";
import "./styles/index.css";

function ActionButtonApp() {
  const trigger = (action: Action) => {
    window.doubaoAPI?.triggerAction(action);
  };

  return (
    <div className="flex items-center gap-1 h-full w-full px-1">
      <button
        onClick={() => trigger("translate")}
        className="flex-1 h-8 rounded-md bg-white/90 backdrop-blur shadow-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-300 transition-colors"
      >
        翻译
      </button>
      <button
        onClick={() => trigger("explain")}
        className="flex-1 h-8 rounded-md bg-white/90 backdrop-blur shadow-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-300 transition-colors"
      >
        解释
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ActionButtonApp />);
