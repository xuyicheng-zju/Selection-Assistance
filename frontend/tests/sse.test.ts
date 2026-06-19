import { describe, it, expect } from "vitest";
import { parseSseChunk, dispatchEvent, type SseHandlers } from "../src/lib/sse";

describe("parseSseChunk", () => {
  it("切分多个事件块", () => {
    const buf =
      'event: phonetics\n' +
      'data: {"phonetics":{"ipa":"/a/"}}\n\n' +
      'event: delta\n' +
      'data: {"delta":"你好"}\n\n';
    const { events, rest } = parseSseChunk(buf);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("phonetics");
    expect(events[0].data).toBe('{"phonetics":{"ipa":"/a/"}}');
    expect(events[1].event).toBe("delta");
    expect(rest).toBe("");
  });

  it("不完整的块保留在 rest", () => {
    const buf = 'event: delta\ndata: {"delta":"a"}\n\nevent: thinking\ndata: {"delta":"b"}';
    const { events, rest } = parseSseChunk(buf);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("delta");
    expect(rest).toContain("thinking");
  });

  it("无 data 行的块被跳过", () => {
    const buf = "event: ping\n\n";
    const { events } = parseSseChunk(buf);
    expect(events).toHaveLength(0);
  });

  it("多行 data 用换行拼接", () => {
    const buf = "data: line1\ndata: line2\n\n";
    const { events } = parseSseChunk(buf);
    expect(events[0].data).toBe("line1\nline2");
  });
});

describe("dispatchEvent", () => {
  it("分发 phonetics", () => {
    let got: unknown = null;
    const h: SseHandlers = { onPhonetics: (d) => (got = d) };
    dispatchEvent({ event: "phonetics", data: '{"phonetics":{"ipa":"/x/"}}' }, h);
    expect(got).toEqual({ phonetics: { ipa: "/x/" } });
  });

  it("分发 delta / thinking", () => {
    let delta = "";
    let think = "";
    const h: SseHandlers = {
      onDelta: (d) => (delta = d),
      onThinking: (d) => (think = d),
    };
    dispatchEvent({ event: "delta", data: '{"delta":"a"}' }, h);
    dispatchEvent({ event: "thinking", data: '{"delta":"b"}' }, h);
    expect(delta).toBe("a");
    expect(think).toBe("b");
  });

  it("分发 done / error", () => {
    let done: unknown = null;
    let err: unknown = null;
    const h: SseHandlers = {
      onDone: (d) => (done = d),
      onError: (e) => (err = e),
    };
    dispatchEvent({ event: "done", data: '{"model":"deepseek-v4-pro"}' }, h);
    dispatchEvent({ event: "error", data: '{"code":"x","message":"y"}' }, h);
    expect(done).toEqual({ model: "deepseek-v4-pro" });
    expect(err).toEqual({ code: "x", message: "y" });
  });

  it("未知事件忽略", () => {
    const h: SseHandlers = {};
    expect(() =>
      dispatchEvent({ event: "unknown", data: "{}" }, h)
    ).not.toThrow();
  });

  it("非法 JSON 不抛错", () => {
    const h: SseHandlers = { onError: () => {} };
    expect(() =>
      dispatchEvent({ event: "error", data: "not json" }, h)
    ).not.toThrow();
  });
});
