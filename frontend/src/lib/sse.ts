/**
 * POST SSE 解析器。
 *
 * 浏览器原生 EventSource 只支持 GET，而后端的 stream 端点是 POST。
 * 这里用 fetch + ReadableStream 手写一个 SSE 解析器：
 * 按 "\n\n" 切事件块，每块解析 "event:" 和 "data:" 行。
 *
 * 事件序列（与后端 _sse 对齐）：
 *   phonetics -> { phonetics: Phonetics }
 *   thinking  -> { delta: string }
 *   delta     -> { delta: string }
 *   done      -> { model, detected_lang? }
 *   error     -> { code, message }
 */

export interface SseHandlers {
  onPhonetics?: (data: { phonetics: unknown }) => void;
  onThinking?: (delta: string) => void;
  onDelta?: (delta: string) => void;
  onDone?: (data: { model: string; detected_lang?: string | null }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

interface ParsedEvent {
  event: string;
  data: string;
}

/** 把一段 SSE 文本切成事件块并解析 */
export function parseSseChunk(buffer: string): {
  events: ParsedEvent[];
  rest: string;
} {
  const events: ParsedEvent[] = [];
  let rest = buffer;

  // 事件以空行（\n\n 或 \r\n\r\n）分隔
  const sep = /\r?\n\r?\n/;
  while (true) {
    const m = rest.match(sep);
    if (!m || m.index === undefined) break;
    const rawBlock = rest.slice(0, m.index);
    rest = rest.slice(m.index + m[0].length);

    const lines = rawBlock.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^\s/, ""));
      }
    }
    if (dataLines.length === 0) continue;
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

/** 把单个事件分发到 handlers */
export function dispatchEvent(ev: ParsedEvent, h: SseHandlers): void {
  let payload: Record<string, unknown> = {};
  try {
    payload = ev.data ? JSON.parse(ev.data) : {};
  } catch {
    payload = {};
  }
  switch (ev.event) {
    case "phonetics":
      h.onPhonetics?.(payload as { phonetics: unknown });
      break;
    case "thinking":
      h.onThinking?.(String(payload.delta ?? ""));
      break;
    case "delta":
      h.onDelta?.(String(payload.delta ?? ""));
      break;
    case "done":
      h.onDone?.(payload as { model: string; detected_lang?: string | null });
      break;
    case "error":
      h.onError?.({
        code: String(payload.code ?? "error"),
        message: String(payload.message ?? "未知错误"),
      });
      break;
    default:
      break;
  }
}

/**
 * 发起 POST SSE 请求并流式分发。
 * @param url 完整 URL
 * @param body 请求体（FormData 或 JSON 字符串）
 * @param isForm 是否 multipart（决定 Content-Type）
 * @returns AbortController（用于中断）
 */
export async function streamRequest(
  url: string,
  body: FormData | string,
  handlers: SseHandlers,
  opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}
): Promise<void> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (typeof body === "string") {
    headers["Content-Type"] = "application/json";
  }
  // FormData 不设 Content-Type，浏览器自动加 boundary

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: opts.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    handlers.onError?.({ code: "network", message: `请求失败: ${msg}` });
    return;
  }

  if (!resp.ok || !resp.body) {
    // 非流式错误：尝试解析 detail
    let message = `HTTP ${resp.status}`;
    let code = "http_error";
    try {
      const data = await resp.json();
      const detail = data?.detail;
      if (typeof detail === "object" && detail) {
        message = detail.message ?? message;
        code = detail.code ?? code;
      } else if (typeof detail === "string") {
        message = detail;
      }
    } catch {
      /* ignore */
    }
    handlers.onError?.({ code, message });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const ev of events) dispatchEvent(ev, handlers);
    }
    // flush 残留
    buffer += decoder.decode();
    if (buffer.trim()) {
      const { events } = parseSseChunk(buffer + "\n\n");
      for (const ev of events) dispatchEvent(ev, handlers);
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    const msg = e instanceof Error ? e.message : String(e);
    handlers.onError?.({ code: "stream", message: `流式中断: ${msg}` });
  }
}
