/**
 * 跨应用取词：剪贴板优先（最可靠），辅以鼠标选区。
 *
 * 说明：Electron 无法直接读取其他应用内的选区文本。最稳妥的兼容方案是：
 * 用户在任意应用选中文字（很多应用选中即自动复制，如终端；或用户手动 Ctrl+C），
 * 然后按全局热键 → 本函数读剪贴板。
 *
 * 鼠标选区上报（REPORT_SELECTION）仅在主窗口可见的网页内有效，
 * 真正跨应用靠热键 + 剪贴板。
 */
import { clipboard, screen } from "electron";

export interface SelectionResult {
  text: string;
  x: number;
  y: number;
  source: "clipboard" | "selection" | "empty";
}

/** 全局热键触发：读剪贴板 + 鼠标坐标 */
export function getSelectionFromHotkey(): SelectionResult {
  const text = clipboard.readText().trim();
  const cursor = screen.getCursorScreenPoint();
  if (text) {
    return { text, x: cursor.x, y: cursor.y, source: "clipboard" };
  }
  return { text: "", x: cursor.x, y: cursor.y, source: "empty" };
}

/** 选区上报路径（来自主窗口网页 mouseup） */
export function fromSelectionReport(text: string, x: number, y: number): SelectionResult {
  const t = text.trim();
  return {
    text: t,
    x,
    y,
    source: t ? "selection" : "empty",
  };
}
