import { describe, it, expect, afterEach } from "vitest";
import type { Server } from "node:http";
import { ApprovalBroker } from "./broker.js";
import { createWebFrontend } from "./webFrontend.js";

let server: Server;

afterEach(() => {
  server?.close();
});

function listen(app: ReturnType<typeof createWebFrontend>): Promise<number> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

describe("web approval frontend", () => {
  it("GET /pending starts empty", async () => {
    const broker = new ApprovalBroker(5000);
    const port = await listen(createWebFrontend(broker));
    const res = await fetch(`http://localhost:${port}/pending`);
    expect(await res.json()).toEqual([]);
  });

  it("a requested approval appears in /pending and POST /approve resolves it", async () => {
    const broker = new ApprovalBroker(5000);
    const port = await listen(createWebFrontend(broker));

    const promise = broker.requestApproval({ server: "fs", tool: "write_file", args: {}, reason: "ask" });
    const pendingList = await (await fetch(`http://localhost:${port}/pending`)).json();
    expect(pendingList).toHaveLength(1);

    const approveRes = await fetch(`http://localhost:${port}/approve/${pendingList[0].id}`, { method: "POST" });
    expect(approveRes.status).toBe(200);
    await expect(promise).resolves.toBe("approved");

    const afterList = await (await fetch(`http://localhost:${port}/pending`)).json();
    expect(afterList).toHaveLength(0);
  });

  it("POST /deny/:id resolves the approval as denied", async () => {
    const broker = new ApprovalBroker(5000);
    const port = await listen(createWebFrontend(broker));

    const promise = broker.requestApproval({ server: "fs", tool: "delete_all", args: {}, reason: "ask" });
    const [pending] = await (await fetch(`http://localhost:${port}/pending`)).json();

    const denyRes = await fetch(`http://localhost:${port}/deny/${pending.id}`, { method: "POST" });
    expect(denyRes.status).toBe(200);
    await expect(promise).resolves.toBe("denied");
  });

  it("POST /approve/:id on an unknown id returns 404", async () => {
    const broker = new ApprovalBroker(5000);
    const port = await listen(createWebFrontend(broker));
    const res = await fetch(`http://localhost:${port}/approve/does-not-exist`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
