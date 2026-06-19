/**
 * 后端 API 客户端。
 *
 * - translate / explain / ocr: multipart/form-data
 * - selection / chat: JSON
 * - detect: GET 查询
 * - 流式走 sse.ts
 *
 * 基地址：生产由 preload 注入（window.__BACKEND_BASE__），开发默认 http://localhost:8000。
 */

import type {
  ChatRequest,
  ChatResponse,
  DetectResponse,
  ExplainResponse,
  OcrResponse,
  SelectionResponse,
  TranslateResponse,
  VisionResponse,
  BackendErrorBody,
} from "./types";
import { BackendError } from "./types";

export { BackendError } from "./types";

/** 解析后端错误体 { detail: { code, message } } */
async function parseError(resp: Response): Promise<BackendError> {
  let code = "http_error";
  let message = `HTTP ${resp.status}`;
  try {
    const data = (await resp.json()) as BackendErrorBody;
    const detail = data?.detail;
    if (detail && typeof detail === "object") {
      code = detail.code ?? code;
      message = detail.message ?? message;
    } else if (typeof detail === "string") {
      message = detail;
    }
  } catch {
    /* ignore */
  }
  return new BackendError(message, code, resp.status);
}

/** 拿到基地址：优先用 preload 注入的 doubaoAPI（能拿到主进程真实端口），回退到 __BACKEND_BASE__ */
export function getBackendBase(): string {
  if (typeof window !== "undefined") {
    if (window.doubaoAPI?.getBackendBase) {
      return window.doubaoAPI.getBackendBase();
    }
    if (window.__BACKEND_BASE__) {
      return window.__BACKEND_BASE__;
    }
  }
  return "http://localhost:8000";
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const base = getBackendBase();
  const resp = await fetch(`${base}${path}`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw await parseError(resp);
  return (await resp.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = getBackendBase();
  const resp = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw await parseError(resp);
  return (await resp.json()) as T;
}

// ---------------------------------------------------------------------------
// 端点封装
// ---------------------------------------------------------------------------
export interface TranslateOpts {
  source_lang?: string;
  target_lang?: string;
  images?: File[];
}

export async function translate(
  text: string,
  opts: TranslateOpts = {}
): Promise<TranslateResponse> {
  const form = new FormData();
  if (text) form.append("text", text);
  form.append("source_lang", opts.source_lang ?? "auto");
  if (opts.target_lang) form.append("target_lang", opts.target_lang);
  for (const f of opts.images ?? []) form.append("images", f);
  return postForm<TranslateResponse>("/api/translate", form);
}

export interface ExplainOpts {
  context?: string;
  style?: "concise" | "detailed";
  images?: File[];
}

export async function explain(
  text: string,
  opts: ExplainOpts = {}
): Promise<ExplainResponse> {
  const form = new FormData();
  if (text) form.append("text", text);
  if (opts.context) form.append("context", opts.context);
  form.append("style", opts.style ?? "concise");
  for (const f of opts.images ?? []) form.append("images", f);
  return postForm<ExplainResponse>("/api/explain", form);
}

export async function detectSelection(text: string): Promise<SelectionResponse> {
  return postJson<SelectionResponse>("/api/selection", { text });
}

export async function detect(text: string): Promise<DetectResponse> {
  const base = getBackendBase();
  const resp = await fetch(
    `${base}/api/detect?text=${encodeURIComponent(text)}`
  );
  if (!resp.ok) throw await parseError(resp);
  return (await resp.json()) as DetectResponse;
}

export async function ocr(files: File[]): Promise<OcrResponse> {
  const form = new FormData();
  for (const f of files) form.append("images", f);
  return postForm<OcrResponse>("/api/ocr", form);
}

export async function explainVision(
  text: string | null,
  images: File[],
  context?: string
): Promise<VisionResponse> {
  const form = new FormData();
  if (text) form.append("text", text);
  if (context) form.append("context", context);
  for (const f of images) form.append("images", f);
  return postForm<VisionResponse>("/api/explain/vision", form);
}

/** 多轮追问（非流式） */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  return postJson<ChatResponse>("/api/chat", req);
}

/** 构造流式端点 URL（供 sse.ts 用） */
export function streamUrl(kind: "translate" | "explain"): string {
  return `${getBackendBase()}/api/${kind}/stream`;
}

export function chatStreamUrl(): string {
  return `${getBackendBase()}/api/chat/stream`;
}
