# Codex RSI

A local [Codex plugin](https://developers.openai.com/plugins/build/plugins) with a stdio MCP server and ten skills. It adapts the memory, revision-bound plans, policy, RSI and graph-only GitNexus implementation from [`omp-rsi`](https://github.com/marvin-marbell/omp-rsi) at commit `0f27ca6e21985e03fe44b6bb838e425228462d13`. The core is pinned to an immutable public archive with an integrity-checked npm lockfile. **This is not yet a complete RSI parity port:** Codex does not expose the complete effective system/developer prompt or active skill catalog to the plugin, so automatic full-source instruction audit cannot run. No OMP process or plugin installation is modified.

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

Restart or resume Codex after installation: an already-running session does not acquire new plugin tools or skills. Confirm `codex-rsi:memory-workflow` appears in the skill catalog and call `codex-rsi.memory_setup` with `{"action":"status"}`. Installing a plugin is not proof that its MCP server or memory backend is ready. The ten skills live under `skills/`: nine portable managed workflows and the Codex-specific `memory-workflow`. The OMP-only self-test skill is intentionally excluded.

To update a local installation, remove and re-add the plugin (the installed copy is separate from the source checkout), reinstall locked Node dependencies in the new `installedPath`, and reopen Codex. Keep the plugin's writable data directory when updating; it contains operator configuration and optionally local memory/runtime, not repository assets.

## Memory and operator configuration

With no configuration, the server selects `${PLUGIN_DATA}/memory` and `${PLUGIN_DATA}/runtime` without creating either on startup. `memory_setup` status is read-only and reports the actual `pluginData` directory even when memory paths are customized. To use an existing memory store, create `${PLUGIN_DATA}/config.json` **outside the repository** before starting a Codex session. Example paths below are placeholders, not an automatic OMP import:

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

The plan and policy stores remain revision-bound. Bundled `SessionStart`, `PostToolUse` and `SessionEnd` hooks can supply a host-origin session capability and bounded local tool-result signals without arguments, responses, prompts or transcript bodies **only when the installed Codex host actually loads and the human trusts those hooks**. Pass the hook capability as `session_token` to `memory_rsi` `observe`, `clear_signals` or `status`, or to `memory_plan` `bind`/`unbind`; a Codex session plan lives in private plugin data, not an OMP branch. Without the host hook or token these actions fail closed. **Observed blocker:** Codex CLI 0.156.1 on the test host did not run bundled plugin hooks in a fresh installed session even with hook-trust bypass; a disposable user-level SessionStart hook did run. The exact plugin discovery failure is unconfirmed. Codex does not expose a complete effective system/developer prompt or active skill catalog to this plugin; automatic full-source audit is unavailable. Audit exact operator-selected sources and report omissions; no selected-file audit or TypeSafe assessment implies full coverage or permission.
The hook token is a bearer selector, **not proof that the MCP caller is the originating Codex session**. A copied token can select a previous session until SessionEnd removes it; abrupt exits may leave stale tokens. Do not use the hook binding as an authorization boundary for private material or claim OMP's authenticated current-session semantics.

TypeSafe is **disabled by default**. To enable it persistently, a human first reads `pluginData` from the installed `memory_setup` status, then runs `node /the/printed/installedPath/server/configure-typesafe.js /absolute/pluginData` in a terminal. The command explains remote disclosure, requires typing `yes`, reads the key without echo and atomically creates a private `typesafe.key` outside the plugin/repository with mode 0600. **Do not give the key to an agent, put it in MCP arguments, or add it to config.json.** Restart Codex: the private key file activates TypeSafe in each new session without exporting the key or an enable flag. `memory_rsi` status shows `enabled` and `configured` but never returns the key. Remove the file and restart Codex to disable it, or set `CODEX_RSI_TYPESAFE_ENABLED=false` in the operator process environment to veto activation. Existing explicit process opt-in (`CODEX_RSI_TYPESAFE_ENABLED=true` plus `TYPESAFE_API_KEY`) remains supported; neither JSON settings nor repository files can enable remote disclosure. The file must be owned by the server user, regular, not a symlink and unreadable by group/others; invalid files fail startup. Preview exact projection units before mining; a score, policy proposal or audit never grants permission or auto-promotes a policy. `gitnexus` is pinned graph-only: analyze the explicitly selected repository before querying; doctor alone does not establish an index. No embeddings or semantic fallback.

## Explicit user hook fallback

On Codex CLI 0.156.1, a human can opt in to user-level hooks when bundled plugin hooks are not loaded. Read `pluginData` from the **installed** `memory_setup` status; it may differ from the directory used for TypeSafe setup. Run `node /the/printed/installedPath/server/configure-hooks.js /absolute/pluginData` in a human terminal. This creates `~/.codex/hooks.json` (or `$CODEX_HOME/hooks.json`) only if it does not already exist; existing hooks are never overwritten. It binds the installed hook script to the exact plugin data path. These hooks run for **every Codex session** of that user, not just sessions using this plugin. The setup explains this scope, requires typing `yes`, and does not itself trust or activate hooks. Restart Codex, review the three user hooks with `/hooks`, and trust their exact commands. If a hooks file already exists, merge the bundled definitions manually with explicit `PLUGIN_DATA` and installed script paths, then review the merged hooks. Updating the installed plugin path may require reviewing and updating those commands. Never bypass hook trust for normal use.
The setup refuses a group- or world-writable Codex home or plugin data directory because bearer tokens must not be created there. Inspect ownership and permissions first; if appropriate for your machine, tighten them explicitly (for example `chmod go-w ~/.codex /absolute/pluginData`) and rerun. The script does not change existing directory permissions.

A successful SessionStart displays a `Codex RSI local session capability` in that session's developer context; pass that token to `memory_rsi` `status` and `observe`, and check subsequent PostToolUse counts after a real tool action. `memory_rsi status` **without** `session_token` reports `invalid-session` even if the hook did run; it is not an activation test. TypeSafe working does not establish hook activation. Hook tokens are local bearer selectors, not current-caller authentication, and the fallback does not supply missing effective prompt or skill-catalog data.

## Verify

```sh
npm ci --ignore-scripts
npm test
```

The suite starts the actual stdio MCP server and exercises selected-store initialization, entry retrieval, plan revision persistence, simulated hook signal projection, local audit receipt, graph-only doctor and fail-closed transitions. For consumer acceptance, check the **installed** copy (not just this checkout) in a fresh Codex session: skill discovery, `/hooks` trust, visible SessionStart capability, `memory_setup` status, token-selected plan, `memory_rsi` status/observe after a real tool action, search/plan read and graph doctor. A status call without `session_token` returns `invalid-session` by design; it neither proves nor disproves hook activation. No installed-session claim follows from source-only tests.
