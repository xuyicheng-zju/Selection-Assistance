/**
 * Linux 桌面集成与设置持久化。
 *
 * - 设置写入 Electron userData，避免每次启动丢失。
 * - 开机启动遵循 XDG Autostart 规范。
 * - 开机启动一律携带 --hidden，只创建托盘和热键，不打扰用户。
 */
import { app, nativeImage } from "electron";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AppSettings } from "./ipc";

const AUTOSTART_FILE = "selection-assistance.desktop";
const SETTINGS_FILE = "settings.json";
const MANAGED_MARKER = "X-Selection-Assistance-Managed=true";

export const DEFAULT_SETTINGS: AppSettings = {
  backendBase: "http://localhost:8000",
  hotkey: "CommandOrControl+Shift+D",
  hotkeyTranslate: "CommandOrControl+Shift+D",
  hotkeyExplain: "CommandOrControl+Shift+E",
  showThinking: false,
  enableActionButton: true,
  launchAtLogin: false,
};

function getAutostartPath(): string {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config");
  return path.join(configHome, "autostart", AUTOSTART_FILE);
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

/** 可被窗口、托盘和 .desktop 共用的品牌图标。 */
export function resolveAppIconPath(): string {
  const candidates = [
    path.join(app.getAppPath(), "assets", "icon.png"),
    path.join(process.resourcesPath, "icon.png"),
    path.join(process.resourcesPath, "app.asar.unpacked", "assets", "icon.png"),
  ];
  return candidates.find(existsSync) || candidates[0];
}

export function getTrayIcon() {
  const image = nativeImage.createFromPath(resolveAppIconPath());
  return image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 22, height: 22 });
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function quoteDesktopArg(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")}"`;
}

/**
 * 源码运行时创建一个稳定启动器；已安装/打包时优先复用正式入口。
 * 这样 XDG Autostart 不依赖当前 shell 的 PATH。
 */
function resolveLaunchCommand(): string {
  const installedLauncher = path.join(
    app.getPath("home"),
    ".local",
    "bin",
    "selection-assistance"
  );
  if (existsSync(installedLauncher)) return installedLauncher;

  if (process.env.APPIMAGE && existsSync(process.env.APPIMAGE)) {
    return process.env.APPIMAGE;
  }
  if (app.isPackaged) return process.execPath;

  const launcherPath = path.join(
    app.getPath("userData"),
    "selection-assistance-launcher.sh"
  );
  const appDir = app.getAppPath();
  const script = [
    "#!/bin/sh",
    "export NODE_ENV=production",
    `cd ${quoteShell(appDir)} || exit 1`,
    `exec ${quoteShell(process.execPath)} ${quoteShell(
      appDir
    )} --no-sandbox "$@"`,
    "",
  ].join("\n");
  mkdirSync(path.dirname(launcherPath), { recursive: true });
  writeFileSync(launcherPath, script, { encoding: "utf8", mode: 0o755 });
  chmodSync(launcherPath, 0o755);
  return launcherPath;
}

function renderAutostartEntry(): string {
  const launcher = resolveLaunchCommand();
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=划词助手",
    "Comment=开机后静默启动划词翻译与解释助手",
    `Exec=${quoteDesktopArg(launcher)} --hidden`,
    `Icon=${quoteDesktopArg(resolveAppIconPath())}`,
    "Terminal=false",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    "NoDisplay=true",
    MANAGED_MARKER,
    "",
  ].join("\n");
}

export function isLaunchAtLoginEnabled(): boolean {
  const autostartPath = getAutostartPath();
  if (!existsSync(autostartPath)) return false;
  try {
    return readFileSync(autostartPath, "utf8").includes(MANAGED_MARKER);
  } catch {
    return false;
  }
}

export function setLaunchAtLogin(enabled: boolean): boolean {
  const autostartPath = getAutostartPath();
  if (!enabled) {
    if (existsSync(autostartPath)) {
      const content = readFileSync(autostartPath, "utf8");
      if (content.includes(MANAGED_MARKER)) unlinkSync(autostartPath);
    }
    return false;
  }

  mkdirSync(path.dirname(autostartPath), { recursive: true });
  writeFileSync(autostartPath, renderAutostartEntry(), {
    encoding: "utf8",
    mode: 0o644,
  });
  return true;
}

export function loadSettings(): AppSettings {
  let saved: Partial<AppSettings> = {};
  const settingsPath = getSettingsPath();
  try {
    if (existsSync(settingsPath)) {
      saved = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<AppSettings>;
    }
  } catch (err) {
    console.warn("[settings] failed to load persisted settings:", err);
  }

  const merged = { ...DEFAULT_SETTINGS, ...saved };
  merged.backendBase = DEFAULT_SETTINGS.backendBase;
  merged.hotkey = merged.hotkeyTranslate;
  // 文件是否真实存在是开机启动状态的唯一事实来源。
  merged.launchAtLogin = isLaunchAtLoginEnabled();
  return merged;
}

export function saveSettings(settings: AppSettings): void {
  const settingsPath = getSettingsPath();
  const persisted = {
    hotkey: settings.hotkeyTranslate,
    hotkeyTranslate: settings.hotkeyTranslate,
    hotkeyExplain: settings.hotkeyExplain,
    showThinking: settings.showThinking,
    enableActionButton: settings.enableActionButton,
    launchAtLogin: settings.launchAtLogin,
  };
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(persisted, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(settingsPath, 0o600);
}
