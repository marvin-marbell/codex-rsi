#!/usr/bin/env node
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const installedRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const data = process.argv[2];
const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");

function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o022) !== 0) {
    throw new Error(`Directory must be owned by you and not writable by others: ${path}`);
  }
}

try {
  if (process.argv.length !== 3 || !isAbsolute(data ?? "") || !isAbsolute(codexHome)) {
    throw new Error("Pass the absolute pluginData path reported by the installed memory_setup status");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run directly in a human terminal; redirected input is not accepted");
  privateDirectory(data);
  privateDirectory(codexHome);
  const destination = join(resolve(codexHome), "hooks.json");
  const template = JSON.parse(readFileSync(join(installedRoot, "hooks", "hooks.json"), "utf8"));
  const expected = ["SessionStart", "PostToolUse", "SessionEnd"];
  if (Object.keys(template.hooks).length !== expected.length || expected.some(name => !Array.isArray(template.hooks[name]))) {
    throw new Error("Unexpected bundled hook definitions");
  }
  const command = `PLUGIN_DATA=${quote(resolve(data))} ${quote(process.execPath)} ${quote(join(installedRoot, "server", "codex-host.js"))}`;
  for (const name of expected) {
    for (const group of template.hooks[name]) {
      for (const handler of group.hooks ?? []) {
        if (handler.type !== "command" || handler.command !== "node ${PLUGIN_ROOT}/server/codex-host.js") {
          throw new Error("Unexpected bundled hook handler");
        }
        handler.command = command;
      }
    }
  }
  const config = JSON.stringify({ description: "Codex RSI opt-in local session signals for every Codex session", hooks: template.hooks }, null, 2) + "\n";
  try { lstatSync(destination); throw new Error(`Existing hooks file preserved: ${destination}. Merge the installed hook definitions manually; do not overwrite other hooks.`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(`This creates ${destination}. Its hooks run in EVERY Codex session for this user, record bounded tool names/results under ${resolve(data)}, and show a bearer session token to the agent. No prompts, arguments, tool output or API key are stored. This is not authenticated current-agent identity. Codex requires separate human review and trust through /hooks.\n`);
  const answer = await rl.question("Type 'yes' to create these user-level hooks: ");
  rl.close();
  if (answer !== "yes") throw new Error("Hooks not enabled");
  const fd = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try { writeSync(fd, config); fsyncSync(fd); }
    finally { closeSync(fd); }
  } catch (error) { unlinkSync(destination); throw error; }
  process.stdout.write(`Created ${destination}. Restart Codex, inspect /hooks and trust these three user hooks before testing SessionStart. No hook was activated merely by this command.\n`);
} catch (error) {
  console.error(`Codex RSI hook setup: ${error.message}`);
  process.exitCode = 1;
}
