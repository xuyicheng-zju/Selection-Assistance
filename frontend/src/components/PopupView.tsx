import { useEffect, useRef, useState } from "react";
import type { Action } from "../lib/types";
import { useSelectionAction } from "../hooks/useSelectionAction";
import { PhoneticsBar } from "./PhoneticsBar";
import { MessageList } from "./MessageList";
import { ThinkingPanel } from "./ThinkingPanel";
import { ErrorBanner } from "./ErrorBanner";
import {
  ImageAttachments,
  imageFilesFromClipboard,
  mergeImageFiles,
} from "./ImageAttachments";

interface Props {
  text: string;
  images?: File[];
  initialAction: Action;
  onClose: () => void;
}

/** 划词浮窗主体：翻译 / 解释 / Chat + 多图输入 + 多轮追问。 */
export function PopupView({ text, images = [], initialAction, onClose }: Props) {
  const sa = useSelectionAction(text);
  const [tab, setTab] = useState<Action>(initialAction);
  const [question, setQuestion] = useState("");
  const [questionImages, setQuestionImages] = useState<File[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  // 首次进入：执行初始动作
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setTab(initialAction);
    sa.runInitial(initialAction, text, images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换 Tab：重新执行对应动作
  const switchTab = (next: Action) => {
    if (next === tab) return;
    setTab(next);
    startedRef.current = true;
    sa.runInitial(next, text, images);
  };

  const handleAsk = () => {
    const q = question.trim();
    if ((!q && questionImages.length === 0) || sa.phase === "streaming") return;
    setQuestion("");
    const attachments = questionImages;
    setQuestionImages([]);
    sa.ask(q, attachments);
  };

  const onKeyQuestion = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="popup-shell">
      <header className="popup-header draggable select-none">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <div>
            <strong>划词助手</strong>
            <span>Selection assistant</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            onClick={sa.toggleThinking}
            className={`no-drag mode-button ${sa.thinkingEnabled ? "is-active" : ""}`}
            title={sa.thinkingEnabled ? "深度思考已开启" : "开启深度思考"}
            aria-pressed={sa.thinkingEnabled}
          >
            <SparkIcon />
            深度
          </button>
          <button
            onClick={onClose}
            className="no-drag icon-button"
            title="关闭"
            aria-label="关闭浮窗"
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="context-strip">
        <div className="segmented-control" role="tablist" aria-label="处理方式">
          <button
            onClick={() => switchTab("translate")}
            className={tab === "translate" ? "is-active" : ""}
            role="tab"
            aria-selected={tab === "translate"}
          >
            翻译
          </button>
          <button
            onClick={() => switchTab("explain")}
            className={tab === "explain" ? "is-active" : ""}
            role="tab"
            aria-selected={tab === "explain"}
          >
            解释
          </button>
          <button
            onClick={() => switchTab("chat")}
            className={tab === "chat" ? "is-active" : ""}
            role="tab"
            aria-selected={tab === "chat"}
          >
            Chat
          </button>
        </div>
        <div className="source-preview" title={text || `${images.length} 张图片`}>
          <span>{images.length > 0 ? `输入 · ${images.length} 张图片` : "输入内容"}</span>
          <p>{text || "仅图片输入"}</p>
        </div>
      </div>

      {/* 音标（仅在有音标时显示，首条结果） */}
      <PhoneticsBar phonetics={sa.phonetics} />

      {/* 思考过程（开启思考模式时默认展开） */}
      <ThinkingPanel
        content={sa.thinking}
        streaming={sa.phase === "streaming"}
        defaultOpen={sa.thinkingEnabled}
      />

      {/* 错误 */}
      <ErrorBanner error={sa.error} />

      {/* 消息列表（历史 + 当前流式） */}
      <MessageList
        history={sa.history}
        streamingContent={sa.content}
        streaming={sa.phase === "streaming"}
        streamingRole="assistant"
      />

      {/* 追问输入框 */}
      <footer className="composer-wrap">
        <div className="mb-2">
          <ImageAttachments
            files={questionImages}
            onChange={setQuestionImages}
            compact
          />
        </div>
        <div className="composer">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onPaste={(event) => {
              const pasted = imageFilesFromClipboard(event.clipboardData);
              if (pasted.length > 0) {
                event.preventDefault();
                setQuestionImages((current) => mergeImageFiles(current, pasted));
              }
            }}
            onKeyDown={onKeyQuestion}
            placeholder={tab === "chat" ? "继续 Chat，可粘贴图片…" : "围绕当前内容继续问…"}
            rows={1}
            className="selectable composer-input"
            aria-label="继续提问"
          />
          <button
            onClick={handleAsk}
            disabled={
              sa.phase === "streaming" ||
              (!question.trim() && questionImages.length === 0)
            }
            className="send-button"
            aria-label="发送问题"
          >
            {sa.phase === "streaming" ? <LoadingIcon /> : <ArrowIcon />}
          </button>
        </div>
        <div className="composer-meta">
          <span className={sa.phase === "streaming" ? "stream-status is-live" : "stream-status"}>
            <i />{sa.phase === "streaming" ? "实时生成中" : "Enter 发送 · Shift + Enter 换行"}
          </span>
          <button
            onClick={() => {
              if (sa.phase === "streaming" || sa.history.length === 0) return;
              if (confirm("开新会话将清空历史并重新处理当前内容，确定？")) {
                setQuestionImages([]);
                sa.runInitial(tab, text, images);
              }
            }}
            disabled={sa.history.length === 0 || sa.phase === "streaming"}
            className="new-thread-button"
          >
            <RefreshIcon /> 新会话
          </button>
        </div>
      </footer>
    </div>
  );
}

function SparkIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c.45 3.05 1.45 4.05 4.5 4.5-3.05.45-4.05 1.45-4.5 4.5C7.55 7.45 6.55 6.45 3.5 6 6.55 5.55 7.55 4.55 8 1.5Z"/><path d="M12.3 9.6c.22 1.5.7 1.98 2.2 2.2-1.5.22-1.98.7-2.2 2.2-.22-1.5-.7-1.98-2.2-2.2 1.5-.22 1.98-.7 2.2-2.2Z"/></svg>;
}
function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h10M10 5l4 4-4 4" /></svg>;
}
function RefreshIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 7a5 5 0 1 0-.9 3M13 3v4H9" /></svg>;
}
function LoadingIcon() {
  return <span className="button-loader" aria-hidden="true" />;
}
