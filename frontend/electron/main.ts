/**
 * Electron 主进程入口。
 *
 * 职责：
 * 1. 启动内嵌后端（backend.ts）。
 * 2. 创建主窗口（设置/托盘）。
 * 3. 注册全局热键 Ctrl+Shift+D → 取词 → 弹浮窗执行翻译/解释。
 * 4. 处理悬浮按钮点击 → 弹浮窗执行。
 * 5. 退出时清理后端进程。
 */
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  clipboard,
  screen,
} from "electron";
import path from "node:path";
import { execFile } from "node:child_process";
import { macSelectionAccess, readMacSelection, watchMacSelection } from "./macos";
import { BackendProcess } from "./backend";
import {
  COMPACT_POPUP_SIZE,
  createMainWindow,
  createActionButtonWindow,
  createPopupWindow,
  positionAtPoint,
} from "./windows";
import { fromSelectionReport } from "./selection";
import { IPC, Action, TriggerPayload, AppSettings } from "./ipc";
import {
  DEFAULT_SETTINGS,
  getTrayIcon,
  loadSettings,
  saveSettings,
  setLaunchAtLogin,
} from "./desktop";

const DEV = process.env.NODE_ENV === "development";
void DEV;

let backend = new BackendProcess();
let mainWindow: BrowserWindow | null = null;
let actionButtonWindow: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let popupReady = false;
let popupPinned = false;
let popupExpanded = false;
let compactSize: readonly [number, number] = COMPACT_POPUP_SIZE;
let expandedSize: readonly [number, number] = [460, 530];
let queuedPopup: { payload: TriggerPayload; x: number; y: number } | undefined;
let takingSelection = false;
let isQuitting = false;
let shutdownStarted = false;

const settings: AppSettings = { ...DEFAULT_SETTINGS };

// 当前待处理的选区文本（悬浮按钮 / 浮窗复用）
let pendingText = "";
let stopSelectionWatcher: (() => void) | undefined;

async function bootstrap() {
  Object.assign(settings, loadSettings());
  if (process.argv.includes("--enable-autostart")) {
    try {
      settings.launchAtLogin = setLaunchAtLogin(true);
      saveSettings(settings);
    } catch (error) {
      console.error("[autostart]", error);
    }
  }

  try {
    settings.backendBase = await backend.start();
    console.log(`[main] backend ready at ${settings.backendBase}`);
  } catch (err) {
    console.error("[main] backend start failed:", err);
    // 仍允许启动，用户可在设置里改地址或手动起后端
  }

  const startHidden =
    process.argv.includes("--hidden") ||
    process.env.SELECTION_ASSISTANT_START_HIDDEN === "1";
  console.log(`[main] startup mode: ${startHidden ? "background" : "foreground"}`);
  registerIpc();
  if (startHidden && process.platform === "darwin") app.dock.hide();
  mainWindow = createMainWindow(!startHidden);
  keepMainWindowInBackground(mainWindow);
  createTray();

  actionButtonWindow = createActionButtonWindow();
  popupWindow = createPopupWindow();
  popupWindow.webContents.on("did-start-loading", () => { popupReady = false; });
  popupWindow.on("blur", () => {
    if (!popupPinned) popupWindow?.hide();
  });

  registerHotkey();
  syncSelectionWatcher();
  // 某些 Linux 窗口管理器不会为 show:false 的窗口可靠触发 ready-to-show。
  // 所有初始化完成后再显式映射一次，开机静默模式除外。
  if (!startHidden) showMainWindow();
}

function keepMainWindowInBackground(win: BrowserWindow) {
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
    console.log("[main] main window hidden; app continues in tray");
  });
}

