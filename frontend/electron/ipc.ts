/**
 * IPC 通道名常量 + 共享类型。
 * 主进程与渲染进程通过这些通道通信。
 */

export type Action = "translate" | "explain" | "chat";
export type ModelBackend = "dashscope" | "codex";

export interface ClipboardImage {
  dataUrl: string;
  mimeType: "image/png";
  width: number;
  height: number;
}

/** 悬浮按钮触发时携带的数据（主进程 → 渲染进程） */
export interface TriggerPayload {
  action: Action;
  text: string;
  selectionIssue?: "authorization" | "selection";
}

/** 选区上报（渲染进程 → 主进程） */
export interface SelectionReport {
  text: string;
  x: number; // 屏幕坐标
  y: number;
}

export const IPC = {
  // 渲染进程 → 主进程
  REPORT_SELECTION: "selection:report", // 选区上报，触发显示悬浮按钮
  ACTION_TRIGGER: "action:trigger", // 悬浮按钮点击 → 打开浮窗并执行
  POPUP_CLOSE: "popup:close",
  POPUP_READY: "popup:ready",
  POPUP_EXPAND: "popup:expand",
  POPUP_PIN: "popup:pin",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  CLIPBOARD_READ_TEXT: "clipboard:read-text",
  ACCESSIBILITY: "app:accessibility",
  CLIPBOARD_READ_IMAGE: "clipboard:read-image",
  QUIT_APP: "app:quit",

  // 主进程 → 渲染进程
  ACTION_RUN: "action:run", // 通知浮窗执行某个动作（带 TriggerPayload）
} as const;

export interface AppSettings {
  backendBase: string; // http://localhost:8000
  modelBackend: ModelBackend;
  hotkey: string; // 兼容旧字段（= hotkeyTranslate）
  hotkeyTranslate: string; // 默认翻译热键，如 CommandOrControl+Shift+D
  hotkeyExplain: string; // 默认解释热键，如 CommandOrControl+Shift+E
  showThinking: boolean; // 是否开启 DeepSeek 思考模式（控制是否请求 reasoning）
  enableActionButton: boolean; // 鼠标选中是否弹悬浮按钮
  codexModel?: string;
  codexEffort?: string;
  launchAtLogin: boolean; // 登录桌面后静默启动并驻留托盘
}
