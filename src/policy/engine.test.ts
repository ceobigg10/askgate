import { describe, it, expect } from "vitest";
import { evaluate } from "./engine.js";
import type { Policy } from "./types.js";

describe("policy engine", () => {
  it("matches an exact tool name", () => {
    const policy: Policy = { defaultAction: "ask", rules: [{ tool: "read_file", action: "allow" }] };
    const decision = evaluate(policy, { server: "fs", tool: "read_file", args: {} });
    expect(decision.action).toBe("allow");
    expect(decision.matchedRule?.tool).toBe("read_file");
  });

  it("matches a tool name via a /regex/ rule", () => {
    const policy: Policy = { defaultAction: "ask", rules: [{ tool: "/^write_.*/", action: "deny" }] };
    const decision = evaluate(policy, { server: "fs", tool: "write_file", args: {} });
    expect(decision.action).toBe("deny");
  });

  it("scopes a rule to a specific server", () => {
    const policy: Policy = {
      defaultAction: "ask",
      rules: [{ server: "github", tool: "delete_repo", action: "deny" }],
    };
    const onOtherServer = evaluate(policy, { server: "fs", tool: "delete_repo", args: {} });
    expect(onOtherServer.action).toBe("ask");
    const onGithub = evaluate(policy, { server: "github", tool: "delete_repo", args: {} });
    expect(onGithub.action).toBe("deny");
  });

  it("matches on argsMatch conditions (all keys must match)", () => {
    const policy: Policy = {
      defaultAction: "ask",
      rules: [{ tool: "write_file", argsMatch: { path: "^/etc/" }, action: "deny" }],
    };
    const sensitive = evaluate(policy, { server: "fs", tool: "write_file", args: { path: "/etc/passwd" } });
    expect(sensitive.action).toBe("deny");
    const benign = evaluate(policy, { server: "fs", tool: "write_file", args: { path: "/tmp/x" } });
    expect(benign.action).toBe("ask");
  });

  it("uses first-match-wins ordering", () => {
    const policy: Policy = {
      defaultAction: "ask",
      rules: [
        { tool: "delete_all", action: "allow" },
        { tool: "delete_all", action: "deny" },
      ],
    };
    const decision = evaluate(policy, { server: "fs", tool: "delete_all", args: {} });
    expect(decision.action).toBe("allow");
  });

  it("falls back to defaultAction when no rule matches", () => {
    const policy: Policy = { defaultAction: "ask", rules: [] };
    const decision = evaluate(policy, { server: "fs", tool: "anything", args: {} });
    expect(decision.action).toBe("ask");
    expect(decision.matchedRule).toBeNull();
  });
});
