/**
 * 窗口工厂：主窗口、悬浮按钮窗、划词浮窗。
 *
 * 悬浮按钮窗 / 浮窗：frameless、alwaysOnTop、skipTaskbar，贴鼠标位置。
 * 主窗口：常规窗口，关闭时隐藏到托盘。
 */
import { BrowserWindow, nativeTheme, screen, shell } from "electron";
import path from "node:path";
import { resolveAppIconPath } from "./desktop";

const DEV = process.env.NODE_ENV === "development";

/** 修正入口加载（DEV→URL，生产→文件） */
function load(win: BrowserWindow, file: string): Promise<void> {
  const openExternal = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      openExternal(url);
    }
  });
  if (DEV) {
    return win.loadURL(`http://localhost:5173/${file}`);
  }
  return win.loadFile(path.join(__dirname, "..", "dist", file));
}

export function createMainWindow(showOnReady = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 880,
    height: 740,
    minWidth: 760,
    minHeight: 600,
    title: "划词助手",
    icon: resolveAppIconPath(),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#12141a" : "#f4f6fa",
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: 18 },
    } as const : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: DEV,
    },
  });

  if (DEV) win.webContents.openDevTools({ mode: "detach" });
  void load(win, "index.html")
    .then(() => {
      if (showOnReady && !win.isDestroyed()) {
        win.show();
        console.log("[window] main window loaded and shown");
      }
    })
    .catch((err) => console.error("[window] failed to load main window:", err));
  return win;
}

/** 悬浮按钮窗：两个小按钮，贴鼠标右下方 */
export function createActionButtonWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 218,
    height: 42,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: resolveAppIconPath(),
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  void load(win, "actionButton.html").catch((err) =>
    console.error("[window] failed to load action button:", err)
  );
  return win;
}

/** 划词浮窗：展示翻译/解释结果 */
export const COMPACT_POPUP_SIZE = [360, 420] as const;

export function createPopupWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: COMPACT_POPUP_SIZE[0],
    height: COMPACT_POPUP_SIZE[1],
    minWidth: 320,
    minHeight: 220,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: resolveAppIconPath(),
    transparent: false,
    hasShadow: true,
    backgroundColor: isMac ? "#00000000" : (nativeTheme.shouldUseDarkColors ? "#242221" : "#ffffff"),
    roundedCorners: true,
    ...(isMac ? { vibrancy: "popover", visualEffectState: "active" } as const : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: DEV,
    },
  });
  void load(win, "popup.html").catch((err) =>
    console.error("[window] failed to load popup:", err)
  );
  return win;
}

/** 把窗口定位到鼠标右下方，溢出屏幕则翻转到左/上 */
export function positionAtMouse(
  win: BrowserWindow,
  margin = 8
): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea;
  const [w, h] = win.getSize();

  let x = cursor.x + margin;
  let y = cursor.y + margin;
  if (x + w > wa.x + wa.width) x = cursor.x - w - margin;
  if (y + h > wa.y + wa.height) y = wa.y + wa.height - h;
  if (x < wa.x) x = wa.x;
  if (y < wa.y) y = wa.y;

  win.setPosition(Math.round(x), Math.round(y), false);
}

/** 定位到精确坐标（悬浮按钮紧贴选区） */
export function positionAtPoint(
  win: BrowserWindow,
  px: number,
  py: number,
  margin = 6
): void {
  const display = screen.getDisplayNearestPoint({ x: px, y: py });
  const wa = display.workArea;
  const [w, h] = win.getSize();
  let x = px + margin;
  let y = py + margin;
  if (x + w > wa.x + wa.width) x = px - w - margin;
  if (y + h > wa.y + wa.height) y = py - h - margin;
  if (x < wa.x) x = wa.x;
  if (y < wa.y) y = wa.y;
  win.setPosition(Math.round(x), Math.round(y), false);
}
