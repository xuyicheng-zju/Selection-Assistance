import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translate, chat, detect, explain } from "../src/lib/api";
import { BackendError } from "../src/lib/types";

describe("api 客户端", () => {
  beforeEach(() => {
    (globalThis as { __BACKEND_BASE__?: string }).__BACKEND_BASE__ = "http://localhost:8000";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("translate 用 FormData 发 multipart", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ text: "x", phonetics: {}, translation: "y", model: "m" }),
      } as Response;
    });
    const res = await translate("hello", { target_lang: "zh" });
    expect(res.translation).toBe("y");
    expect(calls[0].url).toBe("http://localhost:8000/api/translate");
    const form = calls[0].init.body as FormData;
    expect(form.get("text")).toBe("hello");
    expect(form.get("target_lang")).toBe("zh");
    expect(form.get("source_lang")).toBe("auto");
  });

  it("chat 用 JSON 发送", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ answer: "a", model: "m" }) } as Response;
    });
    const res = await chat({
      selected_text: "hi",
      initial_action: "translate",
      history: [],
      question: "举例",
    });
    expect(res.answer).toBe("a");
    expect(calls[0].url).toBe("http://localhost:8000/api/chat");
    expect(calls[0].init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.question).toBe("举例");
  });

  it("detect 用 GET 查询参数", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ kind: "word", needs_phonetics: true }) } as Response;
    });
    const res = await detect("hello");
    expect(res.kind).toBe("word");
    expect(calls[0]).toContain("/api/detect?text=hello");
  });

  it("explain 携带 context 和 style", async () => {
    const calls: { init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push({ init });
      return { ok: true, json: async () => ({ text: "", phonetics: {}, explanation: "e", model: "m" }) } as Response;
    });
    await explain("closure", { context: "编程", style: "detailed" });
    const form = calls[0].init.body as FormData;
    expect(form.get("context")).toBe("编程");
    expect(form.get("style")).toBe("detailed");
  });

  it("HTTP 错误解析 detail 信封", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 503,
      json: async () => ({ detail: { code: "deepseek_error", message: "boom" } }),
    }) as Response);
    await expect(translate("x")).rejects.toMatchObject({
      code: "deepseek_error",
      message: "boom",
      status: 503,
    });
  });

  it("错误对象是 BackendError 实例", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: "bad input" }),
    }) as Response);
    try {
      await translate("x");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BackendError);
      expect((e as BackendError).message).toBe("bad input");
    }
  });
});
