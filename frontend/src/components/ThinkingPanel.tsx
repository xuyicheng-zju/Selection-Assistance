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
    <div className="thinking-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className="thinking-trigger"
        aria-expanded={open}
      >
        <span
          className={`thinking-chevron ${open ? "is-open" : ""}`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
        </span>
        <span className="thinking-glyph">✦</span>
        <span>{streaming ? "正在梳理思路" : "思考过程"}</span>
        <span className="thinking-count">{content.length} 字</span>
      </button>
      {open && (
        <div className="selectable thinking-content">
          {content}
        </div>
      )}
    </div>
  );
}