function showMainWindow() {
  if (process.platform === "darwin") void app.dock.show();
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow(true);
    keepMainWindowInBackground(mainWindow);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(getTrayIcon());
  const menu = Menu.buildFromTemplate([
    { label: "打开主窗口", click: showMainWindow },
    { label: "翻译剪贴板", click: () => runClipboardAction("translate") },
    { label: "解释剪贴板", click: () => runClipboardAction("explain") },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("划词助手");
  tray.on("click", showMainWindow);
}

function runClipboardAction(action: Action) {
  const text = clipboard.readText().trim();
  const { x, y } = screen.getCursorScreenPoint();
  showPopup({ action, text, selectionIssue: text ? undefined : "selection" }, x, y);
}

/**
 * 用 xdotool 模拟 Ctrl+C，并只返回这次复制真正取得的文本。
 * 先放入哨兵值可区分“没有选区”和“剪贴板里残留着上次文本”。
 */
function readSelectionViaXdotool(): Promise<string> {
  return new Promise((resolve) => {
    const previousClipboard = clipboard.readText();
    const sentinel = `__selection_assistant_${Date.now()}_${Math.random()}__`;
    clipboard.writeText(sentinel);
    execFile("xdotool", ["key", "ctrl+c"], (err) => {
      if (err) {
        console.log("[hotkey] xdotool 不可用（建议 sudo apt install xdotool 以支持自动复制）");
        clipboard.writeText(previousClipboard);
        resolve("");
      } else {
        // 等目标应用把选区写入剪贴板。
        setTimeout(() => {
          const copied = clipboard.readText();
          if (copied === sentinel || !copied.trim()) {
            clipboard.writeText(previousClipboard);
            resolve("");
            return;
          }
          resolve(copied.trim());
        }, 120);
      }
    });
  });
}

async function handleHotkey(action: Action) {
  if (takingSelection) return;
  takingSelection = true;
  const { x, y } = screen.getCursorScreenPoint();
  let text = "";
  let selectionIssue: TriggerPayload["selectionIssue"] = "selection";
  try {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && (focused === mainWindow || focused === popupWindow)) {
      text = await focused.webContents.executeJavaScript(`(() => {
        const field = document.activeElement;
        if (field instanceof HTMLTextAreaElement ||
            (field instanceof HTMLInputElement && field.type === "text")) {
          return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0).trim();
        }
        return window.getSelection()?.toString().trim() ?? "";
      })()`);
    } else if (process.platform === "darwin") {
      text = await readMacSelection();
    } else if (process.platform === "linux") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      text = await readSelectionViaXdotool();
    }
  } catch (error) {
    if ((error as { code?: number }).code === 2) selectionIssue = "authorization";
    else console.error("[hotkey] failed to read selection", error);
  } finally {
    takingSelection = false;
  }
  showPopup({ action, text, selectionIssue: text ? undefined : selectionIssue }, x, y);
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const okT = globalShortcut.register(settings.hotkeyTranslate, () => handleHotkey("translate"));
  const okE = globalShortcut.register(settings.hotkeyExplain, () => handleHotkey("explain"));
  if (!okT) console.error("[main] failed to register translate hotkey", settings.hotkeyTranslate);
  if (!okE) console.error("[main] failed to register explain hotkey", settings.hotkeyExplain);
  if (okT && okE) {
    console.log(
      `[main] hotkeys registered: translate=${settings.hotkeyTranslate}, explain=${settings.hotkeyExplain}`
    );
  }
}

function showActionButtonAt(x: number, y: number) {
  if (!actionButtonWindow) return;
  const wc = actionButtonWindow.webContents;
  const place = () => {
    positionAtPoint(actionButtonWindow!, x, y);
    actionButtonWindow!.showInactive();
  };
  if (wc.isLoading()) {
    wc.once("dom-ready", place);
  } else {
    place();
  }
}

function syncSelectionWatcher() {
  if (process.platform !== "darwin") return;
  if (!settings.enableActionButton) {
    stopSelectionWatcher?.();
    stopSelectionWatcher = undefined;
    hideActionButton();
    return;
  }
  if (stopSelectionWatcher) return;

  const stop = watchMacSelection(({ kind, x, y, text }) => {
    if (!settings.enableActionButton || stopSelectionWatcher !== stop) return;
    if (kind === "selection" && text) {
      reportSelection(text, x, y);
      return;
    }
    if (actionButtonWindow?.isVisible()) {
      const bounds = actionButtonWindow.getBounds();
      if (x >= bounds.x && x < bounds.x + bounds.width &&
          y >= bounds.y && y < bounds.y + bounds.height) return;
    }
    hideActionButton();
  }, () => {
    if (stopSelectionWatcher === stop) stopSelectionWatcher = undefined;
  });
  stopSelectionWatcher = stop;
}

function reportSelection(text: string, x: number, y: number) {
  if (!settings.enableActionButton) return;
  const selection = fromSelectionReport(text, x, y);
  if (!selection.text) {
    hideActionButton();
    return;
  }
  pendingText = selection.text;
  showActionButtonAt(selection.x, selection.y);
}

function hideActionButton() {
  pendingText = "";
  actionButtonWindow?.hide();
}

function resizePopup(expanded: boolean) {
  if (!popupWindow || expanded === popupExpanded) return;
  const [width, height] = popupWindow.getSize();
  if (popupExpanded) expandedSize = [width, height];
  else compactSize = [width, height];
  popupExpanded = expanded;
  const [nextWidth, nextHeight] = expanded ? expandedSize : compactSize;
  const bounds = popupWindow.getBounds();
  popupWindow.setSize(nextWidth, nextHeight);
  positionAtPoint(popupWindow, bounds.x, bounds.y, 0);
}

function showPopup(payload: TriggerPayload, x: number, y: number) {
  hideActionButton();
  queuedPopup = { payload, x, y };
  deliverPopup();
}

function deliverPopup() {
  if (!popupWindow || !popupReady || !queuedPopup) return;
  const { payload, x, y } = queuedPopup;
  queuedPopup = undefined;
  resizePopup(false);
  if (!popupPinned || !popupWindow.isVisible()) positionAtPoint(popupWindow, x, y);
  popupWindow.webContents.send(IPC.ACTION_RUN, payload);
  popupWindow.show();
  popupWindow.focus();
}

