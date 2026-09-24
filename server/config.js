import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { runtimeConfig } from "omp-rsi/lib/runtime.js";
import { z } from "zod";

const absolute = z.string().refine(isAbsolute, "must be an absolute path").transform(path => resolve(path));
const command = z.string().min(1);
const bounded = (min, max) => z.number().int().min(min).max(max);
const settings = z.strictObject({
  memoryBase: absolute.optional(), runtimeDir: absolute.optional(), gitnexusHome: absolute.optional(),
  memoryBin: command.optional(), pythonBin: command.optional(), bootstrapPython: command.optional(),
  gitnexusBin: command.optional(), npmBin: command.optional(), agentId: command.optional(),
  instructionFiles: z.array(absolute).max(32).optional(),
  timeoutMs: bounded(1, 600_000).optional(), setupTimeoutMs: bounded(1, 3_600_000).optional(),
  gitnexusTimeoutMs: bounded(1, 900_000).optional(), rsiLearningTimeoutMs: bounded(1_000, 600_000).optional(),
  typesafeTimeoutMs: bounded(1, 120_000).optional(), typesafeMaxRequestBytes: bounded(1, 131_072).optional(),
  typesafeMaxResponseBytes: bounded(1, 262_144).optional(), typesafeRetries: bounded(0, 3).optional(),
  typesafeEndpoint: command.optional(), typesafeModel: command.optional(), typesafeApiKeyEnv: command.optional(),
});

function operatorSettings(path) {
  if (!isAbsolute(path)) throw new Error("CODEX_RSI_CONFIG must be an absolute operator-selected path");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 64 * 1024) throw new Error("Operator settings must be a regular JSON file of at most 64 KiB");
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < info.size) {
      const read = readSync(fd, bytes, length, info.size - length, length);
      if (!read) throw new Error("Operator settings changed while reading");
      length += read;
    }
    return settings.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))));
  } finally { closeSync(fd); }
}

export function pluginData(env = process.env) {
  const data = env.PLUGIN_DATA ?? join(homedir(), ".codex", "data", "codex-rsi");
  if (!isAbsolute(data)) throw new Error("PLUGIN_DATA must be an absolute operator-selected path");
  return resolve(data);
}

// The pinned RSI engine reads its credential from process.env. Bridge the
// private operator key only into this MCP server process after opt-in.
export function loadTypeSafeCredential(config, env = process.env) {
  if (config.typesafeEnabled !== true || env[config.typesafeApiKeyEnv]) return;
  const path = join(pluginData(env), "typesafe.key");
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`TypeSafe credential file cannot be opened: ${error.code}`);
  }
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size < 1 || info.size > 16 * 1024 ||
        info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
      throw new Error("TypeSafe credential must be an owned regular file of at most 16 KiB with mode 0600 or stricter");
    }
    const bytes = Buffer.alloc(info.size);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length);
      if (!count) throw new Error("TypeSafe credential changed while reading");
      length += count;
    }
    try {
      const key = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r?\n$/, "");
      if (!key || /[\r\n\0]/u.test(key)) throw new Error("TypeSafe credential must be a single nonempty line");
      process.env[config.typesafeApiKeyEnv] = key;
    } finally { bytes.fill(0); }
  } finally { closeSync(fd); }
}

export function loadConfig(env = process.env) {
  const root = pluginData(env);
  const selected = env.CODEX_RSI_CONFIG ?? join(root, "config.json");
  let present = Boolean(env.CODEX_RSI_CONFIG);
  if (!present) {
    try { lstatSync(selected); present = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const saved = present ? operatorSettings(selected) : {};
  const base = env.CODEX_RSI_BASE ?? saved.memoryBase ?? join(root, "memory");
  if (!isAbsolute(base)) throw new Error("CODEX_RSI_BASE must be an absolute operator-selected path");
  const remote = env.CODEX_RSI_TYPESAFE_ENABLED;
  if (remote !== undefined && remote !== "true" && remote !== "false") throw new Error("CODEX_RSI_TYPESAFE_ENABLED must be true or false");
  // The interactive, operator-owned key file is persistent opt-in. An explicit
  // process false vetoes it; JSON settings and project files cannot enable it.
  let keyPresent = false;
  if (remote === undefined) {
    try { lstatSync(join(root, "typesafe.key")); keyPresent = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return runtimeConfig({
    timeoutMs: 60_000, setupTimeoutMs: 600_000, gitnexusTimeoutMs: 120_000,
    rsiLearningTimeoutMs: 300_000, typesafeTimeoutMs: 20_000,
    typesafeMaxRequestBytes: 131_072, typesafeMaxResponseBytes: 262_144, typesafeRetries: 1,
    typesafeEndpoint: "https://api.typesafe.ai/v1/systemone", typesafeModel: "jev-latest",
    typesafeApiKeyEnv: "TYPESAFE_API_KEY", rsiInstructionDiscoveryEnabled: false,
    rsiTelemetryEnabled: false, ...saved, base: resolve(base),
    runtimeDir: saved.runtimeDir ?? join(root, "runtime"), typesafeEnabled: remote === "true" || (remote === undefined && keyPresent),
  });
}
