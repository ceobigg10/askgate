export interface GatewayConfig {
  policyPath: string;
  approvalMode: "cli" | "web" | "both";
  approvalTimeoutMs: number;
  auditLogPath: string;
  serverLabel: string;
  webPort: number;
  downstreamCommand: string;
  downstreamArgs: string[];
}

export function parseArgs(argv: string[]): GatewayConfig {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1) {
    throw new Error("Usage: askgate --policy <file> [options] -- <downstream command> [args...]");
  }
  const flags = argv.slice(0, sepIndex);
  const downstream = argv.slice(sepIndex + 1);
  if (downstream.length === 0) {
    throw new Error("Missing downstream server command after --");
  }

  let policyPath: string | undefined;
  let approvalMode: GatewayConfig["approvalMode"] = "cli";
  let approvalTimeoutMs = 120_000;
  let auditLogPath = "audit.log";
  let serverLabel: string | undefined;
  let webPort = 4390;

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const value = flags[i + 1];
    switch (flag) {
      case "--policy":
        policyPath = value;
        i++;
        break;
      case "--approval-mode":
        if (value !== "cli" && value !== "web" && value !== "both") {
          throw new Error(`--approval-mode must be cli, web, or both (got "${value}")`);
        }
        approvalMode = value;
        i++;
        break;
      case "--approval-timeout-ms":
        approvalTimeoutMs = Number(value);
        i++;
        break;
      case "--audit-log":
        auditLogPath = value;
        i++;
        break;
      case "--server-label":
        serverLabel = value;
        i++;
        break;
      case "--web-port":
        webPort = Number(value);
        i++;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (!policyPath) {
    throw new Error("--policy <file> is required");
  }

  return {
    policyPath,
    approvalMode,
    approvalTimeoutMs,
    auditLogPath,
    serverLabel: serverLabel ?? downstream[0],
    webPort,
    downstreamCommand: downstream[0],
    downstreamArgs: downstream.slice(1),
  };
}