function registerIpc() {
  // 主窗口 mouseup → 选区上报 → 显示悬浮按钮
  // 同步返回真实后端地址（preload 用）
  ipcMain.on("backend:get-base", (e) => {
    e.returnValue = {
      base: settings.backendBase,
      token: backend.token,
      modelBackend: settings.modelBackend,
      model: settings.codexModel,
      effort: settings.codexEffort,
    };
  });

  ipcMain.on(IPC.REPORT_SELECTION, (event, report: { text: string; x: number; y: number }) => {
    if (event.sender === mainWindow?.webContents) reportSelection(report.text, report.x, report.y);
  });

  // 悬浮按钮点击 → 弹浮窗执行
  ipcMain.on(IPC.ACTION_TRIGGER, (event, action: Action) => {
    if (event.sender !== actionButtonWindow?.webContents || !pendingText) return;
    if (action !== "translate" && action !== "explain" && action !== "chat") return;
    // 按钮窗口坐标即光标附近，用按钮窗口当前位置
    const [bx, by] = actionButtonWindow?.getPosition() ?? [0, 0];
    showPopup({ action, text: pendingText }, bx, by + 40);
  });

  ipcMain.on(IPC.POPUP_READY, (event) => {
    if (event.sender !== popupWindow?.webContents) return;
    popupReady = true;
    deliverPopup();
  });
  ipcMain.on(IPC.POPUP_EXPAND, (event, expanded: boolean) => {
    if (event.sender === popupWindow?.webContents) resizePopup(expanded === true);
  });
  ipcMain.on(IPC.POPUP_PIN, (event, pinned: boolean) => {
    if (event.sender === popupWindow?.webContents) popupPinned = pinned === true;
  });
  ipcMain.on(IPC.POPUP_CLOSE, (event) => {
    if (event.sender === popupWindow?.webContents) popupWindow?.hide();
  });
  ipcMain.on(IPC.QUIT_APP, () => app.quit());
  ipcMain.handle(IPC.CLIPBOARD_READ_TEXT, () => clipboard.readText());
  ipcMain.handle(IPC.ACCESSIBILITY, (_event, prompt: boolean) => (
    process.platform === "darwin" ? macSelectionAccess(prompt === true) : null
  ));
  ipcMain.handle(IPC.CLIPBOARD_READ_IMAGE, () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    return {
      dataUrl: image.toDataURL(),
      mimeType: "image/png" as const,
      width,
      height,
    };
  });

  ipcMain.handle(IPC.SETTINGS_GET, () => ({ ...settings }));
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch, backendBase: settings.backendBase };
    if (next.modelBackend !== "dashscope" && next.modelBackend !== "codex") {
      throw new Error("请选择阿里云百炼或 Codex。");
    }
    // 兼容：旧字段 hotkey 改动时同步到 hotkeyTranslate
    if (patch.hotkey && !patch.hotkeyTranslate) {
      next.hotkeyTranslate = patch.hotkey;
    }
    next.hotkey = next.hotkeyTranslate;
    if (typeof patch.launchAtLogin === "boolean") {
      try {
        next.launchAtLogin = setLaunchAtLogin(patch.launchAtLogin);
      } catch (err) {
        console.error("[autostart] failed to update:", err);
        throw new Error("无法更新开机自启，请检查系统的登录项设置。");
      }
    }
    const hotkeysChanged = next.hotkeyTranslate !== settings.hotkeyTranslate || next.hotkeyExplain !== settings.hotkeyExplain;
    const actionButtonChanged = next.enableActionButton !== settings.enableActionButton;
    saveSettings(next);
    Object.assign(settings, next);
    if (hotkeysChanged) registerHotkey();
    if (actionButtonChanged) syncSelectionWatcher();
    return { ...settings };
  });
}

// ---- 生命周期 ----
// 稳定的 Linux WM_CLASS，确保应用菜单、Dock 与桌面图标正确归组。
app.setName("selection-assistance");
if (process.platform === "darwin") {
  app.setPath("userData", path.join(app.getPath("appData"), "selection-assistance"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // 开机启动撞上已有实例时保持静默；用户主动再次打开时唤起主窗口。
    if (commandLine.includes("--enable-autostart")) {
      try {
        settings.launchAtLogin = setLaunchAtLogin(true);
        saveSettings(settings);
      } catch (error) {
        console.error("[autostart]", error);
      }
    }
    if (mainWindow && !commandLine.includes("--hidden")) showMainWindow();
  });
  app.whenReady().then(bootstrap);
  app.on("activate", () => {
    if (mainWindow && !popupWindow?.isVisible()) showMainWindow();
  });
}

process.on("SIGTERM", () => app.quit());

app.on("window-all-closed", () => {
  // 主窗口关掉也保持后台（托盘），不退出
});

app.on("before-quit", (e) => {
  if (shutdownStarted) return;
  e.preventDefault();
  shutdownStarted = true;
  isQuitting = true;
  stopSelectionWatcher?.();
  stopSelectionWatcher = undefined;
  globalShortcut.unregisterAll();
  backend.stop().finally(() => app.exit(0));
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
