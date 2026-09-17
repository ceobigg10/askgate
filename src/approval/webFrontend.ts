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
<head><title>askgate</title></head>
<body>
<h1>askgate pending approvals</h1>
<ul id="pending"></ul>
<script>
const list = document.getElementById("pending");
function render(items) {
  list.innerHTML = "";
  for (const p of items) {
    const li = document.createElement("li");
    li.textContent = p.server + " / " + p.tool + " - " + JSON.stringify(p.args) + " ";
    const approve = document.createElement("button");
    approve.textContent = "Approve";
    approve.onclick = () => fetch("/approve/" + p.id, { method: "POST" }).then(() => li.remove());
    const deny = document.createElement("button");
    deny.textContent = "Deny";
    deny.onclick = () => fetch("/deny/" + p.id, { method: "POST" }).then(() => li.remove());
    li.appendChild(approve);
    li.appendChild(deny);
    list.appendChild(li);
  }
}
fetch("/pending").then((r) => r.json()).then(render);
const source = new EventSource("/events");
source.onmessage = () => fetch("/pending").then((r) => r.json()).then(render);
</script>
</body>
</html>`;
