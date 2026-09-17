import { readFileSync, watch } from "node:fs";
import { parse } from "yaml";
import type { Policy, PolicyRule, PolicyAction, PolicyProvider } from "./types.js";

const VALID_ACTIONS: PolicyAction[] = ["allow", "deny", "ask"];

export function loadPolicy(path: string): Policy {
  const raw = readFileSync(path, "utf-8");
  return validatePolicy(parse(raw), path);
}

function validatePolicy(parsed: unknown, path: string): Policy {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid policy at ${path}: root must be a mapping`);
  }
  const obj = parsed as Record<string, unknown>;
  const defaultAction = obj.defaultAction ?? "ask";
  if (!VALID_ACTIONS.includes(defaultAction as PolicyAction)) {
    throw new Error(`Invalid policy at ${path}: defaultAction must be one of allow/deny/ask`);
  }
  if (!Array.isArray(obj.rules)) {
    throw new Error(`Invalid policy at ${path}: "rules" must be a list`);
  }
  const rules = obj.rules.map((r, i) => validateRule(r, i, path));
  return { defaultAction: defaultAction as PolicyAction, rules };
}

function validateRule(r: unknown, index: number, path: string): PolicyRule {
  if (typeof r !== "object" || r === null) {
    throw new Error(`Invalid policy at ${path}: rules[${index}] must be a mapping`);
  }
  const obj = r as Record<string, unknown>;
  if (typeof obj.tool !== "string") {
    throw new Error(`Invalid policy at ${path}: rules[${index}].tool must be a string`);
  }
  if (!VALID_ACTIONS.includes(obj.action as PolicyAction)) {
    throw new Error(`Invalid policy at ${path}: rules[${index}].action must be one of allow/deny/ask`);
  }
  if (obj.server !== undefined && typeof obj.server !== "string") {
    throw new Error(`Invalid policy at ${path}: rules[${index}].server must be a string`);
  }
  if (obj.argsMatch !== undefined && (typeof obj.argsMatch !== "object" || obj.argsMatch === null)) {
    throw new Error(`Invalid policy at ${path}: rules[${index}].argsMatch must be a mapping`);
  }
  return {
    tool: obj.tool,
    action: obj.action as PolicyAction,
    server: obj.server as string | undefined,
    argsMatch: obj.argsMatch as Record<string, string> | undefined,
  };
}

export class PolicyHolder implements PolicyProvider {
  private current: Policy;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(
    private readonly path: string,
    private readonly onError: (err: Error) => void = () => {}
  ) {
    this.current = loadPolicy(path);
  }

  get(): Policy {
    return this.current;
  }

  reload(): void {
    try {
      this.current = loadPolicy(this.path);
    } catch (err) {
      this.onError(err as Error);
    }
  }

  watch(): void {
    this.watcher = watch(this.path, () => this.reload());
  }

  close(): void {
    this.watcher?.close();
  }
}
