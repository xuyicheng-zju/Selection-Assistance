import { memo, useEffect, useMemo, useRef } from "react";
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
  /** 翻译/解释模式下隐藏首条合成的 user 回显气泡（顶部上下文栏已展示） */
  hideInitialUserEcho?: boolean;
}

/** 聊天式消息列表：历史消息 + 当前流式消息 */
export function MessageList({
  history,
  streamingContent,
  streaming,
  streamingRole,
  hideInitialUserEcho = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // 仅当用户仍停留在底部时跟随输出；阅读上文时不抢滚动位置。
  useEffect(() => {
    const el = ref.current;
    if (!el || !stickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [history, streamingContent, streaming]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
  };

  const visibleHistory = useMemo(
    () =>
      history
        .map((msg, index) => ({ msg, index }))
        .filter(
          ({ msg, index }) =>
            !(hideInitialUserEcho && index === 0 && msg.role === "user")
        ),
    [history, hideInitialUserEcho]
  );

  // 空状态
  if (visibleHistory.length === 0 && !streamingContent) {
    return (
      <div className="empty-result" role="status" aria-live="polite">
        {streaming ? (
          <GeneratingState />
        ) : (
          <span>选中文字，答案会出现在这里</span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="message-list selectable"
      aria-live="polite"
      aria-busy={streaming}
    >
      {visibleHistory.map(({ msg, index }) => (
        <MessageBubble key={index} msg={msg} />
      ))}
      {/* 当前流式消息 */}
      {streamingContent ? (
        <MessageBubble
          msg={{ role: streamingRole, content: streamingContent }}
          streaming={streaming}
        />
      ) : streaming ? (
        <div className="assistant-row"><GeneratingState /></div>
      ) : null}
      {streaming && streamingContent && (
        <span className="sr-only">正在生成回答</span>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  msg,
  streaming = false,
}: {
  msg: ChatMessage;
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  const html = useMemo(
    () => (isUser || streaming ? "" : renderMarkdown(msg.content)),
    [isUser, streaming, msg.content]
  );
  return (
    <div className={isUser ? "user-row" : "assistant-row"}>
      <div
        className={isUser ? "user-message" : "assistant-message"}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        ) : (
          <div className="md-body">
            {streaming
              ? <div className="streaming-text">{msg.content}<span className="stream-caret" aria-hidden="true" /></div>
              : <div dangerouslySetInnerHTML={{ __html: html }} />}
          </div>
        )}
      </div>
    </div>
  );
});

function GeneratingState() {
  return (
    <div className="generating-state">
      <span className="stream-orbit" aria-hidden="true"><i /></span>
      <span>
        <strong>正在组织答案</strong>
        <small>内容会连续出现</small>
      </span>
    </div>
  );
}
