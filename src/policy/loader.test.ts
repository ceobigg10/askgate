import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPolicy, PolicyHolder } from "./loader.js";

function tempPolicyFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mcp-guard-policy-"));
  const path = join(dir, "policy.yaml");
  writeFileSync(path, contents);
  return path;
}

const dirsToClean: string[] = [];

afterEach(() => {
  while (dirsToClean.length) {
    rmSync(dirsToClean.pop()!, { recursive: true, force: true });
  }
});

describe("loadPolicy", () => {
  it("parses a valid policy file", () => {
    const path = tempPolicyFile(
      ["defaultAction: ask", "rules:", "  - tool: read_file", "    action: allow"].join("\n")
    );
    const policy = loadPolicy(path);
    expect(policy.defaultAction).toBe("ask");
    expect(policy.rules).toEqual([{ tool: "read_file", action: "allow" }]);
  });

  it("throws when rules is missing", () => {
    const path = tempPolicyFile("defaultAction: ask");
    expect(() => loadPolicy(path)).toThrow(/rules/);
  });

  it("throws when a rule has an invalid action", () => {
    const path = tempPolicyFile(["rules:", "  - tool: read_file", "    action: maybe"].join("\n"));
    expect(() => loadPolicy(path)).toThrow(/action/);
  });

  it("throws when a rule is missing tool", () => {
    const path = tempPolicyFile(["rules:", "  - action: allow"].join("\n"));
    expect(() => loadPolicy(path)).toThrow(/tool/);
  });
});

describe("PolicyHolder", () => {
  it("get() returns the currently loaded policy", () => {
    const path = tempPolicyFile(["rules:", "  - tool: a", "    action: allow"].join("\n"));
    const holder = new PolicyHolder(path);
    expect(holder.get().rules[0].tool).toBe("a");
  });

  it("reload() picks up valid changes", () => {
    const path = tempPolicyFile(["rules:", "  - tool: a", "    action: allow"].join("\n"));
    const holder = new PolicyHolder(path);
    writeFileSync(path, ["rules:", "  - tool: b", "    action: deny"].join("\n"));
    holder.reload();
    expect(holder.get().rules[0].tool).toBe("b");
  });

  it("reload() keeps the previous policy and reports the error on malformed changes", () => {
    const path = tempPolicyFile(["rules:", "  - tool: a", "    action: allow"].join("\n"));
    let reportedError: Error | null = null;
    const holder = new PolicyHolder(path, (err) => {
      reportedError = err;
    });
    writeFileSync(path, "not: [valid, policy");
    holder.reload();
    expect(holder.get().rules[0].tool).toBe("a");
    expect(reportedError).not.toBeNull();
  });
});
