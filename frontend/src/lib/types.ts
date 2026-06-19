// 与后端 app/schemas.py 严格对齐的 TypeScript 类型。

export type Action = "translate" | "explain";

export type TextKind =
  | "word"
  | "phrase"
  | "sentence"
  | "chinese"
  | "code"
  | "other";

/** 音标结构（后端 Phonetics） */
export interface Phonetics {
  ipa: string | null;
  uk: string | null;
  us: string | null;
  pinyin: string | null;
}

export interface TranslateResponse {
  text: string;
  phonetics: Phonetics;
  translation: string;
  detected_lang: string | null;
  model: string;
  reasoning: string | null;
}

export interface ExplainResponse {
  text: string;
  phonetics: Phonetics;
  explanation: string; // Markdown
  model: string;
  reasoning: string | null;
}

export interface SelectionResponse {
  text: string;
  kind: TextKind;
  needs_phonetics: boolean;
  suggested_actions: Action[];
}

export interface DetectResponse {
  kind: TextKind;
  needs_phonetics: boolean;
}

export interface OcrResponse {
  texts: string[];
  full_text: string;
  model: string;
}

export interface VisionResponse {
  answer: string; // Markdown
  model: string;
}

/** 多轮对话 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  selected_text: string;
  initial_action: Action;
  history: ChatMessage[];
  question: string;
}

export interface ChatResponse {
  answer: string; // Markdown
  model: string;
  reasoning: string | null;
}

/** 后端 HTTP 错误体（FastAPI 信封）：{ detail: { code, message } } */
export interface BackendErrorBody {
  detail?: { code?: string; message?: string } | string;
}

export class BackendError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "BackendError";
  }
}
