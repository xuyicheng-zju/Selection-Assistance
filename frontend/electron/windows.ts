/**
 * 窗口工厂：主窗口、悬浮按钮窗、划词浮窗。
 *
 * 悬浮按钮窗 / 浮窗：frameless、alwaysOnTop、skipTaskbar，贴鼠标位置。
 * 主窗口：常规窗口，关闭时隐藏到托盘。
 */
import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";

const DEV = process.env.NODE_ENV === "development";

/** 修正入口加载（DEV→URL，生产→文件） */
function load(win: BrowserWindow, file: string) {
  if (DEV) {
    win.loadURL(`http://localhost:5173/${file}`);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", file));
  }
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 560,
    title: "划词助手",
    backgroundColor: "#f9fafb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: DEV,
    },
  });

  // 外链在系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV) win.webContents.openDevTools({ mode: "detach" });
  load(win, "index.html");
  return win;
}

/** 悬浮按钮窗：两个小按钮，贴鼠标右下方 */
export function createActionButtonWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 130,
    height: 40,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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
  load(win, "actionButton.html");
  return win;
}

/** 划词浮窗：展示翻译/解释结果 */
export function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 540,
    minWidth: 360,
    minHeight: 300,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: "#ffffff",
    roundedCorners: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: DEV,
    },
  });
  load(win, "popup.html");
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
