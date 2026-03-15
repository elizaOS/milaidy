#!/usr/bin/env node

/**
 * @elizaos/cloud-agent CLI
 *
 * Usage:
 *   cloud-agent start [--port PORT] [--bridge-port PORT] [--compat-port PORT]
 *   cloud-agent health [--port PORT]
 *   cloud-agent version
 *   cloud-agent help
 */

import { start } from "./index.js";
import type { CloudAgentOptions } from "./types.js";

// ─── Argument Parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] ?? "help";

/**
 * Get a flag value from args: --flag value or --flag=value
 */
function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && i + 1 < args.length) {
      return args[i + 1];
    }
    if (args[i]!.startsWith(prefix)) {
      return args[i]!.slice(prefix.length);
    }
  }
  return undefined;
}

/**
 * Parse a port flag, returning undefined if not set or invalid.
 */
function getPortFlag(name: string): number | undefined {
  const raw = getFlag(name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.error(`Error: Invalid --${name} value: ${raw}`);
    process.exit(1);
  }
  return parsed;
}

// ─── Commands ───────────────────────────────────────────────────────────

async function cmdStart(): Promise<void> {
  const options: CloudAgentOptions = {};

  const healthPort = getPortFlag("port");
  const bridgePort = getPortFlag("bridge-port");
  const compatBridgePort = getPortFlag("compat-port");

  if (healthPort !== undefined) options.healthPort = healthPort;
  if (bridgePort !== undefined) options.bridgePort = bridgePort;
  if (compatBridgePort !== undefined)
    options.compatBridgePort = compatBridgePort;

  console.log("[cloud-agent] Starting...");

  const servers = await start(options);

  // Graceful shutdown on signals
  const graceful = () => {
    servers.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", graceful);
  process.on("SIGINT", graceful);
}

async function cmdHealth(): Promise<void> {
  const port = getPortFlag("port") ?? (Number(process.env.PORT) || 2138);

  try {
    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
    process.exit(res.ok ? 0 : 1);
  } catch (err: unknown) {
    console.error(
      `Error: Could not connect to health endpoint on port ${port}`,
    );
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function cmdVersion(): void {
  // Hardcoded — updated at release time
  console.log("@elizaos/cloud-agent v0.1.0");
}

function cmdHelp(): void {
  console.log(`
@elizaos/cloud-agent — ElizaOS cloud agent daemon

Usage:
  cloud-agent <command> [options]

Commands:
  start     Start the cloud agent daemon
  health    Check the health endpoint
  version   Print version
  help      Show this help

Options (start):
  --port <port>          Health endpoint port (default: 2138, env: PORT)
  --bridge-port <port>   Bridge server port (default: 31337, env: BRIDGE_PORT)
  --compat-port <port>   Compat bridge port (default: 18790, env: BRIDGE_COMPAT_PORT)

Options (health):
  --port <port>          Health endpoint port to query (default: 2138)

Examples:
  cloud-agent start
  cloud-agent start --port 2138 --bridge-port 31337
  cloud-agent health
  cloud-agent version
`.trim());
}

// ─── Main ───────────────────────────────────────────────────────────────

switch (command) {
  case "start":
    cmdStart().catch((err) => {
      console.error("[cloud-agent] Fatal:", err);
      process.exit(1);
    });
    break;
  case "health":
    cmdHealth().catch((err) => {
      console.error("[cloud-agent] Fatal:", err);
      process.exit(1);
    });
    break;
  case "version":
  case "--version":
  case "-v":
    cmdVersion();
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
