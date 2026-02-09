#!/usr/bin/env node
/**
 * Development script that starts:
 * 1. The Milaidy dev server (runtime + API on port 31337) with restart support
 * 2. The Vite UI dev server (port 2138, proxies /api and /ws to 31337)
 *
 * Automatically kills zombie processes on both ports before starting.
 * Waits for the API server to be ready before launching Vite so the proxy
 * doesn't flood the terminal with ECONNREFUSED errors.
 *
 * Usage:
 *   node scripts/dev-ui.mjs            # starts both API + UI
 *   node scripts/dev-ui.mjs --ui-only  # starts only the Vite UI (API assumed running)
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import process from "node:process";
import path from "node:path";

const API_PORT = 31337;
const UI_PORT = 2138;
const cwd = process.cwd();
const uiOnly = process.argv.includes("--ui-only");

// ---------------------------------------------------------------------------
// Runtime detection — prefer bun when available, fall back to node/npx.
//
// Why: Bun intercepts bare `node` calls in script mode but chokes on
// `node --import tsx` (tsx module resolution bug in Bun ≤1.3) and doesn't
// ship `npx`.  Detecting the runtime up-front lets us pick the right
// binary for each child process so the dev script works in both
// Node-only and Bun-only environments.
// ---------------------------------------------------------------------------

function which(cmd) {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === "win32";

  // On Windows, commands may be invoked without an extension and resolved
  // using PATHEXT (e.g., bun.exe, npx.cmd). Mirror that behavior here.
  const pathext = isWindows ? process.env.PATHEXT : "";
  const exts = isWindows
    ? (pathext?.length
        ? pathext.split(";").filter(Boolean)
        : [".EXE", ".CMD", ".BAT", ".COM"])
    : [""];

  for (const dir of dirs) {
    // Always check the bare command first.
    const candidates = [cmd];

    if (isWindows) {
      const lowerCmd = cmd.toLowerCase();
      for (const ext of exts) {
        const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
        if (!lowerCmd.endsWith(normalizedExt.toLowerCase())) {
          candidates.push(cmd + normalizedExt);
        }
      }
    }

    for (const name of candidates) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const hasBun = !!which("bun");
const hasNpx = !!which("npx");

if (!hasBun && !hasNpx) {
  console.error(
    'Neither "bun" nor "npx" was found in your PATH. ' +
      "Install Bun or Node.js with npx to run this dev script.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Output filter — only forward error-level lines from the API server.
// The @elizaos/core logger writes structured lines to stderr with a level
// prefix like " Info ", " Warn ", " Error ".  We suppress everything except
// Error-level structured logs and unstructured output (console.error, stack
// traces, fatal messages).
// ---------------------------------------------------------------------------

const SUPPRESS_RE = /^\s*(Info|Warn|Debug|Trace)\s/;
const SUPPRESS_UNSTRUCTURED_RE = /^\[dotenv[@\d]/;

function createErrorFilter(dest) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop(); // keep incomplete last line in buffer
    for (const line of lines) {
      if (
        line.trim() &&
        !SUPPRESS_RE.test(line) &&
        !SUPPRESS_UNSTRUCTURED_RE.test(line)
      ) {
        dest.write(`${line}\n`);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Port cleanup — force-kill zombie processes on our dev ports
// ---------------------------------------------------------------------------

function killPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
      );
      const pids = new Set(
        out
          .split("\n")
          .map((l) => l.trim().split(/\s+/).pop())
          .filter(Boolean),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        } catch {
          /* already dead */
        }
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, {
        stdio: "ignore",
      });
    }
  } catch {
    // No process found — port is clean
  }
}

// ---------------------------------------------------------------------------
// Wait for a TCP port to accept connections
// ---------------------------------------------------------------------------

function waitForPort(port, { timeout = 120_000, interval = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function attempt() {
      if (Date.now() > deadline) {
        reject(
          new Error(
            `Timed out waiting for port ${port} after ${timeout / 1000}s`,
          ),
        );
        return;
      }
      const socket = createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Kill zombie processes on dev ports before starting
killPort(UI_PORT);
if (!uiOnly) {
  killPort(API_PORT);
}

let apiProcess = null;
let viteProcess = null;

const cleanup = () => {
  if (apiProcess) apiProcess.kill();
  if (viteProcess) viteProcess.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

function startVite() {
  // Why bunx: npx is not available in Bun-only environments.
  const viteCmd = hasBun ? "bunx" : "npx";
  viteProcess = spawn(viteCmd, ["vite", "--port", String(UI_PORT)], {
    cwd: path.join(cwd, "apps/ui"),
    env: { ...process.env, MILAIDY_API_PORT: String(API_PORT) },
    stdio: ["inherit", "pipe", "pipe"],
  });

  // Suppress normal Vite output; print clean URL once ready
  viteProcess.stdout.on("data", (data) => {
    const text = data.toString();
    if (text.includes("ready")) {
      console.log(`\n  milaidy dev → http://localhost:${UI_PORT}/\n`);
    }
  });

  // Forward Vite errors to stderr
  viteProcess.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  viteProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[dev] Vite exited with code ${code}`);
      if (apiProcess) apiProcess.kill();
      process.exit(code ?? 1);
    }
  });
}

if (uiOnly) {
  // UI-only mode: API server is assumed to already be running
  startVite();
} else {
  // Full dev mode: start API server, wait for it, then start Vite.
  // Uses bun --watch for auto-restart on source changes.
  // MILAIDY_HEADLESS=1 tells startEliza() to skip the CLI chat loop.
  // LOG_LEVEL=error suppresses info/warn output in dev mode.
  console.log("\n  [milaidy] Starting dev server...\n");

  // Why: Bun runs .ts natively and has its own --watch; Node needs the tsx
  // loader registered via --import.  `bun --import tsx` fails due to a
  // module resolution bug (cannot find tsx/cjs/index.cjs), so we must
  // choose one path or the other — not pass --import tsx to bun.
  const apiCmd = hasBun
    ? ["bun", "--watch", "src/runtime/dev-server.ts"]
    : ["node", "--import", "tsx", "--watch", "src/runtime/dev-server.ts"];
  apiProcess = spawn(apiCmd[0], apiCmd.slice(1), {
    cwd,
    env: {
      ...process.env,
      MILAIDY_PORT: String(API_PORT),
      MILAIDY_HEADLESS: "1",
      LOG_LEVEL: "error",
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  // Filter API stderr: suppress Info/Warn/Debug, forward only Error + unstructured
  apiProcess.stderr.on("data", createErrorFilter(process.stderr));

  // Suppress API stdout entirely in dev mode
  apiProcess.stdout.on("data", () => {});

  apiProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`\n  [milaidy] Server exited with code ${code}`);
      if (viteProcess) viteProcess.kill();
      process.exit(code ?? 1);
    }
  });

  // Show a live progress indicator while waiting for the API server to be ready.
  // Without this the terminal appears completely stuck because all API output is
  // filtered / suppressed in dev mode.
  const startTime = Date.now();
  const dots = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  [milaidy] Waiting for API server... ${elapsed}s`);
  }, 1000);

  waitForPort(API_PORT)
    .then(() => {
      clearInterval(dots);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\r  [milaidy] API server ready (${elapsed}s)          `);
      startVite();
    })
    .catch((err) => {
      clearInterval(dots);
      console.error(`\n  [milaidy] ${err.message}`);
      if (apiProcess) apiProcess.kill();
      process.exit(1);
    });
}
