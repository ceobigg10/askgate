# mcp-guard — Design Spec

**Date:** 2026-09-17
**Status:** Approved
**Type:** Personal learning project (portfolio-quality, not a client deliverable)

## One-line pitch

A CLI tool that wraps any real MCP server, sits between it and an MCP client (Claude Desktop, Claude Code, etc.), and enforces a YAML policy that auto-allows safe tool calls, auto-denies dangerous ones, and pauses risky ones for human approval — via terminal or a local web dashboard — with a full audit log of every decision.

## Motivation

MCP adoption is scaling faster than the tooling to govern it — agents get wired directly into filesystems, databases, and APIs via MCP servers with no permission layer, no audit trail, and no human checkpoint on risky calls. "Agentic/LLM Security Engineer" is one of the fastest-growing titles in the current job market for exactly this reason. This project is a hands-on vehicle for learning that skill set (see `MCP_SECURITY_ENGINEER_CONTEXT.md` for the full curriculum this project anchors), built as a real, demoable tool rather than a toy.

## Architecture

- **Language/runtime:** TypeScript on Node 20.
- **Transport:** stdio-only on both sides. The gateway speaks MCP-over-stdio to the calling client, and spawns the real MCP server as a child process, speaking MCP-over-stdio to it.
- **Topology:** one gateway instance wraps exactly one downstream server. This mirrors how MCP client configs already list servers individually, so wrapping is a drop-in replacement:
  ```
  command: mcp-guard
  args: [--policy, policy.yaml, --, <real server command>, <real server args...>]
  ```
- **Explicitly out of scope for v1:** remote/SSE downstream servers, multi-server aggregation in one gateway instance. These add transport and multi-tenancy complexity without teaching the core lesson (interception + policy + approval + audit).

## Components

### 1. Proxy core
Relays `initialize`, `tools/list`, `resources/list`, and all other MCP methods transparently between client and downstream server. Intercepts every `tools/call` and routes it through the policy engine before deciding whether to forward it.

### 2. Policy engine
Loads `policy.yaml` at startup and hot-reloads on file change (via file watch). Each rule matches:
- `server` — label of the wrapped server (from gateway config, not the process name)
- `tool` — exact name or regex
- `argsMatch` (optional) — simple JSON-path/regex conditions against call arguments

→ resolves to an action: `allow | deny | ask`.

Rules are evaluated in file order; **first match wins**. If no rule matches, the default action is `ask` (fail-safe — never silently allow the unknown).

### 3. Approval broker
Activates when the resolved action is `ask`. Blocks that specific tool call and raises a pending approval on a shared in-memory queue. Two front-ends, selected by `approval.mode: cli | web | both` in config:

- **CLI:** prints the pending call (server, tool, args, matched rule or "no rule matched") to stdout and blocks reading a y/n from stdin.
- **Web:** a localhost-only Express server pushes pending approvals to a browser page via Server-Sent Events; Approve/Deny buttons resolve them.

Whichever front-end responds first resolves the approval; the other is notified it's no longer pending. A configurable timeout (default 120s) auto-denies and is logged as a distinct `timeout-deny` outcome, separate from an explicit human deny.

### 4. Audit logger
Every decision — `allow`, `deny`, `ask→allow`, `ask→deny`, `timeout-deny` — is appended as one JSON line to `audit.log`, containing: timestamp, server label, tool name, arguments (redacted per a configurable list of key-name regexes, e.g. `password|token|secret|key`), matched rule (or "none"), decision, and call latency. The web dashboard includes a read-only, tailing log viewer.

## Data flow

```
Client → gateway receives tools/call
       → policy engine evaluates (server, tool, args) against policy.yaml
       → allow  → forward to downstream server → relay response to client
       → deny   → return MCP error to client immediately, no downstream call
       → ask    → enqueue approval → block →
                    human responds (CLI or web) → allow/deny path above
                    OR timeout elapses → treated as deny
       → audit logger writes one record for every branch above
```

## Error handling

- **Downstream server crash/exit:** gateway surfaces an MCP error to the client for any in-flight call and exits non-zero itself — no silent hangs.
- **Malformed `policy.yaml`:** fail fast at startup with a clear parse/validation error. The gateway never starts proxying under an undefined or partially-loaded policy.
- **Approval timeout:** treated as deny, logged as `timeout-deny` so post-hoc analysis can distinguish "a human said no" from "nobody was watching."

## Testing plan

- **Unit tests — policy engine:** rule-matching precedence (first-match-wins), exact vs. regex tool matching, `argsMatch` conditions, default-to-`ask` on no match, malformed-policy rejection.
- **Integration tests:** a minimal fake MCP server fixture (a handful of mock tools) driven through the real gateway process, exercising allow / deny / ask-then-approve / ask-then-deny / ask-then-timeout paths, asserting on both the client-visible response and the resulting audit log entries.

## Scope cuts (YAGNI for this learning project)

- No auth on the web dashboard — localhost-only, single local user.
- No persistent policy editing UI — `policy.yaml` is the sole source of truth, hand-edited.
- No remote/SSE transport, no multi-server aggregation per gateway instance.
- No content-level defenses (e.g., prompt-injection scanning of tool results) — this project governs *which calls happen*, not what data flows back.

## Project layout

```
mcp-guard/
├── MCP_SECURITY_ENGINEER_CONTEXT.md   # learning context + 8-week curriculum
├── docs/superpowers/specs/            # this file
├── src/                                # gateway implementation (TypeScript)
├── policy.yaml                         # example/default policy
└── package.json
```
