import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const plugin = resolve(import.meta.dirname, "..");
const memoryModule = join(plugin, "node_modules", "omp-rsi", "cli", "src");

async function fixture(t, extra = {}, directory = mkdtempSync(join(tmpdir(), "codex-rsi-mcp-"))) {
  const base = join(directory, "selected-memory");
  const config = join(directory, "config.json");
  writeFileSync(config, JSON.stringify({ memoryBase: base, memoryBin: join(directory, "missing-memory-bin"), pythonBin: "python3" }), { mode: 0o600 });
  const client = new Client({ name: "runtime-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(plugin, "server", "index.js")], cwd: directory,
    env: {
      PLUGIN_DATA: directory, PYTHONPATH: memoryModule,
      HOME: homedir(), ...extra,
    },
  });
  t.after(async () => { await client.close(); rmSync(directory, { recursive: true, force: true }); });
  await client.connect(transport);
  const call = async (name, args) => client.callTool({ name, arguments: args });
  return { directory, base, client, call };
}

function result(call) {
  assert.equal(call.isError, undefined, call.content?.[0]?.text);
  return JSON.parse(call.content[0].text);
}

function rejected(call, pattern) {
  assert.equal(call.isError, true, "expected a real MCP error, not a successful warning");
  assert.match(call.content[0].text, pattern);
}

test("initialize/list/call use the selected base and revision-bound Python plan store", async t => {
  const { base, client, call } = await fixture(t);
  const tools = (await client.listTools()).tools;
  const names = new Set(tools.map(tool => tool.name));
  for (const name of ["memory_setup", "memory_ls", "memory_toc", "memory_section", "memory_search", "memory_grep", "memory_validate", "memory_log", "memory_new", "memory_update", "memory_init", "memory_sync", "memory_clone", "memory_cache", "memory_plan", "memory_policy", "memory_rsi", "gitnexus"]) {
    assert.ok(names.has(name), `${name} absent from tools/list`);
  }
  assert.equal(existsSync(base), false, "status must not initialize storage");
  assert.equal((result(await call("memory_setup", { action: "status" }))).base, base);
  assert.equal(existsSync(base), false, "status must remain read-only");
  const initialized = result(await call("memory_setup", { action: "initialize", no_git: true }));
  assert.equal(initialized.ready, true, JSON.stringify(initialized));
  assert.equal(result(await call("memory_setup", { action: "status", no_git: true })).memory.ready, true);
  const entry = result(await call("memory_new", {
    name: "source-of-truth", description: "Owned retrieval evidence", body: "## Decision evidence\nThe plan revision owns this decision.",
    no_git: true,
  }));
  assert.equal(entry.description, "Owned retrieval evidence");
  assert.match(JSON.stringify(result(await call("memory_toc", { file_path: entry.path }))), /Decision evidence/);
  assert.match(JSON.stringify(result(await call("memory_section", { file_path: entry.path, title: "Decision evidence" }))), /The plan revision owns this decision/);
  assert.match(JSON.stringify(result(await call("memory_ls", { path: dirname(relative(base, entry.path)) }))), /source-of-truth/);
  const doctor = result(await call("gitnexus", { action: "doctor" }));
  assert.equal(doctor.embeddings, false);
  assert.equal(doctor.semanticQuery, false);
  const review = result(await call("memory_plan", { action: "review", request: JSON.stringify({ template_id: "coding" }) }));
  assert.match(review.revision, /^[a-f0-9]{64}$/);
  const planId = "mcp-port-runtime";
  const created = result(await call("memory_plan", {
    action: "create", no_git: true,
    request: JSON.stringify({ plan_id: planId, template_id: "coding", template_revision: review.revision,
      task: { title: "Real MCP bridge", purpose: "Track an operator-selected contract", good: "Persist and read back exact plan revision", work_items: [
        { id: "runtime", title: "Real runtime", owner: "operator", requirement_ids: ["outcome", "ast", "lsp", "design", "gitops", "verification"] },
      ] },
    }),
  }));
  assert.equal(created.plan.plan_id, planId);
  assert.equal(created.session_binding, undefined, "Codex cannot assert an OMP session binding");
  const persisted = result(await call("memory_plan", { action: "read", request: JSON.stringify({ plan_id: planId }) }));
  assert.equal(persisted.revision, created.revision);
  assert.equal(persisted.plan.plan_id, planId);
  const policy = result(await call("memory_policy", { action: "read" }));
  assert.match(policy.revision, /^sha256:[a-f0-9]{64}$/);
  const audit = result(await call("memory_rsi", {
    action: "audit", no_git: true,
    request: JSON.stringify({ plan_id: planId, sources: [
      { id: "explicit-selection", kind: "agents", scope: "One operator-selected text snapshot", body: "Do not claim unseen instruction layers." },
    ] }),
  }));
  assert.equal(audit.status, "disabled");
  const stored = result(await call("memory_rsi", { action: "read", request: JSON.stringify({ id: audit.receipt.id }) }));
  assert.equal(stored.artifact.kind, "audit");
});

