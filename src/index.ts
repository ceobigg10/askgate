#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { parseArgs } from "./config.js";
import { PolicyHolder } from "./policy/loader.js";
import { AuditLogger } from "./audit/logger.js";
import { ApprovalBroker } from "./approval/broker.js";
import { attachCliFrontend } from "./approval/cliFrontend.js";
import { createWebFrontend } from "./approval/webFrontend.js";
import { ProxyCore } from "./proxy/core.js";

function main(): void {
  let config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[mcp-guard] ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  let policyHolder: PolicyHolder;
  try {
    policyHolder = new PolicyHolder(config.policyPath, (err) => {
      console.error(`[mcp-guard] policy reload failed, keeping previous policy: ${err.message}`);
    });
  } catch (err) {
    console.error(`[mcp-guard] failed to load policy: ${(err as Error).message}`);
    process.exit(1);
    return;
  }
  policyHolder.watch();

  const auditLogger = new AuditLogger(config.auditLogPath);
  const approvalBroker = new ApprovalBroker(config.approvalTimeoutMs);

  if (config.approvalMode === "cli" || config.approvalMode === "both") {
    // The gateway's own stdin/stdout carry MCP protocol traffic, so the CLI
    // approval prompt talks to the controlling terminal directly instead.
    const ttyPath = process.platform === "win32" ? "CON" : "/dev/tty";
    attachCliFrontend(approvalBroker, createReadStream(ttyPath), createWriteStream(ttyPath));
  }

  if (config.approvalMode === "web" || config.approvalMode === "both") {
    const app = createWebFrontend(approvalBroker);
    const server = app.listen(config.webPort, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : config.webPort;
      console.error(`[mcp-guard] approval dashboard on http://localhost:${port}`);
    });
  }

  const child = spawn(config.downstreamCommand, config.downstreamArgs, {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.on("exit", (code) => {
    console.error(`[mcp-guard] downstream server exited with code ${code}`);
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    console.error(`[mcp-guard] failed to start downstream server: ${err.message}`);
    process.exit(1);
  });

  const proxy = new ProxyCore({
    serverLabel: config.serverLabel,
    policyHolder,
    approvalBroker,
    auditLogger,
    upstreamInput: process.stdin,
    upstreamOutput: process.stdout,
    downstreamInput: child.stdin!,
    downstreamOutput: child.stdout!,
  });
  proxy.start();
}

main();
