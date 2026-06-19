/**
 * Preload：在隔离的上下文里向渲染进程暴露受控的 API。
 *
 * 渲染进程拿到 window.doubaoAPI（popup/actionButton）和 window.doubaoMain（主窗口）。
 * 后端地址通过 __BACKEND_BASE__ 注入，避免渲染进程硬编码。
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC, Action, TriggerPayload, AppSettings } from "./ipc";

// 后端地址默认值；主进程会在 SETTINGS_GET 里返回真实地址（可能因端口占用而变化）。
const BACKEND_BASE_DEFAULT = "http://localhost:8000";

/** 浮窗 / 悬浮按钮 用的 API */
const popupApi = {
  onTriggerAction(cb: (payload: TriggerPayload) => void): () => void {
    const handler = (_e: IpcRendererEvent, payload: TriggerPayload) => cb(payload);
    ipcRenderer.on(IPC.ACTION_RUN, handler);
    return () => ipcRenderer.removeListener(IPC.ACTION_RUN, handler);
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
  /** 同步拿后端地址（从主进程 settings.backendBase） */
  getBackendBase(): string {
    // ipcRenderer.sendSync 同步获取；若失败回退默认值
    try {
      const base = ipcRenderer.sendSync("backend:get-base");
      if (typeof base === "string" && base) return base;
    } catch {
      /* ignore */
    }
    return BACKEND_BASE_DEFAULT;
  },
};

contextBridge.exposeInMainWorld("doubaoAPI", popupApi);
contextBridge.exposeInMainWorld("__BACKEND_BASE__", BACKEND_BASE_DEFAULT);
