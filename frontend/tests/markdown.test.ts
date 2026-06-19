import { describe, it, expect, vi } from "vitest";
// vitest 环境无 DOM，mock 掉 DOMPurify（浏览器里有 window，真实运行不受影响）
vi.mock("dompurify", () => ({
  default: { sanitize: (s: string) => s },
}));

import { renderMarkdown } from "../src/lib/markdown";

describe("renderMarkdown 数学公式", () => {
  it("行内公式 $...$ 渲染为 KaTeX", () => {
    const html = renderMarkdown("能量公式 $E=mc^2$ 很经典");
    expect(html).toContain("katex");
  });

  it("块级公式 $$...$$ 渲染为 KaTeX", () => {
    const html = renderMarkdown("积分：\n$$\\int_0^1 x^2 dx$$");
    expect(html).toContain("katex");
    // 块级应有 katex-display 包裹
    expect(html).toContain("katex-display");
  });

  it("非法公式不抛异常（throwOnError:false）", () => {
    expect(() => renderMarkdown("$\\notacommand$")).not.toThrow();
  });

  it("普通 Markdown 仍正常", () => {
    const html = renderMarkdown("**加粗** 和 `代码`");
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<code>代码</code>");
  });

  it("无内容返回空串", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
