import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "./logger.js";

const dirsToClean: string[] = [];
afterEach(() => {
  while (dirsToClean.length) rmSync(dirsToClean.pop()!, { recursive: true, force: true });
});

function tempLogPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mcp-guard-audit-"));
  dirsToClean.push(dir);
  return join(dir, "audit.log");
}

describe("AuditLogger", () => {
  it("appends one JSON line per record with a timestamp", () => {
    const path = tempLogPath();
    const logger = new AuditLogger(path);
    logger.log({ server: "fs", tool: "read_file", args: { path: "/tmp/x" }, matchedRule: "none", decision: "allow", latencyMs: 5 });
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.tool).toBe("read_file");
    expect(record.decision).toBe("allow");
    expect(typeof record.timestamp).toBe("string");
  });

  it("redacts argument values whose key matches the default redact pattern", () => {
    const path = tempLogPath();
    const logger = new AuditLogger(path);
    logger.log({
      server: "github",
      tool: "create_pr",
      args: { title: "fix bug", apiToken: "abc123", path: "/tmp/x" },
      matchedRule: "none",
      decision: "deny",
      latencyMs: 1,
    });
    const record = JSON.parse(readFileSync(path, "utf-8").trim());
    expect(record.args.apiToken).toBe("[REDACTED]");
    expect(record.args.title).toBe("fix bug");
    expect(record.args.path).toBe("/tmp/x");
  });

  it("appends multiple records across calls", () => {
    const path = tempLogPath();
    const logger = new AuditLogger(path);
    logger.log({ server: "fs", tool: "a", args: {}, matchedRule: "none", decision: "allow", latencyMs: 1 });
    logger.log({ server: "fs", tool: "b", args: {}, matchedRule: "none", decision: "deny", latencyMs: 2 });
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
