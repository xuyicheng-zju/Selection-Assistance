/**
 * Markdown 渲染：marked 解析 + KaTeX 数学公式 + DOMPurify 消毒。
 *
 * 支持：
 * - 行内公式 $...$   （如 $E=mc^2$）
 * - 块级公式 $$...$$ （居中显示）
 * - 标准 Markdown（代码块、列表、加粗等）
 *
 * 流式场景下可重复调用（每次追加新内容重新渲染整段）。
 */
import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";

// 用实例而非全局，避免多次 setOptions 互相污染
const marked = new Marked({ gfm: true, breaks: true });

// KaTeX 扩展：处理 $...$ 和 $...$，输出纯 HTML+CSS（不用 MathML/SVG，规避 DOMPurify 消毒麻烦）
marked.use(
  markedKatex({
    throwOnError: false, // 公式语法错误时不抛异常，原样显示
    output: "html", // 纯 HTML（span + class），DOMPurify 友好
  })
);

export function renderMarkdown(md: string): string {
  if (!md) return "";
  let raw: string;
  try {
    raw = marked.parse(md, { async: false }) as string;
  } catch {
    // 解析失败时转义后原样返回，避免白屏
    raw = `<p>${escapeHtml(md)}</p>`;
  }
  // DOMPurify：放行 style（KaTeX 内联定位）+ class，其余用默认白名单即可
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target", "style"],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
