import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { ProxyCore } from "./core.js";
import { readMessages, type JsonRpcMessage } from "./transport.js";
import type { Policy, PolicyProvider } from "../policy/types.js";
import type { ApprovalRequester, ApprovalOutcome } from "../approval/broker.js";
import type { AuditSink, AuditRecordInput } from "../audit/logger.js";

function collect(stream: PassThrough): { messages: JsonRpcMessage[] } {
  const box = { messages: [] as JsonRpcMessage[] };
  readMessages(stream, (m) => box.messages.push(m), () => {});
  return box;
}

function fixedPolicy(policy: Policy): PolicyProvider {
  return { get: () => policy };
}

function fakeApprovalBroker(outcome: ApprovalOutcome): ApprovalRequester {
  return { requestApproval: () => Promise.resolve(outcome) };
}

function recordingAuditLogger(): { sink: AuditSink; records: AuditRecordInput[] } {
  const records: AuditRecordInput[] = [];
  return { sink: { log: (r) => records.push(r) }, records };
}

function makeProxy(policy: Policy, approvalBroker: ApprovalRequester, auditLogger: AuditSink) {
  const upstreamInput = new PassThrough();
  const upstreamOutput = new PassThrough();
  const downstreamInput = new PassThrough();
  const downstreamOutput = new PassThrough();
  const upstreamOutBox = collect(upstreamOutput);
  const downstreamInBox = collect(downstreamInput);

  const proxy = new ProxyCore({
    serverLabel: "fs",
    policyHolder: fixedPolicy(policy),
    approvalBroker,
    auditLogger,
    upstreamInput,
    upstreamOutput,
    downstreamInput,
    downstreamOutput,
  });
  proxy.start();

  return { proxy, upstreamInput, upstreamOutput, downstreamInput, downstreamOutput, upstreamOutBox, downstreamInBox };
}

describe("ProxyCore", () => {
  it("passes non-tools/call requests straight through to the child", () => {
    const { upstreamInput, downstreamInBox } = makeProxy(
      { defaultAction: "ask", rules: [] },
      fakeApprovalBroker("approved"),
      recordingAuditLogger().sink
    );
    upstreamInput.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
    expect(downstreamInBox.messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  });

  it("forwards an allowed tools/call and relays the child's response", async () => {
    const policy: Policy = { defaultAction: "ask", rules: [{ tool: "echo", action: "allow" }] };
    const records: AuditRecordInput[] = [];
    const auditLogger: AuditSink = { log: (r) => records.push(r) };
    const { upstreamInput, downstreamOutput, downstreamInBox, upstreamOutBox } = makeProxy(
      policy,
      fakeApprovalBroker("approved"),
      auditLogger
    );

    upstreamInput.write(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } }) + "\n"
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(downstreamInBox.messages).toHaveLength(1);

    downstreamOutput.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "hi" }] } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));

    expect(upstreamOutBox.messages).toEqual([
      { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "hi" }] } },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe("allow");
  });

  it("denies a tools/call matched by a deny rule without contacting the child", async () => {
    const policy: Policy = { defaultAction: "ask", rules: [{ tool: "delete_all", action: "deny" }] };
    const records: AuditRecordInput[] = [];
    const auditLogger: AuditSink = { log: (r) => records.push(r) };
    const { upstreamInput, downstreamInBox, upstreamOutBox } = makeProxy(policy, fakeApprovalBroker("approved"), auditLogger);

    upstreamInput.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_all", arguments: {} } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));

    expect(downstreamInBox.messages).toHaveLength(0);
    expect(upstreamOutBox.messages).toEqual([
      { jsonrpc: "2.0", id: 2, error: { code: -32001, message: "Denied by policy" } },
    ]);
    expect(records[0].decision).toBe("deny");
  });

  it("routes an unmatched tools/call through approval and forwards it on approve", async () => {
    const policy: Policy = { defaultAction: "ask", rules: [] };
    const records: AuditRecordInput[] = [];
    const auditLogger: AuditSink = { log: (r) => records.push(r) };
    const { upstreamInput, downstreamOutput, downstreamInBox, upstreamOutBox } = makeProxy(
      policy,
      fakeApprovalBroker("approved"),
      auditLogger
    );

    upstreamInput.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mystery", arguments: {} } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));
    expect(downstreamInBox.messages).toHaveLength(1);

    downstreamOutput.write(JSON.stringify({ jsonrpc: "2.0", id: 3, result: { ok: true } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));

    expect(upstreamOutBox.messages).toEqual([{ jsonrpc: "2.0", id: 3, result: { ok: true } }]);
    expect(records[0].decision).toBe("ask->allow");
  });

  it("denies an unmatched tools/call when approval is denied", async () => {
    const policy: Policy = { defaultAction: "ask", rules: [] };
    const records: AuditRecordInput[] = [];
    const auditLogger: AuditSink = { log: (r) => records.push(r) };
    const { upstreamInput, upstreamOutBox } = makeProxy(policy, fakeApprovalBroker("denied"), auditLogger);

    upstreamInput.write(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "mystery", arguments: {} } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));

    expect(upstreamOutBox.messages).toEqual([
      { jsonrpc: "2.0", id: 4, error: { code: -32001, message: "Denied by approver" } },
    ]);
    expect(records[0].decision).toBe("ask->deny");
  });

  it("logs timeout-deny distinctly when approval times out", async () => {
    const policy: Policy = { defaultAction: "ask", rules: [] };
    const records: AuditRecordInput[] = [];
    const auditLogger: AuditSink = { log: (r) => records.push(r) };
    const { upstreamInput, upstreamOutBox } = makeProxy(policy, fakeApprovalBroker("timeout"), auditLogger);

    upstreamInput.write(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "mystery", arguments: {} } }) + "\n");
    await new Promise((r) => setTimeout(r, 10));

    expect(upstreamOutBox.messages).toEqual([
      { jsonrpc: "2.0", id: 5, error: { code: -32001, message: "Approval timed out" } },
    ]);
    expect(records[0].decision).toBe("timeout-deny");
  });
});
