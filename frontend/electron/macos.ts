import { app, shell, systemPreferences } from "electron";
import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const LABEL = "com.xuyicheng.selection-assistance";
const serviceDomain = () => `gui/${process.getuid!()}`;
const service = () => `${serviceDomain()}/${LABEL}`;
const plist = () => path.join(app.getPath("home"), "Library", "LaunchAgents", `${LABEL}.plist`);

function launchctl(args: string[]) {
  execFileSync("/bin/launchctl", args, { stdio: "pipe" });
}

export function isMacLaunchAtLoginEnabled(): boolean {
  if (!existsSync(plist())) return false;
  try {
    launchctl(["print", service()]);
    return true;
  } catch {
    return false;
  }
}

export function setMacLaunchAtLogin(enabled: boolean): boolean {
  if (enabled === isMacLaunchAtLoginEnabled() && (enabled || !existsSync(plist()))) return enabled;
  if (!enabled) {
    if (isMacLaunchAtLoginEnabled()) launchctl(["bootout", service()]);
    if (existsSync(plist())) unlinkSync(plist());
    return false;
  }

  const bundlePath = path.resolve(process.execPath, "../../..");
  const args = app.isPackaged
    ? ["/usr/bin/open", "-g", "-a", bundlePath, "--args", "--hidden"]
    : ["/usr/bin/open", "-g", "-a", bundlePath, "--args", app.getAppPath(), "--hidden"];
  const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  mkdirSync(path.dirname(plist()), { recursive: true });
  writeFileSync(plist(), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>${args.map((arg) => `<string>${escapeXml(arg)}</string>`).join("")}</array>
<key>RunAtLoad</key><true/>
</dict></plist>
`, { mode: 0o644 });

  try {
    launchctl(["enable", service()]);
    launchctl(["bootstrap", serviceDomain(), plist()]);
  } catch (error) {
    unlinkSync(plist());
    throw error;
  }
  return isMacLaunchAtLoginEnabled();
}

export function macSelectionAccess(openSettings: boolean): boolean {
  const allowed = systemPreferences.isTrustedAccessibilityClient(false);
  if (!allowed && openSettings) {
    void shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  }
  return allowed;
}

const selectionHelper = () => app.isPackaged
  ? path.join(process.resourcesPath, "read-selection")
  : path.join(app.getAppPath(), "build", "read-selection");

export function readMacSelection(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(selectionHelper(), { timeout: 2600, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}


type SelectionGesture = { kind: "dismiss" | "selection"; x: number; y: number; text?: string };

export function watchMacSelection(onGesture: (gesture: SelectionGesture) => void, onExit: () => void) {
  const child = spawn(selectionHelper(), ["--watch", String(process.pid)], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let gesture: SelectionGesture;
    try {
      gesture = JSON.parse(line);
    } catch {
      return;
    }
    if (!gesture || !Number.isFinite(gesture.x) || !Number.isFinite(gesture.y)) return;
    if (gesture.kind === "dismiss" || (gesture.kind === "selection" && typeof gesture.text === "string")) {
      onGesture(gesture);
    }
  });
  child.on("error", (error) => console.error("[selection] macOS watcher:", error.message));
  child.once("close", onExit);
  return () => {
    lines.close();
    child.kill();
  };
}
