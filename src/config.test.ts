import { describe, it, expect } from "vitest";
import { parseArgs } from "./config.js";

describe("parseArgs", () => {
  it("parses a full set of flags", () => {
    const config = parseArgs([
      "--policy", "policy.yaml",
      "--approval-mode", "both",
      "--approval-timeout-ms", "5000",
      "--audit-log", "out.log",
      "--server-label", "fs",
      "--web-port", "5000",
      "--", "node", "server.js", "--flag",
    ]);
    expect(config).toEqual({
      policyPath: "policy.yaml",
      approvalMode: "both",
      approvalTimeoutMs: 5000,
      auditLogPath: "out.log",
      serverLabel: "fs",
      webPort: 5000,
      downstreamCommand: "node",
      downstreamArgs: ["server.js", "--flag"],
    });
  });

  it("applies defaults when optional flags are omitted", () => {
    const config = parseArgs(["--policy", "policy.yaml", "--", "node", "server.js"]);
    expect(config.approvalMode).toBe("cli");
    expect(config.approvalTimeoutMs).toBe(120000);
    expect(config.auditLogPath).toBe("audit.log");
    expect(config.webPort).toBe(4390);
    expect(config.serverLabel).toBe("node");
  });

  it("throws when '--' separator is missing", () => {
    expect(() => parseArgs(["--policy", "policy.yaml"])).toThrow(/--/);
  });

  it("throws when the downstream command is missing after '--'", () => {
    expect(() => parseArgs(["--policy", "policy.yaml", "--"])).toThrow(/downstream/);
  });

  it("throws when --policy is missing", () => {
    expect(() => parseArgs(["--", "node", "server.js"])).toThrow(/--policy/);
  });

  it("throws on an invalid --approval-mode value", () => {
    expect(() => parseArgs(["--policy", "p.yaml", "--approval-mode", "bogus", "--", "node", "s.js"])).toThrow(/approval-mode/);
  });
});
