import express, { type Express, type Response } from "express";
import type { ApprovalBroker, PendingApproval } from "./broker.js";

export function createWebFrontend(broker: ApprovalBroker): Express {
  const app = express();
  const sseClients: Response[] = [];

  broker.onPending((approval: PendingApproval) => {
    const payload = `data: ${JSON.stringify(approval)}\n\n`;
    for (const res of sseClients) res.write(payload);
  });

  app.get("/pending", (_req, res) => {
    res.json(broker.list());
  });

  app.get("/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":ok\n\n");
    sseClients.push(res);
    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  app.post("/approve/:id", (req, res) => {
    res.status(broker.resolve(req.params.id, "approved") ? 200 : 404).json({});
  });

  app.post("/deny/:id", (req, res) => {
    res.status(broker.resolve(req.params.id, "denied") ? 200 : 404).json({});
  });

  app.get("/", (_req, res) => {
    res.type("html").send(DASHBOARD_HTML);
  });

  return app;
}

const DASHBOARD_HTML = `<!doctype html>
<html>
<head>
<title>askgate</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111; }
  h1 { font-size: 22px; }
  p.intro { color: #444; line-height: 1.5; }
  ul#pending { list-style: none; padding: 0; }
  li { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  li .desc { font-family: monospace; font-size: 13px; word-break: break-word; }
  button { cursor: pointer; border-radius: 6px; border: 1px solid #ccc; padding: 6px 12px; margin-left: 6px; }
  button.approve { background: #16a34a; color: white; border: none; }
  button.deny { background: #dc2626; color: white; border: none; }
  p.empty { color: #888; font-style: italic; }
</style>
</head>
<body>
<h1>askgate — pending tool-call approvals</h1>
<p class="intro">askgate sits in front of an MCP server and checks every tool call against a policy: some are auto-allowed, some auto-blocked, and the rest land here for a human to approve or deny. This page is a live demo — calls below are simulated, not real actions against real systems.</p>
<p class="empty" id="empty-state">No pending approvals right now — check back shortly, or it may have just been decided.</p>
<ul id="pending"></ul>
<script>
const list = document.getElementById("pending");
const emptyState = document.getElementById("empty-state");
function render(items) {
  list.innerHTML = "";
  emptyState.style.display = items.length === 0 ? "block" : "none";
  for (const p of items) {
    const li = document.createElement("li");
    const desc = document.createElement("span");
    desc.className = "desc";
    desc.textContent = p.server + " / " + p.tool + " " + JSON.stringify(p.args);
    const buttons = document.createElement("span");
    const approve = document.createElement("button");
    approve.className = "approve";
    approve.textContent = "Approve";
    approve.onclick = () => fetch("/approve/" + p.id, { method: "POST" }).then(() => li.remove());
    const deny = document.createElement("button");
    deny.className = "deny";
    deny.textContent = "Deny";
    deny.onclick = () => fetch("/deny/" + p.id, { method: "POST" }).then(() => li.remove());
    buttons.appendChild(approve);
    buttons.appendChild(deny);
    li.appendChild(desc);
    li.appendChild(buttons);
    list.appendChild(li);
  }
}
fetch("/pending").then((r) => r.json()).then(render);
const source = new EventSource("/events");
source.onmessage = () => fetch("/pending").then((r) => r.json()).then(render);
</script>
</body>
</html>`;
