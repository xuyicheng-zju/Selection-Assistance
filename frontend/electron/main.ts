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
import { execFile } from "node:child_process";
import { BackendProcess } from "./backend";
import {
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
let hasPopupSession = false;
let isQuitting = false;
let shutdownStarted = false;

const settings: AppSettings = { ...DEFAULT_SETTINGS };

// 当前待处理的选区文本（悬浮按钮 / 浮窗复用）
let pendingText = "";
let pendingContext: string | undefined;

async function bootstrap() {
  Object.assign(settings, loadSettings());

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
  mainWindow = createMainWindow(!startHidden);
  keepMainWindowInBackground(mainWindow);
  createTray();

  actionButtonWindow = createActionButtonWindow();
  popupWindow = createPopupWindow();

  registerIpc();
  registerHotkey();
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
    { label: "后台运行中", enabled: false },
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

/** 热键通用处理：等修饰键释放 → 自动复制选区 → 直接弹大浮窗执行默认动作 */
async function handleHotkey(defaultAction: Action) {
  console.log(`[hotkey] triggered, default=${defaultAction}`);
  // 等修饰键释放，否则 xdotool 发的 Ctrl+C 会冲突
  await new Promise((r) => setTimeout(r, 150));
  const text = await readSelectionViaXdotool();
  if (!text) {
    console.log("[hotkey] 未取到新选区，仅唤回已有会话，不发起请求。");
    pendingText = "";
    hideActionButton();
    if (popupWindow && hasPopupSession) {
      const cursor = screen.getCursorScreenPoint();
      positionAtPoint(popupWindow, cursor.x, cursor.y);
      popupWindow.show();
      popupWindow.focus();
    }
    return;
  }
  pendingText = text;
  const cursor = screen.getCursorScreenPoint();
  // 直接弹大浮窗，执行默认动作（翻译或解释）
  runAction(defaultAction, cursor.x, cursor.y);
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  let okT = globalShortcut.register(settings.hotkeyTranslate, () => handleHotkey("translate"));
  let okE = globalShortcut.register(settings.hotkeyExplain, () => handleHotkey("explain"));
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

function hideActionButton() {
  actionButtonWindow?.hide();
}

/** 打开浮窗并执行指定动作 */
function runAction(action: Action, x: number, y: number, text?: string) {
  if (text) pendingText = text;
  if (!pendingText.trim()) return;
  if (!popupWindow) return;
  hideActionButton();

  const doIt = () => {
    positionAtPoint(popupWindow!, x, y);
    popupWindow!.show();
    popupWindow!.focus();
    const payload: TriggerPayload = {
      action,
      text: pendingText,
      context: pendingContext,
    };
    popupWindow!.webContents.send(IPC.ACTION_RUN, payload);
    hasPopupSession = true;
  };

  if (popupWindow.webContents.isLoading()) {
    popupWindow.webContents.once("dom-ready", doIt);
  } else {
    doIt();
  }
}

function registerIpc() {
  // 主窗口 mouseup → 选区上报 → 显示悬浮按钮
  // 同步返回真实后端地址（preload 用）
  ipcMain.on("backend:get-base", (e) => {
    e.returnValue = settings.backendBase;
  });

  ipcMain.on(IPC.REPORT_SELECTION, (_e, report: { text: string; x: number; y: number }) => {
    if (!settings.enableActionButton) return;
    const sel = fromSelectionReport(report.text, report.x, report.y);
    if (!sel.text) {
      hideActionButton();
      return;
    }
    pendingText = sel.text;
    showActionButtonAt(sel.x, sel.y);
  });

  // 悬浮按钮点击 → 弹浮窗执行
  ipcMain.on(IPC.ACTION_TRIGGER, (_e, action: Action) => {
    if (!pendingText) return;
    // 按钮窗口坐标即光标附近，用按钮窗口当前位置
    const [bx, by] = actionButtonWindow?.getPosition() ?? [0, 0];
    runAction(action, bx, by + 40);
  });

  ipcMain.on(IPC.POPUP_CLOSE, () => popupWindow?.hide());
  ipcMain.on(IPC.QUIT_APP, () => app.quit());
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
    const oldT = settings.hotkeyTranslate;
    const oldE = settings.hotkeyExplain;
    Object.assign(settings, patch);
    // 兼容：旧字段 hotkey 改动时同步到 hotkeyTranslate
    if (patch.hotkey && !patch.hotkeyTranslate) {
      settings.hotkeyTranslate = patch.hotkey;
    }
    settings.hotkey = settings.hotkeyTranslate;
    if (typeof patch.launchAtLogin === "boolean") {
      try {
        settings.launchAtLogin = setLaunchAtLogin(patch.launchAtLogin);
      } catch (err) {
        console.error("[autostart] failed to update:", err);
        settings.launchAtLogin = false;
      }
    }
    // 任一热键变化 → 重新注册
    if (settings.hotkeyTranslate !== oldT || settings.hotkeyExplain !== oldE) {
      registerHotkey();
    }
    saveSettings(settings);
    return { ...settings };
  });
}

// ---- 生命周期 ----
// 稳定的 Linux WM_CLASS，确保应用菜单、Dock 与桌面图标正确归组。
app.setName("selection-assistance");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // 开机启动撞上已有实例时保持静默；用户主动再次打开时唤起主窗口。
    if (!commandLine.includes("--hidden")) showMainWindow();
  });
  app.whenReady().then(bootstrap);
}

app.on("window-all-closed", () => {
  // 主窗口关掉也保持后台（托盘），不退出
});

app.on("before-quit", (e) => {
  if (shutdownStarted) return;
  e.preventDefault();
  shutdownStarted = true;
  isQuitting = true;
  globalShortcut.unregisterAll();
  backend.stop().finally(() => app.exit(0));
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
