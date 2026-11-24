/**
 * Preload：在隔离的上下文里向渲染进程暴露受控的 API。
 *
 * 渲染进程拿到 window.doubaoAPI（popup/actionButton）和 window.doubaoMain（主窗口）。
 * 后端地址通过 __BACKEND_BASE__ 注入，避免渲染进程硬编码。
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  IPC,
  Action,
  TriggerPayload,
  AppSettings,
  ClipboardImage,
  ModelBackend,
} from "./ipc";

// 后端地址默认值；主进程会在 SETTINGS_GET 里返回真实地址（可能因端口占用而变化）。
const BACKEND_BASE_DEFAULT = "http://127.0.0.1:8000";
type BackendConnection = { base: string; token: string; modelBackend: ModelBackend; model?: string; effort?: string } | undefined;
const connection = (): BackendConnection => ipcRenderer.sendSync("backend:get-base");
const base = connection()?.base ?? BACKEND_BASE_DEFAULT;

/** 浮窗 / 悬浮按钮 用的 API */
const popupApi = {
  onTriggerAction(cb: (payload: TriggerPayload) => void): () => void {
    const handler = (_e: IpcRendererEvent, payload: TriggerPayload) => cb(payload);
    ipcRenderer.on(IPC.ACTION_RUN, handler);
    ipcRenderer.send(IPC.POPUP_READY);
    return () => ipcRenderer.removeListener(IPC.ACTION_RUN, handler);
  },
  setPopupExpanded(expanded: boolean): void {
    ipcRenderer.send(IPC.POPUP_EXPAND, expanded);
  },
  setPopupPinned(pinned: boolean): void {
    ipcRenderer.send(IPC.POPUP_PIN, pinned);
  },
  closeWindow(): void {
    ipcRenderer.send(IPC.POPUP_CLOSE);
  },
  /** 通知悬浮按钮被点击 */
  triggerAction(action: Action): void {
    ipcRenderer.send(IPC.ACTION_TRIGGER, action);
  },
  /** 主窗口：上报选区 */
  reportSelection(text: string, x: number, y: number): void {
    ipcRenderer.send(IPC.REPORT_SELECTION, { text, x, y });
  },
  quit(): void {
    ipcRenderer.send(IPC.QUIT_APP);
  },
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_GET);
  },
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET, patch);
  },
  readClipboardImage(): Promise<ClipboardImage | null> {
    return ipcRenderer.invoke(IPC.CLIPBOARD_READ_IMAGE);
  },
  readClipboardText(): Promise<string> {
    return ipcRenderer.invoke(IPC.CLIPBOARD_READ_TEXT);
  },
  accessibility(prompt = false): Promise<boolean | null> {
    return ipcRenderer.invoke(IPC.ACCESSIBILITY, prompt);
  },
  getBackendHeaders(): Record<string, string> {
    const backend = connection();
    const headers: Record<string, string> = {};
    if (backend?.token) {
      headers["X-Selection-Token"] = backend.token;
      headers["X-Model-Backend"] = backend.modelBackend;
    }
    if (backend && (!backend.token || backend.modelBackend === "codex")) {
      if (backend.model) headers["X-Codex-Model"] = backend.model;
      if (backend.effort) headers["X-Codex-Effort"] = backend.effort;
    }
    return headers;
  },
  getBackendBase(): string {
    return base;
  },
};

contextBridge.exposeInMainWorld("doubaoAPI", popupApi);
contextBridge.exposeInMainWorld("__BACKEND_BASE__", BACKEND_BASE_DEFAULT);
