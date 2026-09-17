import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, unlinkSync, readFileSync } from "node:fs";

const WEB_PORT = 4390;
const AUDIT_LOG = "demo-audit.log";
const APPROVAL_TIMEOUT_MS = 60_000;

function log(msg: string): void {
  console.log(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function waitForDashboard(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      if (line.includes("approval dashboard on")) resolve();
    });
  });
}

async function main(): Promise<void> {
  if (existsSync(AUDIT_LOG)) unlinkSync(AUDIT_LOG);

  log("");
  log("=== askgate live demo ===");
  log("Starting the gateway in front of a fake MCP server...");
  log("");

  const gateway = spawn(
    "npx",
    [
      "tsx", "src/index.ts",
      "--policy", "policy.yaml",
      "--audit-log", AUDIT_LOG,
      "--approval-mode", "web",
      "--web-port", String(WEB_PORT),
      "--approval-timeout-ms", String(APPROVAL_TIMEOUT_MS),
      "--", "npx", "tsx", "fixtures/fakeServer.ts",
    ],
    { cwd: process.cwd() }
  ) as ChildProcessWithoutNullStreams;

  await waitForDashboard(gateway);
  log(`Dashboard is live: http://localhost:${WEB_PORT}`);
  if (process.platform === "darwin") {
    spawn("open", [`http://localhost:${WEB_PORT}`]);
  }
  log("");
  await sleep(1000);

  log("--- Call 1: an everyday, harmless request ---");
  log('Sending tools/call "echo" ...');
  send(gateway, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { text: "hello" } } });
  const r1 = await nextMessage(gateway);
  log(`RESULT: ${r1.result.content[0].text}`);
  log("askgate's policy has an explicit ALLOW rule for \"echo\" -> let it straight through, no human involved.");
  log("");
  await sleep(2500);

  log("--- Call 2: an obviously dangerous request ---");
  log('Sending tools/call "delete_all" ...');
  send(gateway, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "delete_all", arguments: {} } });
  const r2 = await nextMessage(gateway);
  log(`RESULT: ${r2.error ? `BLOCKED - ${r2.error.message}` : JSON.stringify(r2.result)}`);
  log("askgate's policy has an explicit DENY rule for \"delete_all\" -> the fake server never even saw this request.");
  log("");
  await sleep(2500);

  log("--- Call 3: something the policy has no opinion on ---");
  log('Sending tools/call "send_email" (no matching rule)...');
  log(`>>> Go to http://localhost:${WEB_PORT} right now and click Approve or Deny! <<<`);
  log(`(If nothing is clicked within ${APPROVAL_TIMEOUT_MS / 1000}s, it auto-denies as a safety default.)`);
  send(gateway, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "send_email", arguments: { to: "customer@example.com", apiToken: "super-secret-value" } },
  });
  const r3 = await nextMessage(gateway);
  if (r3.error) {
    log(`RESULT: BLOCKED - ${r3.error.message}`);
  } else {
    log(`RESULT: ALLOWED - ${r3.result.content[0].text}`);
  }
  log("");

  log("--- Audit log (this is the permanent record of everything above) ---");
  const lines = readFileSync(AUDIT_LOG, "utf-8").trim().split("\n");
  for (const line of lines) {
    const rec = JSON.parse(line);
    log(`[${rec.decision}] tool=${rec.tool} args=${JSON.stringify(rec.args)} matchedRule=${rec.matchedRule}`);
  }
  log("");
  log("Notice \"apiToken\" was redacted in the log above, even though the real call carried a secret value.");
  log("");
  log("=== Demo complete, shutting down ===");

  gateway.kill();
  process.exit(0);
}

main();
