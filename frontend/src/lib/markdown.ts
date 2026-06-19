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

// KaTeX 扩展：处理 $...$ 和 $$...$$，输出 HTML+CSS（不用 MathML/SVG，规避消毒麻烦）
marked.use(
  markedKatex({
    throwOnError: false, // 公式语法错误时不抛异常，原样显示
    output: "htmlAndMathml", // KaTeX 推荐：HTML 为主 + MathML 给无障碍
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
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: [
      // KaTeX 输出用到的标签
      "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub",
      "mfrac", "msqrt", "mroot", "mtable", "mtr", "mtd", "mtext",
      "annotation", "mover", "munder", "munderover", "mspace", "mstyle",
    ],
    ADD_ATTR: [
      // KaTeX/SVG/MathML 需要的属性（在默认白名单基础上追加）
      "style", "xmlns", "viewbox", "width", "height", "d", "fill",
      "stroke", "stroke-width", "x", "y", "x1", "y1", "x2", "y2",
      "cx", "cy", "r", "rx", "ry", "transform", "id", "xlink",
      "encoding", "mathvariant", "stretchy", "fence", "separator",
      "accent", "lspace", "rspace", "movablelimits", "minsize", "maxsize",
      "columnalign", "rowalign", "columnspacing", "rowspacing",
      "columnlines", "rowlines", "frame", "framespacing", "equalrows",
      "equalcolumns", "side", "depth", "lquote", "rquote", "bevelled",
      "linethickness", "notation", "align", "dir", "displaystyle",
      "scriptlevel", "href",
    ],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
