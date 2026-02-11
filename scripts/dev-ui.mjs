#!/usr/bin/env node
/**
 * Development script that starts:
 * 1. The Milaidy dev server (runtime + API on port 31337) with restart support
 * 2. The Vite app dev server (port 2138, proxies /api and /ws to 31337)
 *
 * Automatically kills zombie processes on both ports before starting.
 * Waits for the API server to be ready before launching Vite so the proxy
 * doesn't flood the terminal with ECONNREFUSED errors.
 *
 * Usage:
 *   node scripts/dev-ui.mjs            # starts both API + UI
 *   node scripts/dev-ui.mjs --ui-only  # starts only the Vite UI (API assumed running)
 */
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import process from "node:process";

const API_PORT = 31337;
const UI_PORT = 2138;
const cwd = process.cwd();
const uiOnly = process.argv.includes("--ui-only");

// ---------------------------------------------------------------------------
// ANSI colors — raw escape sequences so we don't need chalk in this .mjs file.
// ---------------------------------------------------------------------------

const supportsColor =
  process.env.FORCE_COLOR !== "0" &&
  process.env.NO_COLOR === undefined &&
  process.stdout.isTTY;

const GREEN = supportsColor ? "\x1b[38;2;0;255;65m" : "";
const ORANGE = supportsColor ? "\x1b[38;2;255;165;0m" : "";
const DIM = supportsColor ? "\x1b[2m" : "";
const RESET = supportsColor ? "\x1b[0m" : "";

function green(text) {
  return `${GREEN}${text}${RESET}`;
}
function orange(text) {
  return `${ORANGE}${text}${RESET}`;
}
function dim(text) {
  return `${DIM}${text}${RESET}`;
}

// ---------------------------------------------------------------------------
// ASCII banner — printed once at startup in cyber green (#00FF41).
// Keep in sync with src/ascii.ts.
// ---------------------------------------------------------------------------

const ASCII_ART = `\
        miladym                        iladym      
    iladymil                                ady    
    mil                                         ad   
ymi                                   ladymila     
dym                                    ila dymila    
dy       miladymil                     ady   milady   
    miladymilad                     ymila dymilady  
    mi    ladymila                   dymiladymil     
adymiladymiladymi                  l  adymila d    
ym   iladymiladymil                 ad ymilad  y    
m  il  adymiladym  i                  l   ad   y     
    mi  ladymila  dy                    mi           
    la          dy                         mil      
        ad      ym                                   
        iladym`;

function printBanner() {
  if (supportsColor) {
    const colored = ASCII_ART.split("\n")
      .map((line) => green(line))
      .join("\n");
    console.log(`\n${colored}\n`);
  } else {
    console.log(`\n${ASCII_ART}\n`);
  }
}

// ---------------------------------------------------------------------------
// Runtime detection — prefer bun when available, fall back to node/npx.
// ---------------------------------------------------------------------------

function which(cmd) {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === "win32";
  const pathext = isWindows ? process.env.PATHEXT : "";
  const exts = isWindows
    ? pathext?.length
      ? pathext.split(";").filter(Boolean)
      : [".EXE", ".CMD", ".BAT", ".COM"]
    : [""];

  for (const dir of dirs) {
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

const forceNodeRuntime = process.env.MILAIDY_FORCE_NODE === "1";
const hasBun = !forceNodeRuntime && !!which("bun");

if (!hasBun && !which("npx")) {
  console.error(
    'Neither "bun" nor "npx" was found in your PATH. ' +
      "Install Bun or Node.js with npx to run this dev script.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Output filter — only forward error-level lines from the API server.
// ---------------------------------------------------------------------------

const SUPPRESS_RE = /^\s*(Info|Warn|Debug|Trace)\s/;
const SUPPRESS_UNSTRUCTURED_RE = /^\[dotenv[@\d]/;

function createErrorFilter(dest) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
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
  const viteCmd = hasBun ? "bunx" : "npx";
  viteProcess = spawn(viteCmd, ["vite", "--port", String(UI_PORT)], {
    cwd: path.join(cwd, "apps/app"),
    env: { ...process.env, MILAIDY_API_PORT: String(API_PORT) },
    stdio: ["inherit", "pipe", "pipe"],
  });

  viteProcess.stdout.on("data", (data) => {
    const text = data.toString();
    if (text.includes("ready")) {
      console.log(
        `\n  ${green("[milaidy]")} ${orange(`http://localhost:${UI_PORT}/`)}\n`,
      );
    }
  });

  viteProcess.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  viteProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${green("[milaidy]")} Vite exited with code ${code}`);
      if (apiProcess) apiProcess.kill();
      process.exit(code ?? 1);
    }
  });
}

if (uiOnly) {
  startVite();
} else {
  console.log(`${orange("\nmilaidy dev mode")}\n`);
  printBanner();
  console.log(`  ${green("[milaidy]")} ${green("Starting dev server...")}\n`);

  const nodeStealthImports = [
    "./openai-codex-stealth.mjs",
    "./claude-code-stealth.mjs",
  ].filter((filePath) => existsSync(path.join(cwd, filePath)));

  const apiCmd = hasBun
    ? ["bun", "--watch", "src/runtime/dev-server.ts"]
    : [
        "node",
        ...nodeStealthImports.flatMap((filePath) => ["--import", filePath]),
        "--import",
        "tsx",
        "--watch",
        "src/runtime/dev-server.ts",
      ];
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

  apiProcess.stderr.on("data", createErrorFilter(process.stderr));
  apiProcess.stdout.on("data", () => {});

  apiProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(
        `\n  ${green("[milaidy]")} Server exited with code ${code}`,
      );
      if (viteProcess) viteProcess.kill();
      process.exit(code ?? 1);
    }
  });

  const startTime = Date.now();
  const dots = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `\r  ${green("[milaidy]")} ${green(`Waiting for API server... ${dim(`${elapsed}s`)}`)}`,
    );
  }, 1000);

  waitForPort(API_PORT)
    .then(() => {
      clearInterval(dots);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `\r  ${green("[milaidy]")} ${green(`API server ready`)} ${dim(`(${elapsed}s)`)}          `,
      );
      startVite();
    })
    .catch((err) => {
      clearInterval(dots);
      console.error(`\n  ${green("[milaidy]")} ${err.message}`);
      if (apiProcess) apiProcess.kill();
      process.exit(1);
    });
}
