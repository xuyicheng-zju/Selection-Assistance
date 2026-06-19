import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  /** 累积的内容（流式时持续增长） */
  content: string;
  /** 是否还在流式产出 */
  streaming: boolean;
}

/** 结果展示：Markdown 渲染 + 流式时末尾闪烁光标 + 自动滚到底 */
export function ResultPane({ content, streaming }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    setHtml(renderMarkdown(content));
  }, [content]);

  // 自动滚动到底
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [html, streaming]);

  if (!content && streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
          生成中…
        </span>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
        暂无内容
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="selectable flex-1 overflow-y-auto px-3 py-2 md-body"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {streaming && (
        <span className="inline-block w-[2px] h-[1em] bg-brand-600 ml-0.5 align-middle animate-caret-blink" />
      )}
    </div>
  );
}
