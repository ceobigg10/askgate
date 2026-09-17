import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApprovalBroker } from "./broker.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ApprovalBroker", () => {
  it("resolves 'approved' when resolve() is called with approved before timeout", async () => {
    const broker = new ApprovalBroker(1000);
    const promise = broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    const [pending] = broker.list();
    const resolved = broker.resolve(pending.id, "approved");
    expect(resolved).toBe(true);
    await expect(promise).resolves.toBe("approved");
  });

  it("resolves 'denied' when resolve() is called with denied", async () => {
    const broker = new ApprovalBroker(1000);
    const promise = broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    const [pending] = broker.list();
    broker.resolve(pending.id, "denied");
    await expect(promise).resolves.toBe("denied");
  });

  it("resolves 'timeout' automatically after timeoutMs with no response", async () => {
    const broker = new ApprovalBroker(1000);
    const promise = broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBe("timeout");
  });

  it("resolve() returns false for an unknown or already-resolved id", () => {
    const broker = new ApprovalBroker(1000);
    expect(broker.resolve("nonexistent", "approved")).toBe(false);
  });

  it("resolve() a second time on the same id returns false", () => {
    const broker = new ApprovalBroker(1000);
    broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    const [pending] = broker.list();
    expect(broker.resolve(pending.id, "approved")).toBe(true);
    expect(broker.resolve(pending.id, "denied")).toBe(false);
  });

  it("onPending listeners fire synchronously when a request is made", () => {
    const broker = new ApprovalBroker(1000);
    const listener = vi.fn();
    broker.onPending(listener);
    broker.requestApproval({ server: "fs", tool: "write_file", args: { path: "/x" }, reason: "ask" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ server: "fs", tool: "write_file" });
  });

  it("list() no longer includes an approval once resolved", () => {
    const broker = new ApprovalBroker(1000);
    broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    const [pending] = broker.list();
    broker.resolve(pending.id, "approved");
    expect(broker.list()).toHaveLength(0);
  });
});
