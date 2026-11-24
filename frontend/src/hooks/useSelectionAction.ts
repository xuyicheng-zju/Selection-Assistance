/**
 * 划词动作状态机：执行 translate / explain / chat（SSE 流式），并支持多轮多图追问。
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
import { chatStreamBody, streamUrl, chatStreamUrl } from "../lib/api";

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
  runInitial: (action: Action, text: string, images?: File[], targetLang?: string) => Promise<void>;
  // 追问
  ask: (question: string, images?: File[]) => Promise<void>;
  // 切换思考模式（同步持久化到设置）
  toggleThinking: () => void;
  // 中断
  stop: () => void;
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

  const contentRef = useRef("");
  const thinkingRef = useRef("");
  const shownRef = useRef("");
  const pendingRef = useRef<string[]>([]);
  const flushFrameRef = useRef<number | null>(null);
  const frameTimeRef = useRef<number | null>(null);
  const characterCreditRef = useRef(0);
  const finishRef = useRef<(() => void) | null>(null);
  const finalRateRef = useRef(0);
  const requestIdRef = useRef(0);

  const cancelScheduledFlush = useCallback(() => {
    if (flushFrameRef.current !== null) {
      cancelAnimationFrame(flushFrameRef.current);
      flushFrameRef.current = null;
    }
    pendingRef.current = [];
    finishRef.current = null;
    frameTimeRef.current = null;
    characterCreditRef.current = 0;
    finalRateRef.current = 0;
  }, []);

  const flushStream = useCallback(() => {
    cancelScheduledFlush();
    shownRef.current = contentRef.current;
    setContent(shownRef.current);
    setThinking(thinkingRef.current);
  }, [cancelScheduledFlush]);

  const scheduleFlush = useCallback(() => {
    if (flushFrameRef.current !== null) return;

    const reveal = (now: number) => {
      flushFrameRef.current = null;
      const queue = pendingRef.current;
      const elapsed = Math.min(34, now - (frameTimeRef.current ?? now - 16));
      const rate = Math.max(70, finishRef.current ? finalRateRef.current : queue.length * 2.5);
      frameTimeRef.current = now;
      characterCreditRef.current += rate * elapsed / 1000;
      const count = Math.min(queue.length, Math.floor(characterCreditRef.current));
      if (count) {
        shownRef.current += queue.splice(0, count).join("");
        characterCreditRef.current -= count;
        setContent(shownRef.current);
      }
      setThinking(thinkingRef.current);

      if (queue.length) {
        flushFrameRef.current = requestAnimationFrame(reveal);
      } else {
        frameTimeRef.current = null;
        characterCreditRef.current = 0;
        const finish = finishRef.current;
        finishRef.current = null;
        finish?.();
      }
    };

    flushFrameRef.current = requestAnimationFrame(reveal);
  }, []);

  const appendContent = useCallback((delta: string) => {
    const characters = Array.from(delta);
    if (!characters.length) return;
    if (!contentRef.current) {
      shownRef.current = characters.shift()!;
      setContent(shownRef.current);
    }
    contentRef.current += delta;
    pendingRef.current.push(...characters);
    scheduleFlush();
  }, [scheduleFlush]);

  const finishStream = useCallback((requestId: number) => {
    const complete = () => {
      if (requestId !== requestIdRef.current) return;
      const completed = contentRef.current;
      if (completed) {
        setHistory((history) => [...history, { role: "assistant", content: completed }]);
      }
      setThinking(thinkingRef.current);
      setContent("");
      contentRef.current = "";
      shownRef.current = "";
      setPhase("done");
    };
    if (pendingRef.current.length) {
      finishRef.current = complete;
      finalRateRef.current = pendingRef.current.length / 0.34;
      scheduleFlush();
    } else {
      complete();
    }
  }, [scheduleFlush]);

  useEffect(() => {
    window.doubaoAPI
      ?.getSettings()
      .then((s) => setThinkingEnabled(s.showThinking))
      .catch(() => {});
  }, []);

  const thinkingHeaders = () =>
    thinkingEnabled ? { "X-Enable-Thinking": "true" } : { "X-Enable-Thinking": "false" };

  const abortRef = useRef<AbortController | null>(null);
  // 初始图片会在后续追问中继续发送，保证视觉上下文不丢失。
  const contextImagesRef = useRef<File[]>([]);
  // 最新选中文字（追问时需要作为 selected_text）
  const selectedRef = useRef(selectedText);
  useEffect(() => {
    selectedRef.current = selectedText;
  }, [selectedText]);

  const abort = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    cancelScheduledFlush();
  }, [cancelScheduledFlush]);

  const reset = useCallback(() => {
    abort();
    setPhase("idle");
    contentRef.current = "";
    thinkingRef.current = "";
    shownRef.current = "";
    setContent("");
    setPhonetics(null);
    setThinking("");
    setError(null);
    setHistory([]);
    setInitialAction(null);
    contextImagesRef.current = [];
  }, [abort]);

  const runInitial = useCallback(
    async (action: Action, text: string, images: File[] = [], targetLang = "zh") => {
      if (!text.trim() && images.length === 0) return;
      abort();
      setPhase("streaming");
      const requestId = requestIdRef.current;
      contentRef.current = "";
      thinkingRef.current = "";
      shownRef.current = "";
      setContent("");
      setPhonetics(null);
      setThinking("");
      setError(null);
      // 首条：把「动作: 选中文本」作为 user 消息，让对话历史连贯
      const actionLabel =
        action === "translate" ? "翻译" : action === "explain" ? "解释" : "Chat";
      const displayText = text.trim() || "请分析这些图片";
      const imageLabel = images.length > 0 ? `\n[附带 ${images.length} 张图片]` : "";
      setHistory([
        { role: "user", content: `${actionLabel}：${displayText}${imageLabel}` },
      ]);
      setInitialAction(action);
      selectedRef.current = action === "chat" ? "" : text;
      contextImagesRef.current = [...images];

      const controller = new AbortController();
      abortRef.current = controller;

      let requestUrl: string;
      let requestBody: FormData | string;
      if (action === "chat") {
        requestUrl = chatStreamUrl();
        requestBody = chatStreamBody(
          {
            selected_text: "",
            initial_action: "chat",
            history: [],
            question: displayText,
          },
          images
        );
      } else {
        requestUrl = streamUrl(action);
        const form = new FormData();
        if (text.trim()) form.append("text", text);
        for (const image of images) form.append("images", image);
        if (action === "translate") {
          form.append("source_lang", "auto");
          form.append("target_lang", targetLang);
        } else {
          form.append("style", "concise");
        }
        requestBody = form;
      }

      await streamRequest(
        requestUrl,
        requestBody,
        {
          onPhonetics: (d) => {
            if (requestId !== requestIdRef.current) return;
            setPhonetics(d.phonetics as Phonetics);
          },
          onThinking: (delta) => {
            if (requestId !== requestIdRef.current) return;
            thinkingRef.current += delta;
            scheduleFlush();
          },
          onDelta: (delta) => {
            if (requestId !== requestIdRef.current) return;
            appendContent(delta);
          },
          onDone: () => {
            if (requestId !== requestIdRef.current) return;
            finishStream(requestId);
          },
          onError: ({ code, message }) => {
            if (requestId !== requestIdRef.current) return;
            flushStream();
            setError(new BackendError(message, code, 0));
            setPhase("error");
          },
        },
        { signal: controller.signal, headers: thinkingHeaders() }
      );
    },
    [abort, appendContent, finishStream, flushStream, scheduleFlush, thinkingEnabled]
  );

  const ask = useCallback(
    async (question: string, images: File[] = []) => {
      if ((!question.trim() && images.length === 0) || !initialAction) return;
      abort();
      setPhase("streaming");
      const requestId = requestIdRef.current;
      contentRef.current = "";
      shownRef.current = "";
      thinkingRef.current = "";
      setThinking("");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // 先把用户问题追加进历史（本地），用 snapshot 调用后端
      const historyBefore = history;
      const normalizedQuestion = question.trim() || "请分析新添加的图片";
      const imageLabel = images.length > 0 ? `\n[新添加 ${images.length} 张图片]` : "";
      setHistory((h) => [
        ...h,
        { role: "user", content: `${normalizedQuestion}${imageLabel}` },
      ]);
      setContent("");

      const known = new Set(
        contextImagesRef.current.map(
          (image) => `${image.name}:${image.size}:${image.lastModified}`
        )
      );
      const contextImages = [...contextImagesRef.current];
      for (const image of images) {
        const key = `${image.name}:${image.size}:${image.lastModified}`;
        if (!known.has(key) && contextImages.length < 8) {
          contextImages.push(image);
          known.add(key);
        }
      }
      contextImagesRef.current = contextImages;
      const body = chatStreamBody(
        {
          selected_text: selectedRef.current,
          initial_action: initialAction,
          history: historyBefore, // 不含本轮
          question: normalizedQuestion,
        },
        contextImages
      );

      await streamRequest(
        chatStreamUrl(),
        body,
        {
          onThinking: (delta) => {
            if (requestId !== requestIdRef.current) return;
            thinkingRef.current += delta;
            scheduleFlush();
          },
          onDelta: (delta) => {
            if (requestId !== requestIdRef.current) return;
            appendContent(delta);
          },
          onDone: () => {
            if (requestId !== requestIdRef.current) return;
            finishStream(requestId);
          },
          onError: ({ code, message }) => {
            if (requestId !== requestIdRef.current) return;
            flushStream();
            setError(new BackendError(message, code, 0));
            setPhase("error");
          },
        },
        { signal: controller.signal, headers: thinkingHeaders() }
      );
    },
    [abort, appendContent, finishStream, flushStream, history, initialAction, scheduleFlush, thinkingEnabled]
  );

  const stop = useCallback(() => {
    const partial = shownRef.current;
    abort();
    if (partial) setHistory((items) => [...items, { role: "assistant", content: partial }]);
    setThinking(thinkingRef.current);
    contentRef.current = "";
    setContent("");
    setPhase("done");
  }, [abort]);

  // 切换思考模式：更新本地 state + 持久化到主进程设置
  const toggleThinking = useCallback(() => {
    setThinkingEnabled((prev) => {
      const next = !prev;
      window.doubaoAPI?.setSettings({ showThinking: next }).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      cancelScheduledFlush();
    };
  }, [cancelScheduledFlush]);

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
    stop,
    reset,
  };
}
