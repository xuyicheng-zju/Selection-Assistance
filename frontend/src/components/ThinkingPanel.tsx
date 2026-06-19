import { useState } from "react";

interface Props {
  /** 思考内容（流式累积） */
  content: string;
  streaming: boolean;
  /** 是否默认展开 */
  defaultOpen?: boolean;
}

/** 折叠的思考过程（DeepSeek reasoning_content） */
export function ThinkingPanel({ content, streaming, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        <span>{streaming ? "思考中…" : "思考过程"}</span>
        <span className="text-gray-300">({content.length} 字)</span>
      </button>
      {open && (
        <div className="selectable px-3 pb-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto bg-gray-50/50">
          {content}
        </div>
      )}
    </div>
  );
}
