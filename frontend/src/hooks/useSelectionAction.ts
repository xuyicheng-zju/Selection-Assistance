/**
 * 划词动作状态机：执行初始 translate/explain（SSE 流式），并支持多轮追问。
 *
 * 维护：
 * - 主结果内容（translation 或 explanation）
 * - 音标（仅初始动作）
 * - 思考过程
 * - 多轮对话历史（user/assistant），用于后续追问
 * - 状态：idle / loading / streaming / done / error
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ChatMessage, Phonetics } from "../lib/types";
import { BackendError } from "../lib/types";
import { streamRequest } from "../lib/sse";
import { streamUrl, chatStreamUrl } from "../lib/api";

export type Phase = "idle" | "loading" | "streaming" | "done" | "error";

export interface UseSelectionAction {
  phase: Phase;
  content: string; // 主结果（翻译/解释/追问答案）
  phonetics: Phonetics | null;
  thinking: string;
  error: BackendError | null;
  history: ChatMessage[]; // 多轮历史（user/assistant）
  initialAction: Action | null;
  thinkingEnabled: boolean; // 思考模式开关（供 UI 显示）
  // 执行初始动作
  runInitial: (action: Action, text: string) => Promise<void>;
  // 追问
  ask: (question: string) => Promise<void>;
  // 切换思考模式（同步持久化到设置）
  toggleThinking: () => void;
  // 中断
  abort: () => void;
  reset: () => void;
}

export function useSelectionAction(selectedText: string): UseSelectionAction {
  const [phase, setPhase] = useState<Phase>("idle");
  const [content, setContent] = useState("");
  const [phonetics, setPhonetics] = useState<Phonetics | null>(null);
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<BackendError | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [initialAction, setInitialAction] = useState<Action | null>(null);
  // 是否开启 DeepSeek 思考模式（从主进程设置读，默认 false）
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  useEffect(() => {
    window.doubaoAPI
      ?.getSettings()
      .then((s) => setThinkingEnabled(s.showThinking))
      .catch(() => {});
  }, []);

  const thinkingHeaders = () =>
    thinkingEnabled ? { "X-Enable-Thinking": "true" } : { "X-Enable-Thinking": "false" };

  const abortRef = useRef<AbortController | null>(null);
  // 最新选中文字（追问时需要作为 selected_text）
  const selectedRef = useRef(selectedText);
  useEffect(() => {
    selectedRef.current = selectedText;
  }, [selectedText]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    setPhase("idle");
    setContent("");
    setPhonetics(null);
    setThinking("");
    setError(null);
    setHistory([]);
    setInitialAction(null);
  }, [abort]);

  const runInitial = useCallback(
    async (action: Action, text: string) => {
      abort();
      setPhase("streaming");
      setContent("");
      setPhonetics(null);
      setThinking("");
      setError(null);
      // 首条：把「动作: 选中文本」作为 user 消息，让对话历史连贯
      const actionLabel = action === "translate" ? "翻译" : "解释";
      setHistory([{ role: "user", content: `${actionLabel}：${text}` }]);
      setInitialAction(action);
      selectedRef.current = text;

      const controller = new AbortController();
      abortRef.current = controller;

      // 构造 multipart 表单
      const form = new FormData();
      form.append("text", text);
      if (action === "translate") {
        form.append("source_lang", "auto");
        form.append("target_lang", "zh");
      } else {
        form.append("style", "concise");
      }

      await streamRequest(
        streamUrl(action),
        form,
        {
          onPhonetics: (d) => {
            setPhonetics(d.phonetics as Phonetics);
          },
          onThinking: (delta) => setThinking((s) => s + delta),
          onDelta: (delta) => setContent((s) => s + delta),
          onDone: () => {
            setPhase("done");
            // 把首条结果存入历史（assistant），便于追问
            setContent((cur) => {
              setHistory((h) => [...h, { role: "assistant", content: cur }]);
              return cur;
            });
          },
          onError: ({ code, message }) => {
            setError(new BackendError(message, code, 0));
            setPhase("error");
          },
        },
        { signal: controller.signal, headers: thinkingHeaders() }
      );
    },
    [abort, thinkingEnabled]
  );

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || !initialAction) return;
      abort();
      setPhase("streaming");
      setThinking("");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // 先把用户问题追加进历史（本地），用 snapshot 调用后端
      const historyBefore = history;
      setHistory((h) => [...h, { role: "user", content: question }]);
      setContent("");

      const body = JSON.stringify({
        selected_text: selectedRef.current,
        initial_action: initialAction,
        history: historyBefore, // 不含本轮
        question,
      });

      await streamRequest(
        chatStreamUrl(),
        body,
        {
          onThinking: (delta) => setThinking((s) => s + delta),
          onDelta: (delta) => setContent((s) => s + delta),
          onDone: () => {
            setPhase("done");
            setContent((cur) => {
              setHistory((h) => [...h, { role: "assistant", content: cur }]);
              return cur;
            });
          },
          onError: ({ code, message }) => {
            setError(new BackendError(message, code, 0));
            setPhase("error");
          },
        },
        { signal: controller.signal, headers: thinkingHeaders() }
      );
    },
    [abort, history, initialAction, thinkingEnabled]
  );

  // 切换思考模式：更新本地 state + 持久化到主进程设置
  const toggleThinking = useCallback(() => {
    setThinkingEnabled((prev) => {
      const next = !prev;
      window.doubaoAPI?.setSettings({ showThinking: next }).catch(() => {});
      return next;
    });
  }, []);

  return {
    phase,
    content,
    phonetics,
    thinking,
    error,
    history,
    initialAction,
    thinkingEnabled,
    runInitial,
    ask,
    toggleThinking,
    abort,
    reset,
  };
}
