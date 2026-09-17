import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { ApprovalBroker } from "./broker.js";
import { attachCliFrontend } from "./cliFrontend.js";

describe("attachCliFrontend", () => {
  it("prints the pending call and resolves approved on 'y'", async () => {
    const broker = new ApprovalBroker(5000);
    const input = new PassThrough();
    const output = new PassThrough();
    let printed = "";
    output.on("data", (c) => (printed += c.toString()));
    attachCliFrontend(broker, input, output);

    const promise = broker.requestApproval({ server: "fs", tool: "write_file", args: { path: "/tmp/x" }, reason: "ask" });
    input.write("y\n");

    await expect(promise).resolves.toBe("approved");
    expect(printed).toContain("fs");
    expect(printed).toContain("write_file");
  });

  it("resolves denied on any non-'y' answer", async () => {
    const broker = new ApprovalBroker(5000);
    const input = new PassThrough();
    const output = new PassThrough();
    attachCliFrontend(broker, input, output);

    const promise = broker.requestApproval({ server: "fs", tool: "delete_all", args: {}, reason: "ask" });
    input.write("n\n");

    await expect(promise).resolves.toBe("denied");
  });
});
