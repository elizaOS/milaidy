#!/usr/bin/env node
/**
 * dev:desktop — Start the full Milady desktop development environment.
 *
 * Runs in parallel:
 *   1. Vite (build --watch) — continuously rebuilds the renderer to apps/app/dist/
 *   2. Electrobun (dev --watch) — watches bun-side + ../dist, relaunches on change
 *
 * Ctrl-C cleanly kills both processes.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const services = [
  {
    name: "vite",
    cmd: "bun",
    args: ["run", "vite", "build", "--watch"],
    cwd: path.join(repoRoot, "apps/app"),
    env: {},
  },
  {
    name: "electrobun",
    cmd: "bun",
    args: ["run", "dev"],
    cwd: path.join(repoRoot, "apps/app/electrobun"),
    env: {},
  },
];

const PREFIX_PAD = Math.max(...services.map((s) => s.name.length));

function prefixStream(name, stream) {
  const prefix = `[${name.padEnd(PREFIX_PAD)}]`;
  stream.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) process.stdout.write(`${prefix} ${line}\n`);
    }
  });
}

console.log(`\nMilady desktop dev\n`);

const children = [];

for (const service of services) {
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
  console.log("\n[milady] Shutting down desktop dev environment...");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
