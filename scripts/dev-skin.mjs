#!/usr/bin/env node
/**
 * dev:skin — start backend runtime + skinned control UI (apps/ui).
 *
 * Defaults:
 * - Backend API: 31337
 * - Skin UI: 2143
 *
 * Override with:
 * - MILADY_PORT
 * - MILADY_UI_PORT
 */
import { execSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();
const API_PORT = Number(process.env.MILADY_PORT) || 31337;
const UI_PORT = Number(process.env.MILADY_UI_PORT) || 2143;
const STATE_DIR =
  process.env.MILADY_STATE_DIR?.trim() || path.join(cwd, ".milady-state");
const CONFIG_PATH =
  process.env.MILADY_CONFIG_PATH?.trim() || path.join(STATE_DIR, "milady.json");
const EXPECTED_STATE_DIR = path.resolve(cwd, ".milady-state");
const EXPECTED_CONFIG_PATH = path.join(EXPECTED_STATE_DIR, "milady.json");
const ALLOW_NON_WORKSPACE_STATE =
  process.env.MILADY_ALLOW_NON_WORKSPACE_STATE === "1";

if (!ALLOW_NON_WORKSPACE_STATE) {
  const resolvedStateDir = path.resolve(STATE_DIR);
  const resolvedConfigPath = path.resolve(CONFIG_PATH);
  if (resolvedStateDir !== EXPECTED_STATE_DIR) {
    console.error(
      `[skin] refusing to use non-workspace state dir: ${resolvedStateDir}`,
    );
    console.error(`[skin] expected: ${EXPECTED_STATE_DIR}`);
    console.error(
      "[skin] set MILADY_ALLOW_NON_WORKSPACE_STATE=1 only for temporary debugging.",
    );
    process.exit(1);
  }
  if (resolvedConfigPath !== EXPECTED_CONFIG_PATH) {
    console.error(
      `[skin] refusing to use mismatched config path: ${resolvedConfigPath}`,
    );
    console.error(`[skin] expected: ${EXPECTED_CONFIG_PATH}`);
    console.error(
      "[skin] set MILADY_ALLOW_NON_WORKSPACE_STATE=1 only for temporary debugging.",
    );
    process.exit(1);
  }
}

function killPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, {
      stdio: "ignore",
    });
  } catch {
    // Port already clear.
  }
}

function waitForPort(port, timeoutMs = 90_000, intervalMs = 350) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for port ${port}`));
        return;
      }
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(attempt, intervalMs);
      });
    }
    attempt();
  });
}

async function isRuntimeApiHealthy(port, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") return false;
    return typeof body.state === "string";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function prefixStream(name, stream) {
  stream.on("data", (chunk) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.trim().length > 0) {
        process.stdout.write(`[${name}] ${line}\n`);
      }
    }
  });
}

function startProcess(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (child.stdout) prefixStream(name, child.stdout);
  if (child.stderr) prefixStream(name, child.stderr);
  return child;
}

let backend = null;
let ui = null;
let shuttingDown = false;
let uiStarted = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (ui && !ui.killed) {
    try {
      ui.kill("SIGTERM");
    } catch {}
  }
  if (backend && !backend.killed) {
    try {
      backend.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startBackendProcess() {
  console.log(`[skin] starting backend on :${API_PORT}`);
  backend = startProcess("runtime", "bun", ["run", "dev:runtime"], {
    cwd,
    env: {
      ...process.env,
      MILADY_STATE_DIR: STATE_DIR,
      MILADY_CONFIG_PATH: CONFIG_PATH,
      MILADY_PORT: String(API_PORT),
      MILADY_STRICT_PORT: "1",
      MILADY_RUNTIME_AUTO_DB_RESET:
        process.env.MILADY_RUNTIME_AUTO_DB_RESET ?? "1",
    },
  });

  backend.on("exit", (code) => {
    if (shuttingDown) return;
    void (async () => {
      const healthy = await isRuntimeApiHealthy(API_PORT);
      if (healthy) {
        console.warn(
          `[skin] backend helper exited (${code ?? "null"}) but API :${API_PORT} is healthy; continuing.`,
        );
        backend = null;
        return;
      }

      const recoveryDeadline = Date.now() + 20_000;
      let recovered = false;
      while (Date.now() < recoveryDeadline) {
        // eslint-disable-next-line no-await-in-loop
        if (await isRuntimeApiHealthy(API_PORT)) {
          recovered = true;
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (recovered) {
        console.warn(
          `[skin] backend process exited (${code ?? "null"}) but API recovered on :${API_PORT}; continuing.`,
        );
        backend = null;
      } else {
        console.error(
          `[skin] backend exited (${code ?? "null"}) and API :${API_PORT} did not recover in time.`,
        );
        if (uiStarted) {
          console.error(
            "[skin] stopping UI because backend is unreachable. Restart dev:skin.",
          );
        }
        shutdown(code ?? 1);
      }
    })();
  });
}

killPort(UI_PORT);
killPort(API_PORT);
killPort(31338);

startBackendProcess();

try {
  await waitForPort(API_PORT);
} catch (err) {
  console.error(
    `[skin] backend failed to become ready: ${err instanceof Error ? err.message : String(err)}`,
  );
  shutdown(1);
}

console.log(`[skin] starting apps/ui on :${UI_PORT}`);
uiStarted = true;
ui = startProcess(
  "ui",
  "bunx",
  ["vite", "--host", "127.0.0.1", "--port", String(UI_PORT)],
  {
    cwd: path.join(cwd, "apps/ui"),
    env: {
      ...process.env,
      MILADY_STATE_DIR: STATE_DIR,
      MILADY_CONFIG_PATH: CONFIG_PATH,
      MILADY_API_PORT: String(API_PORT),
    },
  },
);

ui.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`[skin] ui exited (${code ?? "null"})`);
    shutdown(code ?? 1);
  }
});

console.log(`[skin] ready: http://127.0.0.1:${UI_PORT}/chat`);
