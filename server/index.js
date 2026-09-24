import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createMemoryRunner } from "omp-rsi/src/runner.js";
import { registerMemoryReadTools } from "omp-rsi/src/memory-read-tools.js";
import { registerMemoryWriteTools } from "omp-rsi/src/memory-write-tools.js";
import { registerMemoryMaintenanceTools } from "omp-rsi/src/memory-maintenance-tools.js";
import { registerContractTools } from "omp-rsi/src/contract-tools.js";
import { registerPolicyTools } from "omp-rsi/src/policy-tools.js";
import { registerGraphTools } from "omp-rsi/src/graph-tools.js";
import { createRsiRuntime, registerRsiTool } from "omp-rsi/src/rsi-tool.js";
import { registerSetupTools } from "omp-rsi/src/setup-tools.js";
import { bootstrapRequest, setupStatus } from "omp-rsi/lib/setup.js";
import { installRuntime } from "omp-rsi/lib/runtime.js";
import { setupFields } from "omp-rsi/lib/setup-json.js";
import { loadConfig } from "./config.js";

const SETUP_ACTIONS = new Set(["status", "install", "initialize", "preview_migration", "apply_migration", "sync_instructions"]);
const PLAN_SESSION_ACTIONS = new Set(["bind", "unbind"]);

function setupHandler(config, env) {
  return async (args, signal) => {
    if (!SETUP_ACTIONS.has(args.action)) throw new Error(`Unknown setup action: ${args.action}`);
    const fields = setupFields(args.request ?? "{}");
    let result;
    if (args.action === "status") {
      if (Object.keys(fields).length) throw new Error("status takes no request fields");
      result = await setupStatus(config, { signal, noGit: args.no_git === true });
    } else if (args.action === "install") {
      if (Object.keys(fields).some(key => key !== "graph") || (fields.graph !== undefined && typeof fields.graph !== "boolean")) throw new Error("install accepts only optional graph:boolean");
      requireOperatorApproval(env, "install");
      result = await installRuntime(config, { graph: fields.graph !== false, signal });
    } else {
      if (args.action === "apply_migration") {
        if (!fields.preview || !fields.expected_revision) throw new Error("apply_migration requires the reviewed preview and expected_revision");
        requireOperatorApproval(env, "apply_migration");
      }
      if (args.action === "sync_instructions") {
        if (typeof fields.target !== "string" || !(config.instructionFiles ?? []).includes(fields.target)) throw new Error("sync_instructions target must be in the operator-configured instructionFiles allowlist");
        if (fields.apply === true) requireOperatorApproval(env, "sync_instructions apply");
      }
      result = await bootstrapRequest(config, { ...fields, action: args.action }, { signal, noGit: args.no_git === true });
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  };
}

function requireOperatorApproval(env, action) {
  if (env.CODEX_RSI_SETUP_APPROVED !== "true") throw new Error(`${action} requires operator process environment CODEX_RSI_SETUP_APPROVED=true; a tool argument cannot approve it`);
}

/** Translate the pinned OMP engine's tool definitions, never its host lifecycle. */
export function createServer(env = process.env) {
  const config = loadConfig(env);
  const memory = createMemoryRunner(config);
  const server = new McpServer({ name: "codex-rsi", version: "0.1.0" });
  const setup = setupHandler(config, env);
  const pi = {
    zod: z,
    registerTool(definition) {
      // Zod objects otherwise discard unknown inputs. MCP must reject them before
      // running a process; the Python/RSI engines still validate action-specific fields.
      const inputSchema = definition.parameters.strict();
      const description = {
        memory_setup: "Explicit Codex-local setup. Status is read-only; install, migration apply and instruction sync apply also require the operator process environment CODEX_RSI_SETUP_APPROVED=true. Initialize is explicit; nothing installs or imports on startup.",
        memory_plan: "Revision-bound plan contracts. Codex MCP has no authenticated session identity: use explicit plan_id for read/update; bind/unbind are unavailable and create never binds a session.",
        memory_policy: "Read or explicitly revise the persistent memory policy. Codex does not inject it into the system prompt; syncing a managed section requires an operator-configured instructionFiles allowlist.",
        memory_rsi: "Pinned RSI engine for plans, policy, local observations, review and opt-in TypeSafe assessment. Codex cannot capture the current session, system prompt or active skill catalog: observe, clear_signals, and automatic audit are unavailable; audit with explicit sources remains available. Remote TypeSafe requires CODEX_RSI_TYPESAFE_ENABLED=true and a credential.",
      }[definition.name] ?? definition.description;
      server.registerTool(definition.name, {
        title: definition.label, description, inputSchema,
        annotations: { readOnlyHint: definition.approval === "read" },
      }, async (args, extra) => {
        if (definition.name === "memory_plan" && PLAN_SESSION_ACTIONS.has(args.action)) {
          throw new Error("Codex MCP has no authenticated session identity; bind/unbind are unavailable. Pass explicit plan_id to read and update.");
        }
        if (definition.name === "memory_rsi" && ["observe", "clear_signals"].includes(args.action)) {
          throw new Error(`${args.action} requires host session telemetry unavailable in Codex; review_observe and retrieval_observe accept explicit selected evidence instead.`);
        }
        if (definition.name === "memory_rsi" && args.action === "audit" && !Object.hasOwn(setupFields(args.request ?? "{}"), "sources")) {
          throw new Error("Automatic audit requires session system prompt and active skill catalog unavailable in Codex; supply exact explicit sources instead.");
        }
        const signal = extra.signal;
        return definition.name === "memory_setup"
          ? setup(args, signal)
          : definition.execute(undefined, args, signal, undefined, undefined);
      });
    },
  };
  registerSetupTools(pi, config);
  registerGraphTools(pi, config);
  registerMemoryReadTools(pi, { memory });
  registerMemoryWriteTools(pi, config, { memory });
  registerMemoryMaintenanceTools(pi, { memory });
  registerContractTools(pi, config, { memory, planSession: null });
  registerPolicyTools(pi, config, { memory });
  registerRsiTool(pi, config, createRsiRuntime(config, { memory }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await createServer().connect(new StdioServerTransport());
  } catch (error) {
    console.error(`codex-rsi startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
