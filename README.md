# askgate

*(formerly prototyped as "mcp-guard" — renamed 2026-09-18; that name is already used by several other MCP security projects)*

An MCP permission firewall. Wraps any real stdio MCP server and enforces a YAML policy — auto-allow safe tool calls, auto-deny dangerous ones, and pause risky ones for human approval (CLI or web) — with every decision written to an audit log.

## Quick start

    npm install
    npm run dev -- --policy policy.yaml --approval-mode both -- npx tsx fixtures/fakeServer.ts

Point your MCP client at this command instead of the real server directly; askgate spawns it for you and mediates every `tools/call`.

## Policy format (`policy.yaml`)

    defaultAction: ask   # allow | deny | ask — used when no rule matches

    rules:
      - tool: read_file          # exact match
        action: allow
      - tool: "/^write_.*/"      # regex match (leading/trailing slashes)
        argsMatch:
          path: "^/etc/"         # all argsMatch keys must match to apply
        action: deny
      - server: github           # optional: scope a rule to one server label
        tool: delete_repo
        action: deny

Rules are evaluated top to bottom; the first match wins.

## Approval modes

- `--approval-mode cli` — prompts y/N on the controlling terminal (`/dev/tty`), never on the gateway's own stdin/stdout (those carry MCP protocol traffic).
- `--approval-mode web` — serves a dashboard at `http://localhost:<port>` (default 4390) to approve/deny pending calls.
- `--approval-mode both` — runs both front-ends against the same approval queue.

An unresolved approval auto-denies after `--approval-timeout-ms` (default 120000) and is logged as `timeout-deny`, distinct from an explicit human denial.

## Audit log

Every decision is appended as one JSON line to `--audit-log` (default `audit.log`): timestamp, server, tool, redacted args, matched rule, decision, latency.

## Development

    npm test    # vitest — unit tests per module plus end-to-end integration tests
    npm run build

See `docs/superpowers/specs/2026-09-17-askgate-design.md` for the full design, and `MCP_SECURITY_ENGINEER_CONTEXT.md` for the learning context this project anchors.
