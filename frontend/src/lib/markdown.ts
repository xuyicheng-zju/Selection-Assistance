/**
 * Markdown 渲染：marked 解析 + DOMPurify 消毒。
 * 流式场景下可重复调用（每次追加新内容重新渲染整段）。
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(md: string): string {
  if (!md) return "";
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "em", "del", "blockquote", "code", "pre",
      "a", "span", "div", "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });
}
