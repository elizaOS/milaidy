#!/usr/bin/env node
/**
 * dev:desktop — Full Milady desktop development environment.
 *
 * 1. Blocking vite build (renderer assets for electrobun)
 * 2. Then starts in parallel:
 *    - API server (bun --watch on port 31337)
 *    - Electrobun (dev) — bundles renderer from ../dist, watches for changes
 *
 * Electrobun watches ../dist (via electrobun.config.ts watch config),
 * so subsequent vite rebuilds trigger an electrobun reload automatically.
 * Run `bun run vite build` in apps/app/ to push UI changes to the desktop.
 *
 * Pass --no-api to skip the backend (e.g. if running it separately).
 *
 * Ctrl-C cleanly kills all processes.
 */

import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const appDir = path.join(repoRoot, "apps/app");
const electrobunDir = path.join(appDir, "electrobun");
const skipApi = process.argv.includes("--no-api");

// Step 1: blocking vite build so electrobun has renderer assets to bundle
console.log("\n[milady] Building renderer...");
execSync("bun run vite build", { cwd: appDir, stdio: "inherit" });
console.log("[milady] Renderer ready.\n");

// Step 2: start API + electrobun in parallel
const services = [
  ...(!skipApi
    ? [
        {
          name: "api",
          cmd: "bun",
          args: ["--watch", "src/runtime/dev-server.ts"],
          cwd: repoRoot,
          env: {
            MILADY_PORT: "31337",
            MILADY_HEADLESS: "1",
          },
        },
      ]
    : []),
  {
    name: "electrobun",
    cmd: "bun",
    args: ["run", "dev"],
    cwd: electrobunDir,
    env: { ELECTROBUN_SKIP_CODESIGN: "1" },
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

console.log(
  `Milady desktop dev${skipApi ? " (no API)" : ""}\n` +
    `  Services: ${services.map((s) => s.name).join(", ")}\n`,
);

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
