import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";
// KaTeX 公式样式（行内 $...$ 与块级 $...$）
import "katex/dist/katex.min.css";

interface Props {
  /** 已完成的历史消息（含首条 assistant 结果） */
  history: ChatMessage[];
  /** 当前流式中的内容（未完成的那条） */
  streamingContent: string;
  /** 是否正在流式产出 */
  streaming: boolean;
  /** 流式中消息的角色（user=正在发问，assistant=正在回答） */
  streamingRole: "user" | "assistant";
}

/** 聊天式消息列表：历史消息 + 当前流式消息 */
export function MessageList({
  history,
  streamingContent,
  streaming,
  streamingRole,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 自动滚动到底
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamingContent, streaming]);

  // 空状态
  if (history.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
        {streaming ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
            生成中…
          </span>
        ) : (
          "暂无内容"
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="selectable flex-1 overflow-y-auto px-3 py-2 space-y-3">
      {history.map((msg, i) => (
        <MessageBubble key={i} msg={msg} />
      ))}
      {/* 当前流式消息 */}
      {streamingContent && (
        <MessageBubble
          msg={{ role: streamingRole, content: streamingContent }}
          streaming={streaming}
        />
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  streaming = false,
}: {
  msg: ChatMessage;
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  const html = renderMarkdown(msg.content);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        ) : (
          <div className="md-body">
            <div dangerouslySetInnerHTML={{ __html: html }} />
            {streaming && (
              <span className="inline-block w-[2px] h-[1em] bg-brand-600 ml-0.5 align-middle animate-caret-blink" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
