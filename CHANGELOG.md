# Changelog

## 0.1.2 — Unreleased candidate

- Add a human-only, hidden-input TypeSafe credential setup command; a private plugin-data key enables new Codex sessions without exporting it again. Explicit process `false` still disables remote assessment.
- Bundle Codex lifecycle hooks for bounded session signals and session plan binding, gated on a hook-minted capability. Codex CLI 0.156.1 did not load these hooks in an installed session; these paths remain unverified in the consumer runtime.
- Automatic full-source instruction audit is still blocked by Codex's unavailable effective prompt/active skill catalog API. This candidate is not RSI feature parity.

## 0.1.1 — 2026-09-24

- Remove the OMP-only `omp-rsi-dogfooding` skill from the Codex catalog; retain nine reusable managed skills and `memory-workflow`.

## 0.1.0 — 2026-09-24

- Add a portable Codex plugin with an installed stdio MCP adapter for pinned OMP RSI memory, revision-bound plans and policy, local RSI actions and graph-only GitNexus.
- Port ten managed decision/workflow skills and add a Codex-specific memory workflow skill.
- Keep storage selection in private operator configuration; default to Codex plugin data without startup mutation or implicit import.
- Fail closed for OMP-only session bindings, telemetry and automatic instruction discovery; gate backend install, migration apply and instruction sync apply behind explicit operator process approval. Keep TypeSafe remote assessment opt-in.
- Exercise the MCP protocol, selected memory store, plan readback, policy, audit receipt, graph doctor and forbidden transitions with isolated runtime tests.
