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
import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, clipboard, screen } from "electron";
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

const DEV = process.env.NODE_ENV === "development";
void DEV;

let backend = new BackendProcess();
let mainWindow: BrowserWindow | null = null;
let actionButtonWindow: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const settings: AppSettings = {
  backendBase: "http://localhost:8000",
  hotkey: "CommandOrControl+Shift+D",
  hotkeyTranslate: "CommandOrControl+Shift+D",
  hotkeyExplain: "CommandOrControl+Shift+E",
  showThinking: false,
  enableActionButton: true,
};

// 当前待处理的选区文本（悬浮按钮 / 浮窗复用）
let pendingText = "";
let pendingContext: string | undefined;

async function bootstrap() {
  try {
    settings.backendBase = await backend.start();
    console.log(`[main] backend ready at ${settings.backendBase}`);
  } catch (err) {
    console.error("[main] backend start failed:", err);
    // 仍允许启动，用户可在设置里改地址或手动起后端
  }

  mainWindow = createMainWindow();
  createTray();

  actionButtonWindow = createActionButtonWindow();
  popupWindow = createPopupWindow();

  registerIpc();
  registerHotkey();
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: "打开主窗口", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("划词助手");
  tray.on("click", () => mainWindow?.show());
}

/** 用 xdotool 模拟 Ctrl+C 复制当前选区（Linux）。无 xdotool 则 resolve(false)。 */
function copySelectionViaXdotool(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("xdotool", ["key", "ctrl+c"], (err) => {
      if (err) {
        console.log("[hotkey] xdotool 不可用（建议 sudo apt install xdotool 以支持自动复制）");
        resolve(false);
      } else {
        // 等剪贴板更新
        setTimeout(() => resolve(true), 120);
      }
    });
  });
}

/** 热键通用处理：等修饰键释放 → 自动复制选区 → 直接弹大浮窗执行默认动作 */
async function handleHotkey(defaultAction: Action) {
  console.log(`[hotkey] triggered, default=${defaultAction}`);
  // 等修饰键释放，否则 xdotool 发的 Ctrl+C 会冲突
  await new Promise((r) => setTimeout(r, 150));
  await copySelectionViaXdotool();
  const text = clipboard.readText().trim();
  if (!text) {
    console.log("[hotkey] 未取到选区文本（剪贴板为空）。");
    if (popupWindow) {
      pendingText = "";
      const doIt = () => {
        popupWindow!.show();
        popupWindow!.focus();
        popupWindow!.webContents.send(IPC.ACTION_RUN, {
          action: defaultAction,
          text: "（未取到选区文本。请确认选中了文字；若仍失败，检查 xdotool 是否安装：sudo apt install xdotool）",
          context: undefined,
        });
      };
      if (popupWindow.webContents.isLoading()) {
        popupWindow.webContents.once("dom-ready", doIt);
      } else {
        doIt();
      }
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

  ipcMain.handle(IPC.SETTINGS_GET, () => ({ ...settings }));
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const oldT = settings.hotkeyTranslate;
    const oldE = settings.hotkeyExplain;
    Object.assign(settings, patch);
    // 兼容：旧字段 hotkey 改动时同步到 hotkeyTranslate
    if (patch.hotkey && !patch.hotkeyTranslate) {
      settings.hotkeyTranslate = patch.hotkey;
    }
    // 任一热键变化 → 重新注册
    if (settings.hotkeyTranslate !== oldT || settings.hotkeyExplain !== oldE) {
      registerHotkey();
    }
    return { ...settings };
  });
}

// ---- 生命周期 ----
app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  // 主窗口关掉也保持后台（托盘），不退出
});

app.on("before-quit", (e) => {
  e.preventDefault();
  globalShortcut.unregisterAll();
  backend.stop().finally(() => app.exit(0));
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
