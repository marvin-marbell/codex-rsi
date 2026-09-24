import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const plugin = resolve(import.meta.dirname, "..");
const setup = join(plugin, "server", "configure-hooks.js");
const terminal = `
import json, os, pty, select, subprocess, sys, time
master, slave = pty.openpty()
p = subprocess.Popen([sys.argv[1], sys.argv[2], sys.argv[3]], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
output = b''
deadline = time.monotonic() + 8
while time.monotonic() < deadline:
    if select.select([master], [], [], 0.2)[0]:
        try: output += os.read(master, 65536)
        except OSError: break
    if b"Type 'yes' to create these user-level hooks: " in output:
        os.write(master, sys.argv[4].encode() + b'\\n')
        break
    if p.poll() is not None: break
while p.poll() is None and time.monotonic() < deadline:
    if select.select([master], [], [], 0.2)[0]:
        try: output += os.read(master, 65536)
        except OSError: break
if p.poll() is None: p.kill()
status = p.wait()
os.close(master)
print(json.dumps({'status': status, 'output': output.decode(errors='replace')}))
`;

function interact(data, home, answer) {
  const run = spawnSync("python3", ["-c", terminal, process.execPath, setup, data, answer], {
    env: { ...process.env, CODEX_HOME: home, PLUGIN_DATA: join(home, "wrong-data") },
    encoding: "utf8", timeout: 15_000,
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("human hook opt-in preserves existing settings and routes real events to selected plugin data", t => {
  const root = mkdtempSync(join(tmpdir(), "codex-rsi-hooks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "codex-home");
  const data = join(root, "selected plugin's data");
  const hooks = join(home, "hooks.json");
  const declined = interact(data, home, "no");
  assert.notEqual(declined.status, 0);
  assert.equal(existsSync(hooks), false);
  chmodSync(data, 0o775);
  const unsafe = interact(data, home, "yes");
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.output, /not writable by others/);
  assert.equal(existsSync(hooks), false);
  chmodSync(data, 0o700);

  const accepted = interact(data, home, "yes");
  assert.equal(accepted.status, 0, accepted.output);
  assert.equal(statSync(hooks).mode & 0o777, 0o600);
  const config = JSON.parse(readFileSync(hooks, "utf8"));
  const runHook = (name, extra = {}) => {
    const command = config.hooks[name][0].hooks[0].command;
    const run = spawnSync("sh", ["-c", command], {
      env: { ...process.env, PLUGIN_DATA: join(home, "wrong-data") },
      input: JSON.stringify({ session_id: "codex-test-session", hook_event_name: name, ...extra }),
      encoding: "utf8", timeout: 5000,
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  const response = JSON.parse(runHook("SessionStart"));
  const token = response.hookSpecificOutput.additionalContext.match(/capability: ([a-f0-9]{64})/)[1];
  const session = join(data, "host-sessions", token);
  assert.equal(readFileSync(join(session, "session-id"), "utf8"), "codex-test-session");
  assert.equal(existsSync(join(home, "wrong-data", "host-sessions")), false);
  runHook("PostToolUse", { tool_name: "Bash", tool_use_id: "one", tool_response: { exit_code: 1 } });
  assert.match(readFileSync(join(session, "events.jsonl"), "utf8"), /"isError":true/);
  runHook("SessionEnd");
  assert.equal(existsSync(session), false);

  writeFileSync(hooks, "existing user hooks\n", { mode: 0o600 });
  const preserved = interact(data, home, "yes");
  assert.notEqual(preserved.status, 0);
  assert.match(preserved.output, /Existing hooks file preserved/);
  assert.equal(readFileSync(hooks, "utf8"), "existing user hooks\n");
});
