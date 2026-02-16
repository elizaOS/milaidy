#!/usr/bin/env node
/**
 * Development script that starts:
 * 1. The Milady dev server (runtime + API on port 31337) with restart support
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
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import JSON5 from "json5";

const API_PORT = 31337;
const UI_PORT = 2138;
const cwd = process.cwd();
const uiOnly = process.argv.includes("--ui-only");
const devLogLevel =
  (process.env.MILADY_DEV_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info")
    .trim()
    .toLowerCase() || "info";
const quietApiLogs = process.env.MILADY_DEV_QUIET_LOGS === "1";
const verboseApiLogs = process.env.MILADY_DEV_VERBOSE_LOGS === "1";

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

const forceNodeRuntime = process.env.MILADY_FORCE_NODE === "1";
const hasBun = !forceNodeRuntime && !!which("bun");

if (!hasBun && !which("npx")) {
  console.error(
    'Neither "bun" nor "npx" was found in your PATH. ' +
      "Install Bun or Node.js with npx to run this dev script.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stealth import config
// ---------------------------------------------------------------------------

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveMiladyConfigPath() {
  const explicitConfigPath = process.env.MILADY_CONFIG_PATH?.trim();
  if (explicitConfigPath) {
    return path.resolve(explicitConfigPath);
  }

  const explicitStateDir = process.env.MILADY_STATE_DIR?.trim();
  if (explicitStateDir) {
    return path.join(path.resolve(explicitStateDir), "milady.json");
  }

  return path.join(os.homedir(), ".milady", "milady.json");
}

function loadMiladyConfigForDev() {
  const configPath = resolveMiladyConfigPath();
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON5.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `${green("[milady]")} Failed to parse config at ${configPath}: ${msg}`,
    );
    return null;
  }
}

function readPluginStealthFlag(entries, ids) {
  if (!entries || typeof entries !== "object") return null;

  for (const id of ids) {
    const entry = entries[id];
    if (!entry || typeof entry !== "object") continue;

    const config = entry.config;
    if (!config || typeof config !== "object") continue;

    const stealthFlag =
      config.stealthImport ??
      config.enableStealthImport ??
      config.enableStealth;
    const parsed = coerceBoolean(stealthFlag);
    if (parsed !== null) return parsed;
  }

  return null;
}

function resolveStealthImportFlags() {
  let openaiFlag = coerceBoolean(process.env.MILADY_ENABLE_OPENAI_STEALTH);
  let claudeFlag = coerceBoolean(process.env.MILADY_ENABLE_CLAUDE_STEALTH);

  const globalFlag = coerceBoolean(process.env.MILADY_ENABLE_STEALTH_IMPORTS);
  if (globalFlag !== null) {
    openaiFlag = globalFlag;
    claudeFlag = globalFlag;
  }

  const config = loadMiladyConfigForDev();
  if (config && typeof config === "object") {
    const feature = config.features?.stealthImports;
    if (typeof feature === "boolean") {
      if (openaiFlag === null) openaiFlag = feature;
      if (claudeFlag === null) claudeFlag = feature;
    } else if (feature && typeof feature === "object") {
      const enabled = coerceBoolean(feature.enabled);
      if (enabled !== null) {
        if (openaiFlag === null) openaiFlag = enabled;
        if (claudeFlag === null) claudeFlag = enabled;
      }

      const openaiFeature =
        coerceBoolean(feature.openai) ?? coerceBoolean(feature.codex);
      const claudeFeature =
        coerceBoolean(feature.claude) ?? coerceBoolean(feature.anthropic);

      if (openaiFeature !== null && openaiFlag === null) {
        openaiFlag = openaiFeature;
      }
      if (claudeFeature !== null && claudeFlag === null) {
        claudeFlag = claudeFeature;
      }
    }

    const pluginEntries = config.plugins?.entries;
    const openaiPluginStealth = readPluginStealthFlag(pluginEntries, [
      "openai",
      "@elizaos/plugin-openai",
      "openai-codex-stealth",
    ]);
    const claudePluginStealth = readPluginStealthFlag(pluginEntries, [
      "anthropic",
      "@elizaos/plugin-anthropic",
      "claude-code-stealth",
    ]);

    if (openaiPluginStealth !== null && openaiFlag === null) {
      openaiFlag = openaiPluginStealth;
    }
    if (claudePluginStealth !== null && claudeFlag === null) {
      claudeFlag = claudePluginStealth;
    }
  }

  return {
    openai: openaiFlag === true,
    claude: claudeFlag === true,
  };
}

// ---------------------------------------------------------------------------
// Output filters for API server logs.
// ---------------------------------------------------------------------------

const SUPPRESS_RE = /^\s*(Info|Warn|Debug|Trace)\s/;
const SUPPRESS_UNSTRUCTURED_RE = /^\[dotenv[@\d]/;
const STARTUP_RE =
  /\[milady(?:-api)?\]|runtime bootstrap|runtime ready|api server ready/i;

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

function createStartupFilter(dest) {
  let buf = "";
  let lastLine = "";
  let repeatCount = 0;
  return (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (SUPPRESS_UNSTRUCTURED_RE.test(trimmed)) continue;
      if (/embedding dimensions mismatch/i.test(trimmed)) continue;

      if (trimmed === lastLine) {
        repeatCount += 1;
        if (repeatCount > 2) continue;
      } else {
        lastLine = trimmed;
        repeatCount = 0;
      }

      const isWarnOrError = /^\s*(Warn|Error)\s/.test(trimmed);
      const isStartupLine = STARTUP_RE.test(trimmed);
      if (isWarnOrError || isStartupLine) {
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
    env: { ...process.env, MILADY_API_PORT: String(API_PORT) },
    stdio: ["inherit", "pipe", "pipe"],
  });

  viteProcess.stdout.on("data", (data) => {
    const text = data.toString();
    if (text.includes("ready")) {
      console.log(
        `\n  ${green("[milady]")} ${orange(`http://localhost:${UI_PORT}/`)}\n`,
      );
    }
  });

  viteProcess.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  viteProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${green("[milady]")} Vite exited with code ${code}`);
      if (apiProcess) apiProcess.kill();
      process.exit(code ?? 1);
    }
  });
}

if (uiOnly) {
  startVite();
} else {
  console.log(`${orange("\nmilady dev mode")}\n`);
  printBanner();
  console.log(`  ${green("[milady]")} ${green("Starting dev server...")}\n`);
  console.log(
    `  ${green("[milady]")} ${dim(
      `API log level=${devLogLevel}${
        quietApiLogs
          ? " (errors only)"
          : verboseApiLogs
            ? " (verbose)"
            : " (startup + warnings/errors)"
      }`,
    )}`,
  );

  // Security default: stealth shims are disabled unless explicitly enabled
  // via env vars or plugin config in milady.json.
  const stealth = resolveStealthImportFlags();
  const nodeStealthImports = [];
  if (stealth.openai) nodeStealthImports.push("./openai-codex-stealth.mjs");
  if (stealth.claude) nodeStealthImports.push("./claude-code-stealth.mjs");

  const resolvedStealthImports = nodeStealthImports.filter((filePath) =>
    existsSync(path.join(cwd, filePath)),
  );
  if (resolvedStealthImports.length > 0) {
    console.log(
      `  ${green("[milady]")} ${dim(`Stealth imports enabled: ${resolvedStealthImports.join(", ")}`)}`,
    );
  }

  const apiCmd = hasBun
    ? ["bun", "--watch", "src/runtime/dev-server.ts"]
    : [
        "node",
        ...resolvedStealthImports.flatMap((filePath) => ["--import", filePath]),
        "--import",
        "tsx",
        "--watch",
        "src/runtime/dev-server.ts",
      ];
  apiProcess = spawn(apiCmd[0], apiCmd.slice(1), {
    cwd,
    env: {
      ...process.env,
      MILADY_PORT: String(API_PORT),
      MILADY_HEADLESS: "1",
      LOG_LEVEL: devLogLevel,
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (quietApiLogs) {
    apiProcess.stderr.on("data", createErrorFilter(process.stderr));
    apiProcess.stdout.on("data", () => {});
  } else if (verboseApiLogs) {
    apiProcess.stderr.on("data", (data) => {
      process.stderr.write(data);
    });
    apiProcess.stdout.on("data", (data) => {
      process.stdout.write(data);
    });
  } else {
    apiProcess.stderr.on("data", createStartupFilter(process.stderr));
    apiProcess.stdout.on("data", createStartupFilter(process.stdout));
  }

  apiProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`\n  ${green("[milady]")} Server exited with code ${code}`);
      if (viteProcess) viteProcess.kill();
      process.exit(code ?? 1);
    }
  });

  const startTime = Date.now();
  const dots = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `\r  ${green("[milady]")} ${green(`Waiting for API server... ${dim(`${elapsed}s`)}`)}`,
    );
  }, 1000);

  waitForPort(API_PORT)
    .then(() => {
      clearInterval(dots);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `\r  ${green("[milady]")} ${green(`API server ready`)} ${dim(`(${elapsed}s)`)}          `,
      );
      startVite();
    })
    .catch((err) => {
      clearInterval(dots);
      console.error(`\n  ${green("[milady]")} ${err.message}`);
      if (apiProcess) apiProcess.kill();
      process.exit(1);
    });
}
