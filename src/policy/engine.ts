import type { Policy, PolicyRule, ToolCall, Decision } from "./types.js";

function parseRegexLiteral(pattern: string): RegExp | null {
  const match = /^\/(.*)\/([a-z]*)$/.exec(pattern);
  return match ? new RegExp(match[1], match[2]) : null;
}

function matchesTool(rule: PolicyRule, tool: string): boolean {
  const regex = parseRegexLiteral(rule.tool);
  return regex ? regex.test(tool) : rule.tool === tool;
}

function matchesServer(rule: PolicyRule, server: string): boolean {
  return rule.server === undefined || rule.server === server;
}

function matchesArgs(rule: PolicyRule, args: Record<string, unknown>): boolean {
  if (!rule.argsMatch) return true;
  return Object.entries(rule.argsMatch).every(([key, pattern]) => {
    const value = args[key];
    const regex = parseRegexLiteral(pattern) ?? new RegExp(pattern);
    return regex.test(typeof value === "string" ? value : JSON.stringify(value));
  });
}

export function evaluate(policy: Policy, call: ToolCall): Decision {
  for (const rule of policy.rules) {
    if (matchesServer(rule, call.server) && matchesTool(rule, call.tool) && matchesArgs(rule, call.args)) {
      return { action: rule.action, matchedRule: rule };
    }
  }
  return { action: policy.defaultAction, matchedRule: null };
}
