import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { readMessages, writeMessage, isRequest, isResponse } from "./transport.js";

describe("transport", () => {
  it("parses newline-delimited JSON-RPC messages", () => {
    const input = new PassThrough();
    const onMessage = vi.fn();
    const onError = vi.fn();
    readMessages(input, onMessage, onError);

    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    input.write('{"jsonrpc":"2.0","id":1,"result":{}}\n');

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports malformed lines via onError without throwing", () => {
    const input = new PassThrough();
    const onMessage = vi.fn();
    const onError = vi.fn();
    readMessages(input, onMessage, onError);

    input.write("not json\n");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("ignores blank lines", () => {
    const input = new PassThrough();
    const onMessage = vi.fn();
    readMessages(input, onMessage, vi.fn());
    input.write("\n");
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("writeMessage serializes with a trailing newline", () => {
    const chunks: string[] = [];
    const output = new PassThrough();
    output.on("data", (c) => chunks.push(c.toString()));
    writeMessage(output, { jsonrpc: "2.0", id: 1, result: { ok: true } });
    expect(chunks.join("")).toBe('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n');
  });

  it("isRequest / isResponse distinguish message kinds", () => {
    expect(isRequest({ jsonrpc: "2.0", id: 1, method: "x" })).toBe(true);
    expect(isRequest({ jsonrpc: "2.0", id: 1, result: {} })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: {} })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, method: "x" })).toBe(false);
  });
});
