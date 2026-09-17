import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "method" in msg && "id" in msg;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return !("method" in msg) && "id" in msg;
}

export function writeMessage(out: Writable, msg: JsonRpcMessage): void {
  out.write(JSON.stringify(msg) + "\n");
}

export function readMessages(
  input: Readable,
  onMessage: (msg: JsonRpcMessage) => void,
  onError: (err: Error) => void
): void {
  const rl = createInterface({ input });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    try {
      onMessage(JSON.parse(trimmed) as JsonRpcMessage);
    } catch {
      onError(new Error(`Malformed JSON-RPC line: ${trimmed}`));
    }
  });
}
