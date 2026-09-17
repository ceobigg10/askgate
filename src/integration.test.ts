import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

function send(child: ChildProcessWithoutNullStreams, msg: unknown): void {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function nextMessage(child: ChildProcessWithoutNullStreams): Promise<any> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: child.stdout });
    rl.once("line", (line) => {
      rl.close();
      resolve(JSON.parse(line));
    });
  });
}

function waitForPort(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      const match = /approval dashboard on http:\/\/localhost:(\d+)/.exec(line);
      if (match) {
        rl.close();
        resolve(Number(match[1]));
      }
    });
  });
}

async function waitForPending(port: number): Promise<{ id: string }[]> {
  let pending: { id: string }[] = [];
  while (pending.length === 0) {
    pending = await (await fetch(`http://localhost:${port}/pending`)).json();
    if (pending.length === 0) await new Promise((r) => setTimeout(r, 20));
  }
  return pending;
}

describe("mcp-guard integration", () => {
  let dir: string;
  let policyPath: string;
  let auditLogPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-guard-"));
    policyPath = join(dir, "policy.yaml");
    auditLogPath = join(dir, "audit.log");
    writeFileSync(
      policyPath,
      ["defaultAction: ask", "rules:", "  - tool: echo", "    action: allow", "  - tool: delete_all", "    action: deny"].join("\n")
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function spawnGateway(extraArgs: string[] = []): ChildProcessWithoutNullStreams {
    return spawn(
      "npx",
      [
        "tsx", "src/index.ts",
        "--policy", policyPath,
        "--audit-log", auditLogPath,
        "--approval-mode", "web",
        "--web-port", "0",
        ...extraArgs,
        "--",
        "npx", "tsx", "fixtures/fakeServer.ts",
      ],
      { cwd: process.cwd() }
    ) as ChildProcessWithoutNullStreams;
  }

  it("allows a tool call matched by an allow rule", async () => {
    const gateway = spawnGateway();
    send(gateway, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } });
    const response = await nextMessage(gateway);
    expect(response.result.content[0].text).toContain("called echo");
    gateway.kill();
  });

  it("denies a tool call matched by a deny rule without reaching the server", async () => {
    const gateway = spawnGateway();
    send(gateway, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_all", arguments: {} } });
    const response = await nextMessage(gateway);
    expect(response.error.message).toBe("Denied by policy");
    gateway.kill();
  });

  it("times out an unmatched tool call and denies it", async () => {
    const gateway = spawnGateway(["--approval-timeout-ms", "300"]);
    send(gateway, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mystery_tool", arguments: {} } });
    const response = await nextMessage(gateway);
    expect(response.error.message).toBe("Approval timed out");
    gateway.kill();
  });

  it("approves a pending ask-type call via the web dashboard", async () => {
    const gateway = spawnGateway();
    const portPromise = waitForPort(gateway);
    send(gateway, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "needs_approval", arguments: {} } });
    const port = await portPromise;
    const [pending] = await waitForPending(port);
    await fetch(`http://localhost:${port}/approve/${pending.id}`, { method: "POST" });
    const response = await nextMessage(gateway);
    expect(response.result.content[0].text).toContain("called needs_approval");
    gateway.kill();
  });

  it("denies a pending ask-type call via the web dashboard", async () => {
    const gateway = spawnGateway();
    const portPromise = waitForPort(gateway);
    send(gateway, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "needs_approval", arguments: {} } });
    const port = await portPromise;
    const [pending] = await waitForPending(port);
    await fetch(`http://localhost:${port}/deny/${pending.id}`, { method: "POST" });
    const response = await nextMessage(gateway);
    expect(response.error.message).toBe("Denied by approver");
    gateway.kill();
  });

  it("writes audit records covering allow, deny, and timeout-deny decisions", async () => {
    await new Promise((r) => setTimeout(r, 200));
    const lines = readFileSync(auditLogPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const decisions = lines.map((l) => l.decision);
    expect(decisions).toContain("allow");
    expect(decisions).toContain("deny");
    expect(decisions).toContain("timeout-deny");
  });
});
