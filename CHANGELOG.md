# Changelog

## 0.1.1 — 2026-09-24

- Remove the OMP-only `omp-rsi-dogfooding` skill from the Codex catalog; retain nine reusable managed skills and `memory-workflow`.

## 0.1.0 — 2026-09-24

- Add a portable Codex plugin with an installed stdio MCP adapter for pinned OMP RSI memory, revision-bound plans and policy, local RSI actions and graph-only GitNexus.
- Port ten managed decision/workflow skills and add a Codex-specific memory workflow skill.
- Keep storage selection in private operator configuration; default to Codex plugin data without startup mutation or implicit import.
- Fail closed for OMP-only session bindings, telemetry and automatic instruction discovery; gate backend install, migration apply and instruction sync apply behind explicit operator process approval. Keep TypeSafe remote assessment opt-in.
- Exercise the MCP protocol, selected memory store, plan readback, policy, audit receipt, graph doctor and forbidden transitions with isolated runtime tests.
