# MCP Security Engineer — Learning Context

## Why this exists

Model Context Protocol (MCP) adoption is scaling faster than the tooling to govern it: agents now get wired directly into filesystems, databases, GitHub orgs, and payment systems via MCP servers, mostly with no permission layer, no audit trail, and no human checkpoint on risky calls. "AI/Agentic Security Engineer" and "LLM Security Engineer" are among the fastest-growing titles in the current job market precisely because that gap is real and mostly unfilled. This document is the learning context behind **`mcp-guard`**, an MCP permission firewall built as the capstone project for developing that skill set hands-on rather than just reading about it.

## The capstone: `mcp-guard`

A CLI tool that wraps any real stdio MCP server and sits between it and an MCP client (Claude Desktop, Claude Code, etc.), enforcing a YAML policy that auto-allows safe tool calls, auto-denies dangerous ones, and routes risky ones to a human for approval (terminal or local web dashboard), with every decision written to an audit log. See the design spec for full architecture once it's written to `docs/superpowers/specs/`.

Building it end to end forces contact with every core MCP security concept below — not just reading about them.

## Core vocabulary / threat concepts

- **Confused deputy problem** — an agent with legitimate access to a resource is tricked (via a malicious tool result, a crafted prompt, or a compromised downstream server) into misusing that access on the attacker's behalf. This is the central risk `mcp-guard`'s policy engine exists to contain.
- **Tool poisoning** — a malicious or compromised MCP server describes its tools (names, descriptions, schemas) in a way designed to manipulate the calling LLM into invoking them incorrectly or into leaking data through arguments.
- **Rug pull** — a server behaves safely when a human reviews/approves it, then changes behavior later (different tool implementation, new capability) without re-review. Argues for policy rules that pin behavior, not just server identity.
- **Tool shadowing / name collision** — two servers exposing tools with the same or confusingly similar names, used to redirect a call to an unintended, less-trusted implementation.
- **Excessive permission / least privilege violation** — a tool call is technically valid but broader than the task needs (e.g., a "read one file" agent request reaching a `delete_repo` tool). This is what allow/deny/ask rules keyed on tool + argument patterns are for.
- **Prompt injection via tool results** — untrusted content returned by a tool (a file's contents, a web page, a DB row) contains instructions that hijack the agent's subsequent behavior. Out of scope for `mcp-guard` v1 (it governs which calls happen, not content returned), but worth knowing as the adjacent risk.
- **Supply chain risk** — the MCP server binary/package itself is compromised or malicious. `mcp-guard` doesn't vet server code; it limits blast radius by policy regardless of what the server does.
- **Audit trail / non-repudiation** — every consequential action must be attributable and reviewable after the fact — the reason `mcp-guard` logs every decision, not just denials.

## 8-week curriculum

**Week 1 — MCP protocol fundamentals.** Read the MCP spec (initialize, tools/list, tools/call, resources, prompts, sampling). Build a trivial MCP server and a trivial client by hand to see the JSON-RPC-over-stdio exchange directly, no SDK abstractions.

**Week 2 — Real-world MCP usage.** Configure and use 2-3 existing MCP servers (filesystem, GitHub, a DB) inside a real client. Note exactly what each tool call looks like on the wire — this becomes the fixture data for `mcp-guard`'s tests.

**Week 3 — Threat modeling agentic systems.** Work through the threat concepts above against the servers from Week 2: for each tool, what's the worst plausible misuse? Write these up as candidate policy rules — this becomes `mcp-guard`'s first `policy.yaml`.

**Week 4 — Policy engine design.** Build the rule-matching core (server + tool + argument pattern → allow/deny/ask, first-match-wins, fail-safe default). Unit test precedence and edge cases before wiring it to anything live.

**Week 5 — The proxy core.** Build the stdio-to-stdio relay: spawn a downstream server, forward everything transparently, then intercept `tools/call` and route through the Week 4 policy engine.

**Week 6 — Human-in-the-loop approval.** Add the CLI approval prompt, then the local web dashboard (SSE-pushed pending approvals), with a shared queue and a timeout-as-deny fallback.

**Week 7 — Audit logging & observability.** JSONL audit log with redaction for sensitive argument fields; a log viewer in the dashboard. Practice reading the log to reconstruct "what did this agent actually do" after a test run.

**Week 8 — Hardening, testing, packaging.** Integration tests against a fake MCP server fixture covering allow/deny/ask/timeout paths. Write up the project (README, architecture doc, threat model) as a portfolio piece — this is the artifact that demonstrates the skill to an employer, not just the code.

## References worth pulling up while building

- Anthropic's Model Context Protocol specification (protocol methods, transports, lifecycle).
- OWASP Top 10 for LLM Applications (excessive agency, insecure plugin design map directly onto the threat concepts above).
- Anthropic / MCP community write-ups on tool poisoning and rug-pull attacks against MCP servers, for concrete historical examples rather than hypotheticals.

## Status

This context doc was drafted at project kickoff. The formal design spec for `mcp-guard` (architecture, components, data flow, testing plan) is being brainstormed separately and will live at `docs/superpowers/specs/` once approved.
