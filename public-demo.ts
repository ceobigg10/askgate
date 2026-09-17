import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const WEB_PORT = Number(process.env.PORT) || 4390;
const AUDIT_LOG = "public-demo-audit.log";
const APPROVAL_TIMEOUT_MS = 5 * 60_000;
const CALL_INTERVAL_MS = 20_000;

function log(msg: string): void {
  console.log(`[public-demo] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(child: ChildProcessWithoutNullStreams, msg: unknown): void {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function waitForDashboard(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      console.error(line);
      if (line.includes("approval dashboard on")) resolve();
    });
  });
}

const SCENARIOS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "echo", args: { text: "a routine, harmless request" } },
  { name: "delete_all", args: {} },
  { name: "send_email", args: { to: "customer@example.com", apiToken: "demo-secret-token" } },
  { name: "wire_transfer", args: { amountUsd: 5000, to: "unknown-account", apiKey: "demo-secret-key" } },
  { name: "restart_production_server", args: { server: "prod-01" } },
];

async function main(): Promise<void> {
  log("Starting askgate in front of a fake MCP server for a public demo...");

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

  gateway.on("exit", (code) => {
    log(`gateway process exited unexpectedly with code ${code}, exiting`);
    process.exit(code ?? 1);
  });

  // Nobody is acting as a real MCP client here, so just drain the gateway's
  // stdout (tool call responses) instead of doing anything with it.
  createInterface({ input: gateway.stdout }).on("line", () => {});

  await waitForDashboard(gateway);
  log(`Dashboard is live on port ${WEB_PORT}`);

  let id = 1;
  let scenarioIndex = 0;
  for (;;) {
    const scenario = SCENARIOS[scenarioIndex % SCENARIOS.length];
    scenarioIndex++;
    log(`Sending demo tools/call "${scenario.name}"...`);
    send(gateway, { jsonrpc: "2.0", id: id++, method: "tools/call", params: { name: scenario.name, arguments: scenario.args } });
    await sleep(CALL_INTERVAL_MS);
  }
}

main();
