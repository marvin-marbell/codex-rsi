import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, mkdirSync, openSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSessionSignals } from "omp-rsi/lib/rsi-signals.js";

const validPlanId = id => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(id);
const MAX_EVENTS_BYTES = 1024 * 1024;
const tokenPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/u;
const root = env => join(resolve(env.PLUGIN_DATA ?? join(homedir(), ".codex", "data", "codex-rsi")), "host-sessions");
const fileFor = (env, token, file) => join(root(env), token, file);

function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = statSync(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error("RSI session directory must be private and owned by this user");
}

function privateFile(path, limit = MAX_EVENTS_BYTES) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0 || info.size > limit) throw new Error("Invalid RSI session file");
    const bytes = Buffer.alloc(info.size);
    let count = 0;
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, count);
      if (!n) throw new Error("RSI session file changed while reading");
      count += n;
    }
    return bytes;
  } finally { closeSync(fd); }
}

function session(env, token) {
  if (!tokenPattern.test(token ?? "")) throw new Error("Codex session capability is required; trust the plugin hooks and start a fresh Codex session");
  const dir = fileFor(env, token, "");
  const info = statSync(dir);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error("Untrusted Codex session directory");
  const id = privateFile(join(dir, "session-id"), 256).toString("utf8");
  if (!idPattern.test(id)) throw new Error("Invalid Codex session identity");
  return { id, token, dir };
}

