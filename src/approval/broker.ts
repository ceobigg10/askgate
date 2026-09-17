import { randomUUID } from "node:crypto";

export type ApprovalOutcome = "approved" | "denied" | "timeout";

export interface PendingApproval {
  id: string;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  createdAt: number;
}

export type PendingRequest = Omit<PendingApproval, "id" | "createdAt">;

export interface ApprovalRequester {
  requestApproval(request: PendingRequest): Promise<ApprovalOutcome>;
}

interface PendingEntry {
  approval: PendingApproval;
  resolve: (outcome: ApprovalOutcome) => void;
  timer: NodeJS.Timeout;
}

export class ApprovalBroker implements ApprovalRequester {
  private pending = new Map<string, PendingEntry>();
  private listeners: Array<(p: PendingApproval) => void> = [];

  constructor(private readonly timeoutMs: number) {}

  onPending(listener: (p: PendingApproval) => void): void {
    this.listeners.push(listener);
  }

  list(): PendingApproval[] {
    return [...this.pending.values()].map((entry) => entry.approval);
  }

  requestApproval(request: PendingRequest): Promise<ApprovalOutcome> {
    const id = randomUUID();
    const approval: PendingApproval = { ...request, id, createdAt: Date.now() };
    return new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolvePromise("timeout");
      }, this.timeoutMs);
      this.pending.set(id, { approval, resolve: resolvePromise, timer });
      for (const listener of this.listeners) listener(approval);
    });
  }

  resolve(id: string, outcome: "approved" | "denied"): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(outcome);
    return true;
  }
}
