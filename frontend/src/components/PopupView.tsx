import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";
import { useSelectionAction } from "../hooks/useSelectionAction";
import { BrandLogo } from "./BrandLogo";
import { PhoneticsBar } from "./PhoneticsBar";
import { MessageList } from "./MessageList";
import { ThinkingPanel } from "./ThinkingPanel";
import { ErrorBanner } from "./ErrorBanner";
import {
  ClipboardIcon,
  ImageAttachments,
  ImageIcon,
  imageFilesFromClipboard,
  mergeImageFiles,
  readClipboardImageFile,
} from "./ImageAttachments";

interface Props {
  text: string;
  images?: File[];
  initialAction: Action;
  onClose: () => void;
  embedded?: boolean;
  targetLang?: string;
  floating?: {
    expanded: boolean;
    pinned: boolean;
    setExpanded: (expanded: boolean) => void;
    setPinned: (pinned: boolean) => void;
    changeLanguage: (language: string) => void;
  };
}

/** 划词浮窗主体：翻译 / 解释 / Chat + 多图输入 + 多轮追问。 */
export function PopupView({
  text,
  images = [],
  initialAction,
  onClose,
  embedded = false,
  targetLang = "zh",
  floating,
}: Props) {
  const sa = useSelectionAction(text);
  const [tab, setTab] = useState<Action>(initialAction);
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("");
  const [question, setQuestion] = useState("");
  const [questionImages, setQuestionImages] = useState<File[]>([]);
  const [draggingOverComposer, setDraggingOverComposer] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 首次进入：执行初始动作
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setTab(initialAction);
    sa.runInitial(initialAction, text, images, targetLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // 切换 Tab：重新执行对应动作
  const switchTab = (next: Action) => {
    if (next === tab) return;
    setTab(next);
    startedRef.current = true;
    setCopyState("");
    sa.runInitial(next, text, images, targetLang);
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
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAsk();
    }
  };

  const answer =
    sa.content ||
    [...sa.history].reverse().find((message) => message.role === "assistant")?.content;

  const compact = Boolean(floating && !floating.expanded);
  const streaming = sa.phase === "streaming";
  const plainOutput = streaming || tab === "translate";
  const compactHtml = useMemo(
    () => compact && answer && !plainOutput ? renderMarkdown(answer) : "",
    [compact, answer, plainOutput],
  );

  const copyAnswer = async () => {
    if (!answer) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    copyTimerRef.current = setTimeout(() => setCopyState(""), 1800);
  };

  const pasteComposerImage = async () => {
    try {
      const file = await readClipboardImageFile();
      if (file) setQuestionImages((current) => mergeImageFiles(current, [file]));
    } catch {
      // 忽略剪贴板读取异常
    }
  };

  if (compact && floating) {
    return (
      <div className="popup-shell compact-popup">
        <header className="popup-header draggable">
          <div className="brand-lockup">
            <BrandLogo size={24} />
            <strong>{tab === "translate" ? "划词翻译" : tab === "explain" ? "划词解释" : "划词助手"}</strong>
          </div>
          <div className="header-actions">
            <button className={`no-drag icon-button ${floating.pinned ? "is-pinned" : ""}`}
              title={floating.pinned ? "取消置顶" : "置顶"}
              aria-label="置顶" aria-pressed={floating.pinned}
              onClick={() => floating.setPinned(!floating.pinned)}><PinIcon /></button>
            <button className="no-drag icon-button" onClick={onClose} aria-label="关闭浮窗"><CloseIcon /></button>
          </div>
        </header>

        {tab === "translate" && (
          <div className="compact-languages">
            <span>自动检测</span>
            <span className="compact-language-arrow" aria-hidden="true">→</span>
            <select aria-label="译入语言" value={targetLang} onChange={(event) => {
              const language = event.target.value;
              floating.changeLanguage(language);
              setCopyState("");
              void sa.runInitial(tab, text, images, language);
            }}>
              <option value="zh">中文（简体）</option>
              <option value="en">英语</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
              <option value="fr">法语</option>
              <option value="de">德语</option>
            </select>
          </div>
        )}
        <PhoneticsBar phonetics={sa.phonetics} />
        <div className="compact-result">
          <ErrorBanner error={sa.error} />
          {answer ? (
            <div className="md-body selectable" aria-label={tab === "translate" ? "译文" : "回答"}>
              {plainOutput
                ? <div className="streaming-text">{answer}{streaming && <span className="stream-caret" aria-hidden="true" />}</div>
                : <div dangerouslySetInnerHTML={{ __html: compactHtml }} />}

            </div>
          ) : !sa.error && (
            <span className="compact-status" role="status">{streaming
              ? (tab === "translate" ? "正在翻译…" : "正在生成…")
              : sa.phase === "done" ? "暂无结果" : "正在准备…"}</span>
          )}
        </div>
        <footer className="compact-footer">
          <button className="mode-button" onClick={() => floating.setExpanded(true)}>追问</button>
          {streaming && <button className="mode-button" onClick={sa.stop}>停止</button>}
          <button className="mode-button compact-copy" onClick={copyAnswer} disabled={!answer}>
            {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
            {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className={`popup-shell ${embedded ? "is-embedded" : ""}`}>
      <header className={`popup-header select-none ${embedded ? "" : "draggable"}`}>
        <div className="brand-lockup">
          {embedded ? (
            <span className="embedded-badge" aria-hidden="true">
              <ResultBadgeIcon />
            </span>
          ) : (
            <BrandLogo size={26} className="popup-brand-icon" />
          )}
          <strong>{embedded ? "结果与追问" : "划词助手"}</strong>
        </div>
        <div className="header-actions">
          {answer && (
            <button
              className={`no-drag mode-button ${copyState === "copied" ? "is-copied" : ""}`}
              onClick={copyAnswer}
            >
              {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
              {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制回答"}
            </button>
          )}
          <button
            onClick={sa.toggleThinking}
            className={`no-drag mode-button ${sa.thinkingEnabled ? "is-active" : ""}`}
            title="为下一次请求开启或关闭思考展示"
            aria-pressed={sa.thinkingEnabled}
          >
            <SparkIcon />
            思考
          </button>
          {floating && (
            <>
              <button
                onClick={() => floating.setExpanded(false)}
                className="no-drag icon-button"
                title="收起浮窗"
                aria-label="收起浮窗"
              >
                <CollapseIcon />
              </button>
              <button
                onClick={() => floating.setPinned(!floating.pinned)}
                className={`no-drag icon-button ${floating.pinned ? "is-active" : ""}`}
                aria-label="置顶"
                aria-pressed={floating.pinned}
              >
                <PinIcon />
              </button>
            </>
          )}
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
            聊天
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
        hideInitialUserEcho={tab !== "chat"}
      />

      {/* 追问输入框 */}
      <footer
        className={`composer-wrap ${draggingOverComposer ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDraggingOverComposer(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDraggingOverComposer(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDraggingOverComposer(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length) {
            setQuestionImages((current) => mergeImageFiles(current, dropped));
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length) {
              setQuestionImages((current) => mergeImageFiles(current, picked));
            }
            event.target.value = "";
          }}
        />
        <ImageAttachments
          files={questionImages}
          onChange={setQuestionImages}
          compact
          hideEmptyToolbar
        />
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
            placeholder={tab === "chat" ? "继续对话，可拖拽或粘贴图片…" : "围绕当前内容继续追问…"}
            rows={1}
            className="selectable composer-input"
            aria-label="继续提问"
          />
          <button
            onClick={sa.phase === "streaming" ? sa.stop : handleAsk}
            disabled={sa.phase !== "streaming" && !question.trim() && questionImages.length === 0}
            className="send-button"
            aria-label={sa.phase === "streaming" ? "停止生成" : "发送问题"}
          >
            {sa.phase === "streaming" ? <StopIcon /> : <ArrowIcon />}
          </button>
        </div>
        <div className="composer-meta">
          <div className="composer-tools">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="composer-tool-btn"
              title="添加图片"
            >
              <ImageIcon />
              <span>图片</span>
            </button>
            {window.doubaoAPI && (
              <button
                type="button"
                onClick={pasteComposerImage}
                className="composer-tool-btn"
                title="粘贴剪贴板图片"
              >
                <ClipboardIcon />
                <span>粘贴</span>
              </button>
            )}
            <span className={sa.phase === "streaming" ? "stream-status is-live" : "stream-status"}>
              <i />
              {sa.phase === "streaming" ? "实时生成中" : "Enter 发送 · ⇧Enter 换行"}
            </span>
          </div>
          <button
            onClick={() => {
              if (sa.phase === "streaming" || sa.history.length === 0) return;
              if (confirm("开新会话将清空历史并重新处理当前内容，确定？")) {
                setQuestionImages([]);
                setCopyState("");
                sa.runInitial(tab, text, images, targetLang);
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

function ResultBadgeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2c.4 2.7 1.3 3.6 4 4-2.7.4-3.6 1.3-4 4-.4-2.7-1.3-3.6-4-4 2.7-.4 3.6-1.3 4-4Z" fill="currentColor" />
      <path d="M12.3 10.2c.18 1.2.6 1.62 1.8 1.8-1.2.18-1.62.6-1.8 1.8-.18-1.2-.6-1.62-1.8-1.8 1.2-.18 1.62-.6 1.8-1.8Z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5c.45 3.05 1.45 4.05 4.5 4.5-3.05.45-4.05 1.45-4.5 4.5C7.55 7.45 6.55 6.45 3.5 6 6.55 5.55 7.55 4.55 8 1.5Z" />
      <path d="M12.3 9.6c.22 1.5.7 1.98 2.2 2.2-1.5.22-1.98.7-2.2 2.2-.22-1.5-.7-1.98-2.2-2.2 1.5-.22 1.98-.7 2.2-2.2Z" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="stroke-icon">
      <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.6" />
      <path d="M10.5 5.5V4.2A1.2 1.2 0 0 0 9.3 3H4.2A1.2 1.2 0 0 0 3 4.2v5.1a1.2 1.2 0 0 0 1.2 1.2h1.3" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="stroke-icon">
      <path d="m3.5 8.5 3 3 6-6.5" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 14V4M4.8 8.2 9 4l4.2 4.2" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 7a5 5 0 1 0-.9 3M13 3v4H9" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="5.2" y="5.2" width="7.6" height="7.6" rx="1.6" fill="currentColor" />
    </svg>
  );
}
function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2.75V6H2.75M10 13.25V10h3.25M2.5 2.5 6 6M13.5 13.5 10 10" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 2.8h6L9.8 5v2.8l1.6 1.7v.9H4.6v-.9l1.6-1.7V5L5 2.8ZM8 10.4v3.1" />
    </svg>
  );
}