// The hook mints a bearer capability; the MCP transport cannot attest the
// invoking Codex session. A caller holding an old token can select that session
// until SessionEnd removes it. Never treat this as current-agent authorization.
export function createCodexHost(env = process.env, memory) {
  const sessions = new Map();
  function authorize(token) {
    const selected = session(env, token);
    sessions.set(selected.id, selected);
    return selected.id;
  }
  function journal(id) {
    const selected = sessions.get(id);
    if (!selected) return { data: "", bytes: 0 };
    session(env, selected.token);
    const events = fileFor(env, selected.token, "events.jsonl");
    let data;
    try { data = privateFile(events).toString("utf8"); }
    catch (error) { if (error.code === "ENOENT") data = ""; else throw error; }
    const checkpoint = fileFor(env, selected.token, "checkpoint");
    let start = 0;
    try { start = Number(privateFile(checkpoint, 32).toString("utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!Number.isSafeInteger(start) || start < 0 || start > Buffer.byteLength(data)) throw new Error("Invalid RSI telemetry checkpoint");
    return { data: data.slice(start), bytes: Buffer.byteLength(data) };
  }
  function collector(id) {
    const listeners = new Map();
    const names = new Set();
    const pi = { on(name, handler) { listeners.set(name, handler); }, getActiveTools() { return [...names]; } };
    const signals = createSessionSignals(pi, { rsiTelemetryEnabled: true });
    const { data } = journal(id);
    for (const line of data.split("\n")) {
      if (!line) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (!idPattern.test(event.toolName ?? "") || typeof event.toolCallId !== "string" || ![true, false, null].includes(event.isError)) continue;
      names.add(event.toolName);
      listeners.get("tool_result")?.(event, { sessionManager: { getSessionId: () => id } });
    }
    return signals;
  }
  const signals = {
    status(id) { return sessions.has(id) ? collector(id).status(id) : { enabled: false, status: "invalid-session" }; },
    snapshot(id) {
      const selected = sessions.get(id);
      if (!selected) throw new Error("Codex session capability required");
      const snapshot = collector(id).snapshot(id);
      let overflow = false;
      try { privateFile(fileFor(env, selected.token, "overflow"), 1); overflow = true; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      return {
        ...snapshot,
        source: { ...snapshot.source, kind: "codex-hook-tool-results", event: "PostToolUse", scope: "hook-bearer-session" },
        coverage: { ...snapshot.coverage, hook_journal_limit_reached: overflow },
        limitations: [
          "Counts are observed Codex PostToolUse hook events, not task success or earned credit. Hooks require human trust and do not cover hosted or opted-out tools.",
          "Only host tool names, call IDs and structured isError/exit_code are inspected; no tool arguments, outputs, transcript or hidden prompts are read. Unknown outcome remains unknown.",
          "The bearer token selects a hook-minted session, not an attested current MCP caller. Missing SessionEnd may leave stale tokens; missing hooks and journal overflow leave incomplete coverage.",
          "Failure/recovery follows result arrival order, not causality. Observe persists a selected local snapshot; only a later explicit remote mine can disclose it.",
        ],
      };
    },
    clear(id) {
      const selected = sessions.get(id);
      if (!selected) throw new Error("Codex session capability required");
      const { bytes } = journal(id);
      const path = fileFor(env, selected.token, "checkpoint");
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
      try { writeSync(fd, String(bytes)); } finally { closeSync(fd); }
      return { ...collector(id).status(id), cleared: true, scope: "hook-bearer-session", persisted_artifacts_removed: false };
    },
  };
  const epochs = new Map();
  const fromContext = ctx => ctx?.sessionManager?.getSessionId?.();
  const bound = id => {
    const selected = sessions.get(id);
    if (!selected) return undefined;
    session(env, selected.token);
    try { return privateFile(fileFor(env, selected.token, "plan-id"), 128).toString("utf8"); }
    catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
  };
  const planSession = {
    capture(ctx) {
      const id = fromContext(ctx);
      return sessions.has(id) ? { id, epoch: epochs.get(id) ?? 0 } : null;
    },
    async bind(planId, ctx, pending) {
      const id = fromContext(ctx);
      const selected = sessions.get(id);
      if (!selected || (planId !== null && !validPlanId(planId))) throw new Error("Codex session capability and valid plan ID required");
      if (pending && (pending.id !== id || pending.epoch !== (epochs.get(id) ?? 0))) throw new Error("Codex session changed before plan binding");
      const epoch = (epochs.get(id) ?? 0) + 1;
      epochs.set(id, epoch);
      if (planId !== null) await memory(["plan", "--request", "-"], { stdin: JSON.stringify({ action: "read", plan_id: planId }) });
      if (epochs.get(id) !== epoch || session(env, selected.token).id !== id) throw new Error("Codex session changed before plan binding");
      const path = fileFor(env, selected.token, "plan-id");
      const temp = `${path}.${randomBytes(8).toString("hex")}`;
      try {
        writeFileSync(temp, planId ?? "", { mode: 0o600, flag: "wx" });
        renameSync(temp, path);
      } finally { rmSync(temp, { force: true }); }
      return { plan_id: planId, bound: planId !== null, scope: "codex-hook-bearer-session-plugin-data", persisted: true };
    },
    async snapshot(ctx) {
      const id = fromContext(ctx);
      const planId = bound(id);
      if (!validPlanId(planId)) return null;
      try {
        const entry = JSON.parse(await memory(["plan", "--request", "-"], { stdin: JSON.stringify({ action: "read", plan_id: planId }) }));
        if (bound(id) !== planId) return null;
        return { plan_id: planId, revision: entry.revision, complete: entry.validation?.complete === true, template_id: entry.plan?.template?.template_id };
      } catch { return { plan_id: planId, unavailable: true }; }
    },
  };
  return { authorize, signals, planSession };
}

// Hook writes only a host session ID and a bounded projection of tool name,
// call ID and structured outcome. It never stores arguments, responses or prompts.
export async function runHook(env = process.env, input = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const part of input) {
    size += part.length;
    if (size > 1024 * 1024) throw new Error("Codex hook event too large");
    chunks.push(part);
  }
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!idPattern.test(event.session_id ?? "")) throw new Error("Invalid Codex hook session ID");
  const directory = root(env);
  privateDirectory(directory);
  if (event.hook_event_name === "SessionStart") {
    let token;
    for (const item of readdirSync(directory)) {
      if (!tokenPattern.test(item)) continue;
      try { if (session(env, item).id === event.session_id) { token = item; break; } }
      catch { /* Ignore unrelated corrupt entries. */ }
    }
    if (!token) {
      token = randomBytes(32).toString("hex");
      privateDirectory(join(directory, token));
      writeFileSync(fileFor(env, token, "session-id"), event.session_id, { mode: 0o600, flag: "wx" });
    }
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `Codex RSI local session capability: ${token}. Pass it as session_token to memory_rsi observe/clear_signals/status and memory_plan bind/unbind. It scopes local host signals and binding; never send it to TypeSafe.` } }));
    return;
  }
  let token;
  for (const item of readdirSync(directory)) {
    if (!tokenPattern.test(item)) continue;
    try { if (session(env, item).id === event.session_id) { token = item; break; } }
    catch { /* Ignore unrelated corrupt entries. */ }
  }
  if (!token) return;
  if (event.hook_event_name === "SessionEnd") { rmSync(join(directory, token), { recursive: true, force: true }); return; }
  if (event.hook_event_name !== "PostToolUse") return;
  if (!idPattern.test(event.tool_name ?? "") || /(?:^|__)memory_rsi(?:$|__)/u.test(event.tool_name) || typeof event.tool_use_id !== "string" || event.tool_use_id.length > 512) return;
  const response = event.tool_response;
  const isError = typeof response?.isError === "boolean" ? response.isError
    : typeof response?.exit_code === "number" ? response.exit_code !== 0 : null;
  const record = JSON.stringify({ toolName: event.tool_name, toolCallId: createHash("sha256").update(event.tool_use_id).digest("hex"), isError }) + "\n";
  const path = fileFor(env, token, "events.jsonl");
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error("Unsafe Codex RSI event file");
    if (info.size + Buffer.byteLength(record) <= MAX_EVENTS_BYTES) writeSync(fd, record);
    else {
      try { writeFileSync(fileFor(env, token, "overflow"), "1", { mode: 0o600, flag: "wx" }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    }
  } finally { closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runHook(); }
  catch (error) { console.error(`Codex RSI hook: ${error.message}`); process.exitCode = 1; }
}
