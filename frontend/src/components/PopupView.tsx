import { useEffect, useRef, useState } from "react";
import type { Action } from "../lib/types";
import { useSelectionAction } from "../hooks/useSelectionAction";
import { PhoneticsBar } from "./PhoneticsBar";
import { ResultPane } from "./ResultPane";
import { ThinkingPanel } from "./ThinkingPanel";
import { ErrorBanner } from "./ErrorBanner";

interface Props {
  text: string;
  initialAction: Action;
  onClose: () => void;
}

/** 划词浮窗主体：Tab(翻译/解释) + 音标 + 结果 + 思考 + 追问输入框 */
export function PopupView({ text, initialAction, onClose }: Props) {
  const sa = useSelectionAction(text);
  const [tab, setTab] = useState<Action>(initialAction);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  // 首次进入：执行初始动作
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setTab(initialAction);
    sa.runInitial(initialAction, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换 Tab：重新执行对应动作
  const switchTab = (next: Action) => {
    if (next === tab) return;
    setTab(next);
    startedRef.current = true;
    sa.runInitial(next, text);
  };

  const handleAsk = () => {
    const q = question.trim();
    if (!q || sa.phase === "streaming") return;
    setQuestion("");
    sa.ask(q);
  };

  const onKeyQuestion = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-white rounded-xl overflow-hidden shadow-2xl border border-gray-200">
      {/* 标题栏（可拖拽） */}
      <div className="flex items-center justify-between px-2 h-9 bg-gradient-to-r from-brand-600 to-brand-500 text-white draggable select-none">
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => switchTab("translate")}
            className={`no-drag px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === "translate"
                ? "bg-white/25 text-white"
                : "text-white/70 hover:text-white"
            }`}
          >
            翻译
          </button>
          <button
            onClick={() => switchTab("explain")}
            className={`no-drag px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === "explain"
                ? "bg-white/25 text-white"
                : "text-white/70 hover:text-white"
            }`}
          >
            解释
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/60 max-w-[140px] truncate" title={text}>
            {text}
          </span>
          <button
            onClick={sa.toggleThinking}
            className={`no-drag w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
              sa.thinkingEnabled
                ? "bg-yellow-400/30 text-yellow-200"
                : "text-white/50 hover:text-white hover:bg-white/15"
            }`}
            title={sa.thinkingEnabled ? "思考模式：已开启（点击关闭）" : "思考模式：已关闭（点击开启）"}
          >
            💡
          </button>
          <button
            onClick={onClose}
            className="no-drag w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-white/80 hover:text-white text-sm"
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 音标 */}
      <PhoneticsBar phonetics={sa.phonetics} />

      {/* 思考过程（开启思考模式时默认展开） */}
      <ThinkingPanel
        content={sa.thinking}
        streaming={sa.phase === "streaming"}
        defaultOpen={sa.thinkingEnabled}
      />

      {/* 错误 */}
      <ErrorBanner error={sa.error} />

      {/* 结果 */}
      <ResultPane content={sa.content} streaming={sa.phase === "streaming"} />

      {/* 追问历史快览（可滚动）省略：直接在结果区累积显示最近一轮 */}

      {/* 追问输入框 */}
      <div className="border-t border-gray-200 p-2 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyQuestion}
            placeholder="继续提问…  (Enter 发送 / Shift+Enter 换行)"
            rows={1}
            className="selectable flex-1 resize-none px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-300 outline-none max-h-28"
          />
          <button
            onClick={handleAsk}
            disabled={sa.phase === "streaming" || !question.trim()}
            className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sa.phase === "streaming" ? "…" : "发送"}
          </button>
        </div>
        {sa.history.length > 0 && (
          <div className="mt-1 text-[10px] text-gray-400 px-1">
            已对话 {Math.floor(sa.history.length / 2)} 轮 · 可继续追问
          </div>
        )}
      </div>
    </div>
  );
}
