#!/usr/bin/env node
/**
 * dev:all — Start the full Milaidy development environment.
 *
 * Launches in parallel:
 *   1. Control UI (Vite dev server on port 5173)
 *   2. App (Vite dev server on port 5174)
 *   3. ElizaOS runtime (agent + plugins)
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
// Runtime detection — prefer bun when available, fall back to node/pnpm.
//
// Why: The services array spawns child processes using node/pnpm by default,
// but Bun-only environments (e.g. containers without Node installed) don't
// have these binaries.  Bun can serve as both the JS runtime and the
// package-script runner, so we swap in `bun` when it's on PATH.
// ---------------------------------------------------------------------------

function which(cmd) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, cmd);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const hasBun = !!which("bun");

/** @type {{ name: string; cmd: string; args: string[]; cwd: string; env?: Record<string,string> }[]} */
const services = [
  {
    name: "ui",
    cmd: hasBun ? "bun" : "node",
    args: ["scripts/ui.js", "dev"],
    cwd: repoRoot,
  },
  {
    name: "app",
    cmd: hasBun
      ? "bun"
      : process.platform === "win32"
        ? "pnpm.cmd"
        : "pnpm",
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
  console.error("[milaidy] No services enabled. Remove --no-* flags.");
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

console.log(`\n🦞 Milaidy dev environment\n`);
console.log(`Starting ${enabledServices.length} service(s): ${enabledServices.map((s) => s.name).join(", ")}\n`);

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
  console.log("\n[milaidy] Shutting down dev environment...");
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
