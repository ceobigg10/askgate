import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ApprovalBroker, PendingApproval } from "./broker.js";

export function attachCliFrontend(broker: ApprovalBroker, input: Readable, output: Writable): void {
  const rl = createInterface({ input, output });
  broker.onPending((approval: PendingApproval) => {
    output.write(
      `\n[askgate] Approval required: server=${approval.server} tool=${approval.tool} ` +
        `args=${JSON.stringify(approval.args)} reason="${approval.reason}"\n`
    );
    rl.question("Approve? [y/N] ", (answer) => {
      broker.resolve(approval.id, answer.trim().toLowerCase() === "y" ? "approved" : "denied");
    });
  });
}
