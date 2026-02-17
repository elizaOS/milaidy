#!/usr/bin/env node
/**
 * dev:all — Start the full Milady development environment.
 *
 * Launches in parallel:
 *   1. App (Vite dev server on port 2138, proxies /api and /ws to runtime)
 *   2. ElizaOS runtime (agent + plugins)
 *
 * All processes share stdio; Ctrl-C kills them all.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// ---------------------------------------------------------------------------
// Runtime detection — prefer bun when available, fall back to node/npm.
//
// Why: The services array spawns child processes using bun by default,
// but environments without Bun installed may need a fallback.  Bun can
// serve as both the JS runtime and the package-script runner.
// ---------------------------------------------------------------------------

function which(cmd) {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === "win32";
  const pathExts = isWindows
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];

  for (const dir of dirs) {
    for (const ext of pathExts) {
      const candidate = path.join(dir, cmd + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const hasBun = !!which("bun");

/** @type {{ name: string; cmd: string; args: string[]; cwd: string; env?: Record<string,string> }[]} */
const services = [
  {
    name: "app",
    cmd: hasBun ? "bun" : process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev"],
    cwd: path.join(repoRoot, "apps/app"),
  },
  {
    name: "runtime",
    cmd: hasBun ? "bun" : "node",
    args: ["scripts/run-node.mjs", "start"],
    cwd: repoRoot,
  },
];

// Parse flags: --no-ui, --no-app, --no-runtime to disable services
const argv = process.argv.slice(2);
const enabledServices = services.filter((s) => {
  return !argv.includes(`--no-${s.name}`);
});

if (enabledServices.length === 0) {
  console.error("[milady] No services enabled. Remove --no-* flags.");
  process.exit(1);
}

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

const PREFIX_PAD = Math.max(...enabledServices.map((s) => s.name.length));

function prefixStream(name, stream) {
  const prefix = `[${name.padEnd(PREFIX_PAD)}]`;
  stream.on("data", (chunk) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        process.stdout.write(`${prefix} ${line}\n`);
      }
    }
  });
}

console.log(`\nMilady dev environment\n`);
console.log(
  `Starting ${enabledServices.length} service(s): ${enabledServices.map((s) => s.name).join(", ")}\n`,
);

for (const service of enabledServices) {
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (child.stdout) prefixStream(service.name, child.stdout);
  if (child.stderr) prefixStream(service.name, child.stderr);

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit ${code}`;
    console.log(`[${service.name}] stopped (${reason})`);
  });

  children.push(child);
}

function cleanup() {
  console.log("\n[milady] Shutting down dev environment...");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
