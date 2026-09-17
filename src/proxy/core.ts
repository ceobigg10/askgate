import type { Writable, Readable } from "node:stream";
import { readMessages, writeMessage, isRequest, isResponse } from "./transport.js";
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcId } from "./transport.js";
import type { PolicyProvider } from "../policy/types.js";
import { evaluate } from "../policy/engine.js";
import type { ApprovalRequester } from "../approval/broker.js";
import type { AuditSink, AuditDecision } from "../audit/logger.js";

export interface ProxyCoreOptions {
  serverLabel: string;
  policyHolder: PolicyProvider;
  approvalBroker: ApprovalRequester;
  auditLogger: AuditSink;
  upstreamInput: Readable;
  upstreamOutput: Writable;
  downstreamInput: Writable;
  downstreamOutput: Readable;
}

export class ProxyCore {
  private pendingChildCalls = new Map<JsonRpcId, (msg: JsonRpcMessage) => void>();

  constructor(private readonly opts: ProxyCoreOptions) {}

  start(): void {
    readMessages(
      this.opts.downstreamOutput,
      (msg) => this.handleDownstreamMessage(msg),
      (err) => console.error(`[askgate] ${err.message}`)
    );
    readMessages(
      this.opts.upstreamInput,
      (msg) => this.handleUpstreamMessage(msg),
      (err) => console.error(`[askgate] ${err.message}`)
    );
  }

  private handleDownstreamMessage(msg: JsonRpcMessage): void {
    if (isResponse(msg) && this.pendingChildCalls.has(msg.id)) {
      const resolve = this.pendingChildCalls.get(msg.id)!;
      this.pendingChildCalls.delete(msg.id);
      resolve(msg);
      return;
    }
    writeMessage(this.opts.upstreamOutput, msg);
  }

  private handleUpstreamMessage(msg: JsonRpcMessage): void {
    if (isRequest(msg) && msg.method === "tools/call") {
      void this.handleToolCall(msg);
      return;
    }
    writeMessage(this.opts.downstreamInput, msg);
  }

  private async handleToolCall(request: JsonRpcRequest): Promise<void> {
    const start = Date.now();
    const params = (request.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const tool = params.name ?? "";
    const args = params.arguments ?? {};
    const server = this.opts.serverLabel;

    const decision = evaluate(this.opts.policyHolder.get(), { server, tool, args });
    const matchedRuleDescription = decision.matchedRule
      ? `tool=${decision.matchedRule.tool}${decision.matchedRule.server ? ` server=${decision.matchedRule.server}` : ""}`
      : "none";

    if (decision.action === "deny") {
      this.sendDenied(request.id, "Denied by policy");
      this.audit(server, tool, args, matchedRuleDescription, "deny", start);
      return;
    }

    if (decision.action === "allow") {
      const response = await this.forwardToChild(request);
      writeMessage(this.opts.upstreamOutput, response);
      this.audit(server, tool, args, matchedRuleDescription, "allow", start);
      return;
    }

    const outcome = await this.opts.approvalBroker.requestApproval({
      server,
      tool,
      args,
      reason: matchedRuleDescription === "none" ? "no rule matched" : `matched rule (${matchedRuleDescription}) requires approval`,
    });

    if (outcome === "approved") {
      const response = await this.forwardToChild(request);
      writeMessage(this.opts.upstreamOutput, response);
      this.audit(server, tool, args, matchedRuleDescription, "ask->allow", start);
      return;
    }

    const decisionLabel: AuditDecision = outcome === "timeout" ? "timeout-deny" : "ask->deny";
    this.sendDenied(request.id, outcome === "timeout" ? "Approval timed out" : "Denied by approver");
    this.audit(server, tool, args, matchedRuleDescription, decisionLabel, start);
  }

  private forwardToChild(request: JsonRpcRequest): Promise<JsonRpcMessage> {
    return new Promise((resolve) => {
      this.pendingChildCalls.set(request.id, resolve);
      writeMessage(this.opts.downstreamInput, request);
    });
  }

  private sendDenied(id: JsonRpcId, message: string): void {
    writeMessage(this.opts.upstreamOutput, { jsonrpc: "2.0", id, error: { code: -32001, message } });
  }

  private audit(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    matchedRule: string,
    decision: AuditDecision,
    start: number
  ): void {
    this.opts.auditLogger.log({ server, tool, args, matchedRule, decision, latencyMs: Date.now() - start });
  }
}