test("forbidden action and malformed input fail closed without creating state", async t => {
  const { call, directory } = await fixture(t);
  rejected(await call("memory_setup", { action: "install" }), /CODEX_RSI_SETUP_APPROVED=true/);
  rejected(await call("memory_setup", { action: "status", unexpected: "discard me" }), /Input validation error/);
  rejected(await call("memory_plan", { action: "bind", request: '{"plan_id":"x"}' }), /Codex session capability required/);
  rejected(await call("memory_rsi", { action: "audit" }), /Automatic audit requires a complete effective prompt/);
  rejected(await call("memory_rsi", { action: "observe" }), /current invoking agent/);
  rejected(await call("gitnexus", { action: "analyze", cwd: directory, embeddings: true }), /Input validation error/);
  assert.equal(result(await call("memory_rsi", { action: "status" })).enabled, false);
  assert.equal(result(await call("memory_setup", { action: "status" })).memory.ready, false);
  assert.equal(result(await call("memory_setup", { action: "initialize", no_git: true })).ready, true);
  assert.equal(result(await call("memory_setup", { action: "status", no_git: true })).memory.ready, true);
});

test("remote opt-in comes from private key setup or explicit operator environment, never JSON settings", async t => {
  const directory = mkdtempSync(join(tmpdir(), "codex-rsi-operator-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { loadConfig } = await import("../server/config.js");
  const config = join(directory, "settings.json");
  writeFileSync(config, '{"typesafeEnabled":true}');
  assert.throws(() => loadConfig({ PLUGIN_DATA: directory, CODEX_RSI_CONFIG: config }), /Unrecognized key|unrecognized_keys/);
  writeFileSync(config, '{}');
  assert.equal(loadConfig({ PLUGIN_DATA: directory, CODEX_RSI_CONFIG: config }).typesafeEnabled, false);
  assert.equal(loadConfig({ PLUGIN_DATA: directory, CODEX_RSI_CONFIG: config, CODEX_RSI_TYPESAFE_ENABLED: "true" }).typesafeEnabled, true);
  assert.throws(() => loadConfig({ PLUGIN_DATA: "./project-data" }), /absolute/);
});

test("private TypeSafe key survives new MCP sessions without an exported key", async t => {
  const directory = mkdtempSync(join(tmpdir(), "codex-rsi-key-"));
  writeFileSync(join(directory, "typesafe.key"), "test-only-key\n", { mode: 0o600 });
  const disabled = await fixture(t, { CODEX_RSI_TYPESAFE_ENABLED: "false", TYPESAFE_API_KEY: "" }, directory);
  const first = result(await disabled.call("memory_rsi", { action: "status" }));
  assert.equal(first.enabled, false);
  assert.equal(first.configured, false);

  const enabled = { TYPESAFE_API_KEY: "" };
  const session = await fixture(t, enabled, directory);
  const status = result(await session.call("memory_rsi", { action: "status" }));
  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.doesNotMatch(JSON.stringify(status), /test-only-key/);
  await session.client.close();
  const restarted = await fixture(t, enabled, directory);
  assert.equal(result(await restarted.call("memory_rsi", { action: "status" })).configured, true);
});

test("unsafe TypeSafe key files fail closed at server startup", async t => {
  const directory = mkdtempSync(join(tmpdir(), "codex-rsi-key-permissions-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "typesafe.key");
  writeFileSync(path, "test-only-key\n", { mode: 0o644 });
  const { spawnSync } = await import("node:child_process");
  const start = () => spawnSync(process.execPath, [join(plugin, "server", "index.js")], {
    env: { ...process.env, PLUGIN_DATA: directory, CODEX_RSI_TYPESAFE_ENABLED: undefined, TYPESAFE_API_KEY: "" },
    input: "", encoding: "utf8", timeout: 5000,
  });
  const denied = start();
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /owned regular file.*mode 0600/);
  assert.doesNotMatch(denied.stderr, /test-only-key/);
  chmodSync(path, 0o600);
  const accepted = start();
  assert.equal(accepted.status, 0, accepted.stderr);
});

test("Codex hook-origin session signals observe, clear and recover without raw tool data", async t => {
  const { spawnSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "codex-rsi-hook-"));
  const hook = event => {
    const run = spawnSync(process.execPath, [join(plugin, "server", "codex-host.js")], {
      env: { ...process.env, PLUGIN_DATA: directory }, input: JSON.stringify(event), encoding: "utf8", timeout: 5000,
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  const message = JSON.parse(hook({ session_id: "codex-test-session", hook_event_name: "SessionStart", source: "startup" }));
  const token = message.hookSpecificOutput.additionalContext.match(/capability: ([a-f0-9]{64})/)[1];
  hook({ session_id: "codex-test-session", hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "one", tool_response: { exit_code: 1, stdout: "private data" }, tool_input: { command: "private command" } });
  hook({ session_id: "codex-test-session", hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "two", tool_response: { exit_code: 0 } });
  const { call, client } = await fixture(t, {}, directory);
  result(await call("memory_setup", { action: "initialize", no_git: true }));
  rejected(await call("memory_rsi", { action: "observe", no_git: true }), /current invoking agent/);
  rejected(await call("memory_rsi", { action: "observe", session_token: "f".repeat(64), no_git: true }), /ENOENT|session/);
  const observed = result(await call("memory_rsi", { action: "observe", session_token: token, no_git: true }));
  assert.equal(observed.telemetry.totals.failed, 1);
  assert.equal(observed.telemetry.totals.success, 1);
  assert.equal(observed.telemetry.sequences.recoveries, 1);
  const review = result(await call("memory_plan", { action: "review", request: '{"template_id":"coding"}' }));
  const created = result(await call("memory_plan", { action: "create", session_token: token, no_git: true,
    request: JSON.stringify({ plan_id: "codex-session-plan", template_id: "coding", template_revision: review.revision,
      task: { title: "Session bound plan", purpose: "Track current Codex session", good: "Binding persists across MCP restart", work_items: [
        { id: "work", title: "Current session", owner: "operator", requirement_ids: ["outcome", "ast", "lsp", "design", "gitops", "verification"] },
      ] } }),
  }));
  assert.equal(created.session_binding.bound, true);
  assert.equal(readFileSync(join(directory, "host-sessions", token, "plan-id"), "utf8"), "codex-session-plan");
  assert.doesNotMatch(JSON.stringify(observed), /private data|private command|codex-test-session/);
  const cleared = result(await call("memory_rsi", { action: "clear_signals", session_token: token }));
  assert.equal(cleared.cleared, true);
  await client.close();
  const resumed = await fixture(t, {}, directory);
  const after = result(await resumed.call("memory_rsi", { action: "observe", session_token: token, no_git: true }));
  assert.equal(result(await resumed.call("memory_plan", { action: "unbind", session_token: token })).bound, false);
  assert.equal(result(await resumed.call("memory_plan", { action: "bind", session_token: token, request: '{"plan_id":"codex-session-plan"}' })).bound, true);
  assert.equal(after.telemetry.totals.total, 0);
  hook({ session_id: "codex-test-session", hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "three", tool_response: { exit_code: 0 } });
  const recovery = result(await resumed.call("memory_rsi", { action: "observe", session_token: token, no_git: true }));
  assert.equal(recovery.telemetry.totals.total, 1);
  hook({ session_id: "codex-test-session", hook_event_name: "SessionEnd", reason: "other" });
  rejected(await resumed.call("memory_rsi", { action: "observe", session_token: token, no_git: true }), /ENOENT|session/);
});
