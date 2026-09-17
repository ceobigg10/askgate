export type PolicyAction = "allow" | "deny" | "ask";

export interface PolicyRule {
  server?: string;
  tool: string;
  argsMatch?: Record<string, string>;
  action: PolicyAction;
}

export interface Policy {
  defaultAction: PolicyAction;
  rules: PolicyRule[];
}

export interface ToolCall {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface Decision {
  action: PolicyAction;
  matchedRule: PolicyRule | null;
}

export interface PolicyProvider {
  get(): Policy;
}
