import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

function respond(id: unknown, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);
  if (msg.method === "initialize") {
    respond(msg.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake-server", version: "0.0.1" } });
  } else if (msg.method === "tools/list") {
    respond(msg.id, {
      tools: [
        { name: "echo", description: "Echoes input", inputSchema: { type: "object" } },
        { name: "delete_all", description: "Deletes everything", inputSchema: { type: "object" } },
      ],
    });
  } else if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params ?? {};
    respond(msg.id, { content: [{ type: "text", text: `called ${name} with ${JSON.stringify(args)}` }] });
  }
});
