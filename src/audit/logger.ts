import { appendFileSync } from "node:fs";

export type AuditDecision = "allow" | "deny" | "ask->allow" | "ask->deny" | "timeout-deny";

export interface AuditRecordInput {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  matchedRule: string;
  decision: AuditDecision;
  latencyMs: number;
}

export interface AuditRecord extends AuditRecordInput {
  timestamp: string;
}

export interface AuditSink {
  log(input: AuditRecordInput): void;
}

const DEFAULT_REDACT_PATTERN = /password|token|secret|key/i;

export class AuditLogger implements AuditSink {
  constructor(
    private readonly filePath: string,
    private readonly redactPattern: RegExp = DEFAULT_REDACT_PATTERN
  ) {}

  redactArgs(args: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      redacted[key] = this.redactPattern.test(key) ? "[REDACTED]" : value;
    }
    return redacted;
  }

  log(input: AuditRecordInput): void {
    const record: AuditRecord = {
      ...input,
      args: this.redactArgs(input.args),
      timestamp: new Date().toISOString(),
    };
    appendFileSync(this.filePath, JSON.stringify(record) + "\n");
  }
}
