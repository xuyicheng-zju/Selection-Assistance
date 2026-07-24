/// <reference types="vite/client" />

// 渲染进程通过 preload 注入的后端地址
interface Window {
  // 由 preload 脚本注入的基础地址（生产=内嵌后端, 开发=http://localhost:8000）
  __BACKEND_BASE__?: string;
}

// 与 electron/preload.ts 暴露的 doubaoAPI 对齐
type Action = "translate" | "explain" | "chat";
type TriggerPayload = { action: Action; text: string; context?: string };
type ClipboardImage = {
  dataUrl: string;
  mimeType: "image/png";
  width: number;
  height: number;
};
type AppSettings = {
  backendBase: string;
  hotkey: string;
  hotkeyTranslate: string;
  hotkeyExplain: string;
  showThinking: boolean;
  enableActionButton: boolean;
  launchAtLogin: boolean;
};

interface DoubaoAPI {
  onTriggerAction(cb: (payload: TriggerPayload) => void): () => void;
  closeWindow(): void;
  triggerAction(action: Action): void;
  reportSelection(text: string, x: number, y: number): void;
  quit(): void;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  readClipboardImage(): Promise<ClipboardImage | null>;
  getBackendBase(): string;
}

interface Window {
  doubaoAPI?: DoubaoAPI;
}
