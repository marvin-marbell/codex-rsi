#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { closeSync, constants, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const data = process.argv[2] ?? process.env.PLUGIN_DATA ?? join(homedir(), ".codex", "data", "codex-rsi");
if (process.argv.length > 3 || !isAbsolute(data)) throw new Error("Pass one absolute Codex plugin data directory (never a key on the command line)");
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run directly in a human terminal; redirected input is not accepted");
const path = join(resolve(data), "typesafe.key");

function hiddenKey() {
  process.stdout.write("TypeSafe API key (hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolveKey, reject) => {
    const bytes = [];
    const receive = chunk => {
      for (const byte of chunk) {
        if (byte === 3) { finish(new Error("Cancelled")); return; }
        if (byte === 13 || byte === 10) {
          const key = Buffer.from(bytes);
          bytes.fill(0);
          finish(null, key);
          return;
        }
        if (byte === 127 || byte === 8) { bytes.pop(); continue; }
        if (byte < 33 || byte > 126 || bytes.length >= 16 * 1024) {
          finish(new Error("Key must be a single nonempty ASCII line of at most 16 KiB"));
          bytes.fill(0);
          return;
        }
        bytes.push(byte);
      }
    };
    const finish = (error, key) => {
      process.stdin.off("data", receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) { bytes.fill(0); reject(error); }
      else resolveKey(key);
    };
    process.stdin.on("data", receive);
  });
}

try {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("Saving a key enables remote TypeSafe assessment in future Codex RSI sessions. Selected assessment material may leave this machine.\n");
  const answer = await rl.question("Type 'yes' to enable TypeSafe: ");
  rl.close();
  if (answer !== "yes") throw new Error("Not enabled");
  const key = await hiddenKey();
  try {
    if (!key.length) throw new Error("Key cannot be empty");
    mkdirSync(data, { recursive: true, mode: 0o700 });
    const directory = lstatSync(data);
    if (!directory.isDirectory() || directory.uid !== process.getuid() || (directory.mode & 0o022) !== 0) {
      throw new Error("Plugin data directory must be owned by you and not writable by others");
    }
    const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
    const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      try {
        let offset = 0;
        while (offset < key.length) offset += writeSync(fd, key, offset, key.length - offset);
        fsyncSync(fd);
      } finally { closeSync(fd); }
      linkSync(temp, path);
    } finally { unlinkSync(temp); }
    process.stdout.write(`TypeSafe enabled for new Codex sessions. Private credential saved at ${path}. Restart Codex.\n`);
  } finally { key.fill(0); }
} catch (error) {
  console.error(`TypeSafe setup: ${error.message}`);
  process.exitCode = 1;
}
