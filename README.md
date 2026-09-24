# Codex RSI

A local [Codex plugin](https://developers.openai.com/plugins/build/plugins) with a stdio MCP server and eleven skills. It adapts the memory, revision-bound plans, policy, RSI and graph-only GitNexus implementation from [`omp-rsi`](https://github.com/marvin-marbell/omp-rsi) at commit `0f27ca6e21985e03fe44b6bb838e425228462d13`. The core is pinned to an immutable public archive with an integrity-checked npm lockfile. No OMP process or plugin installation is modified.

## Install

Requires Codex CLI with local plugin support, Node.js 22+, Python 3.10+, Git and npm on a POSIX host. The memory backend installer can provision its private Python CLI, ripgrep and graph-only GitNexus explicitly; the Node MCP dependencies are a separate install step. This repository is a local marketplace, not a published remote plugin.

```sh
npm ci --ignore-scripts
codex plugin marketplace add /absolute/path/to/codex-rsi
codex plugin add codex-rsi@codex-rsi-local --json
```

The last command prints `installedPath`. **Codex copies the plugin without `node_modules`**, so install the locked Node dependencies in the *printed installed path* before starting or resuming a Codex session:

```sh
npm ci --prefix /the/printed/installedPath --ignore-scripts
```

Restart or resume Codex after installation: an already-running session does not acquire new plugin tools or skills. Confirm `codex-rsi:memory-workflow` appears in the skill catalog and call `codex-rsi.memory_setup` with `{"action":"status"}`. Installing a plugin is not proof that its MCP server or memory backend is ready. The eleven skills live under `skills/`; ten preserve the managed workflow names and `memory-workflow` describes the Codex RSI tool sequence.

To update a local installation, remove and re-add the plugin (the installed copy is separate from the source checkout), reinstall locked Node dependencies in the new `installedPath`, and reopen Codex. Keep the plugin's writable data directory when updating; it contains operator configuration and optionally local memory/runtime, not repository assets.

## Memory and operator configuration

With no configuration, the server selects `${PLUGIN_DATA}/memory` and `${PLUGIN_DATA}/runtime` without creating either on startup. `memory_setup` status is read-only. To use an existing memory store, create `${PLUGIN_DATA}/config.json` **outside the repository** before starting a Codex session. `memory_setup` status reports the exact plugin data directory through its `base` and `runtimeDir` defaults. Example paths below are placeholders, not an automatic OMP import:

```json
{
  "memoryBase": "/absolute/operator-selected/memory",
  "memoryBin": "/absolute/operator-selected/bin/memory",
  "pythonBin": "/absolute/operator-selected/bin/python",
  "gitnexusBin": "/absolute/operator-selected/bin/gitnexus",
  "agentId": "selected-agent"
}
```

`memoryBase` selects storage; `agentId` selects its private namespace. Other allowlisted settings include `runtimeDir`, `gitnexusHome`, `instructionFiles` and bounded timeouts. The file must be regular JSON of at most 64 KiB, with no symlink at its final path. An operator can instead select an absolute `CODEX_RSI_CONFIG` file or override the base with absolute `CODEX_RSI_BASE` in the Codex process environment. Restart Codex after changing startup configuration. No credential or private memory body belongs in this repository or plugin settings.

For a new installation, check `memory_setup` status, explicitly install the backend, then initialize the chosen storage and check status again. Backend installation and applying an import or instruction sync require the **operator's Codex process environment** `CODEX_RSI_SETUP_APPROVED=true` in addition to an explicit tool action; tool arguments and repository-local files cannot supply this gate. Existing compatible executables can be selected by absolute path instead. Migration previews selected Markdown first and applies only with its reviewed preview and expected revision. Instruction sync applies only to an operator-configured `instructionFiles` allowlist after preview and revision checks. No import, global instruction edit or network setup occurs merely by loading the plugin.

The MCP tools are `memory_setup`, `memory_ls`, `memory_toc`, `memory_section`, `memory_search`, `memory_grep`, `memory_validate`, `memory_log`, `memory_new`, `memory_update`, `memory_init`, `memory_sync`, `memory_clone`, `memory_cache`, `memory_plan`, `memory_policy`, `memory_rsi` and `gitnexus`. Check the exposed tool schema for action-specific JSON requests. Codex may request tool approval according to the user's plugin policy; a noninteractive session with approvals disabled can refuse a tool without executing it.

## Host boundaries and RSI

The plan and policy stores remain revision-bound. Codex MCP has no authenticated host session identity, so `memory_plan` bind/unbind and implicit current-plan restoration are unavailable: pass an explicit `plan_id` on every read/update, read the latest revision, and pass plan ID, revision, pinned template and scoped work items to delegates. No session binding is fabricated. `memory_rsi` observe/clear_signals need OMP session telemetry and fail closed here; explicit review/retrieval observations and local reflection remain available. Automatic instruction capture cannot see a Codex system/developer prompt or active skill catalog. Audit only exact operator-selected sources, and report omissions; a local snapshot with remote assessment disabled is not a semantic verdict.

TypeSafe is **disabled by default**. Remote assessment requires `CODEX_RSI_TYPESAFE_ENABLED=true` in the operator's Codex process environment plus the configured credential environment reference. Neither a project file, tool argument nor the private JSON configuration can enable it. Preview exact projection units before mining; a score, policy proposal or audit never grants permission or auto-promotes a policy. `gitnexus` is pinned graph-only: analyze the explicitly selected repository before querying; doctor alone does not establish an index. No embeddings or semantic fallback.

## Verify

```sh
npm ci --ignore-scripts
npm test
```

The suite starts the actual stdio MCP server and exercises selected-store initialization, entry retrieval, plan revision persistence, local audit receipt, graph-only doctor and fail-closed transitions. For consumer acceptance, check the **installed** copy (not just this checkout) in a fresh Codex session: skill discovery, `memory_setup` status, search/plan read, `memory_rsi` status and graph doctor; exercise a selected repository's graph if needed. Never infer backend readiness, indexing or installed revision from marketplace presence alone.
