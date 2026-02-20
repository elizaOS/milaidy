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
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";
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
const onchainEnabled =
  !uiOnly && coerceBoolean(process.env.MILADY_DEV_ONCHAIN) !== false;
const anchorRequested =
  !uiOnly && coerceBoolean(process.env.MILADY_DEV_ANCHOR) !== false;
const anchorRequired = process.env.MILADY_DEV_REQUIRE_ANCHOR === "1";
const verboseChainLogs = process.env.MILADY_DEV_CHAIN_VERBOSE === "1";
const ANVIL_PORT = Number(process.env.MILADY_DEV_ANVIL_PORT ?? 8545);
const ANVIL_CHAIN_ID = Number(process.env.MILADY_DEV_CHAIN_ID ?? 31337);
const ANVIL_RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const ANCHOR_RPC_URL =
  process.env.MILADY_DEV_ANCHOR_RPC_URL ?? "http://127.0.0.1:8899";
const DEFAULT_EVM_DEV_PRIVATE_KEY =
  process.env.MILADY_DEV_EVM_PRIVATE_KEY ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ANVIL_DEPLOYER_PRIVATE_KEY =
  process.env.MILADY_DEV_ANVIL_DEPLOYER_PRIVATE_KEY ??
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

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

  // Auto-detect subscription credentials: if the user has logged in via
  // a subscription provider, enable the corresponding stealth interceptor
  // automatically (unless explicitly disabled above).
  const stateDir =
    process.env.MILADY_STATE_DIR?.trim() || path.join(os.homedir(), ".milady");
  if (openaiFlag === null) {
    const codexAuthPath = path.join(stateDir, "auth", "openai-codex.json");
    if (existsSync(codexAuthPath)) {
      openaiFlag = true;
    }
  }
  if (claudeFlag === null) {
    const anthropicAuthPath = path.join(
      stateDir,
      "auth",
      "anthropic-subscription.json",
    );
    if (existsSync(anthropicAuthPath)) {
      claudeFlag = true;
    }
  }

  return {
    openai: openaiFlag === true,
    claude: claudeFlag === true,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForJsonRpc(
  rpcUrl,
  method,
  {
    params = [],
    timeoutMs = 30_000,
    intervalMs = 250,
    validate = (payload) => payload?.result !== undefined,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        if (validate(payload)) {
          return payload;
        }
      }
    } catch {
      // Not ready yet.
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for JSON-RPC method "${method}" at ${rpcUrl}`,
  );
}

function resolveAnchorWorkspace() {
  const explicit = process.env.MILADY_ANCHOR_WORKSPACE?.trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    return existsSync(path.join(resolved, "Anchor.toml")) ? resolved : null;
  }

  const candidates = [
    cwd,
    path.join(cwd, "anchor"),
    path.join(cwd, "solana"),
    path.join(cwd, "programs"),
    path.join(cwd, "test", "anchor"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "Anchor.toml"))) {
      return candidate;
    }
  }
  return null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function resolveArtifactPath(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function createOnchainDevConfig({
  rpcUrl,
  registryAddress,
  collectionAddress,
  evmPrivateKey,
  solanaRpcUrl,
}) {
  const base = loadMiladyConfigForDev();
  const config =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  const nextRegistry =
    config.registry &&
    typeof config.registry === "object" &&
    !Array.isArray(config.registry)
      ? { ...config.registry }
      : {};
  nextRegistry.mainnetRpc = rpcUrl;
  nextRegistry.registryAddress = registryAddress;
  nextRegistry.collectionAddress = collectionAddress;
  config.registry = nextRegistry;

  const nextFeatures =
    config.features &&
    typeof config.features === "object" &&
    !Array.isArray(config.features)
      ? { ...config.features }
      : {};
  nextFeatures.dropEnabled = true;
  config.features = nextFeatures;

  const nextEnv =
    config.env && typeof config.env === "object" && !Array.isArray(config.env)
      ? { ...config.env }
      : {};
  nextEnv.EVM_PRIVATE_KEY = evmPrivateKey;
  if (solanaRpcUrl) {
    nextEnv.SOLANA_RPC_URL = solanaRpcUrl;
  }
  config.env = nextEnv;

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "milady-dev-onchain-"));
  const configPath = path.join(tempDir, "milady.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return { configPath, tempDir };
}

function spawnWithBufferedLogs(cmd, args, options = {}) {
  const proc = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  let stderrBuf = "";
  if (proc.stderr) {
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuf = `${stderrBuf}${text}`;
      if (stderrBuf.length > 4000) {
        stderrBuf = stderrBuf.slice(-4000);
      }
      if (verboseChainLogs) {
        process.stderr.write(text);
      }
    });
  }

  if (proc.stdout && verboseChainLogs) {
    proc.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
  }

  return { proc, getBufferedStderr: () => stderrBuf.trim() };
}

async function bootstrapOnchainDev() {
  if (!onchainEnabled) {
    return {
      env: {},
      anvil: null,
      anchor: null,
      tempDir: null,
    };
  }

  if (!which("anvil")) {
    throw new Error(
      "Anvil binary not found. Install Foundry or set MILADY_DEV_ONCHAIN=0 to run without chain bootstrap.",
    );
  }

  killPort(ANVIL_PORT);
  const anvilArgs = [
    "--host",
    "127.0.0.1",
    "--port",
    String(ANVIL_PORT),
    "--chain-id",
    String(ANVIL_CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "10000",
  ];

  const { proc: anvil, getBufferedStderr } = spawnWithBufferedLogs(
    "anvil",
    anvilArgs,
    { cwd },
  );

  const anvilExit = new Promise((_, reject) => {
    anvil.once("error", (err) => {
      reject(err);
    });
    anvil.once("exit", (code, signal) => {
      reject(
        new Error(
          `Anvil exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        ),
      );
    });
  });

  try {
    await Promise.race([
      waitForJsonRpc(ANVIL_RPC_URL, "eth_chainId", {
        validate: (payload) =>
          typeof payload?.result === "string" &&
          Number.parseInt(payload.result, 16) === ANVIL_CHAIN_ID,
      }),
      anvilExit,
    ]);
  } catch (err) {
    anvil.kill("SIGTERM");
    const stderr = getBufferedStderr();
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to start Anvil on ${ANVIL_RPC_URL}: ${msg}${stderr ? `\n${stderr}` : ""}`,
    );
  }

  const provider = new ethers.JsonRpcProvider(ANVIL_RPC_URL);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== ANVIL_CHAIN_ID) {
    anvil.kill("SIGTERM");
    throw new Error(
      `Anvil chain id mismatch: expected ${ANVIL_CHAIN_ID}, got ${network.chainId}`,
    );
  }

  const registryArtifactPath = resolveArtifactPath([
    path.join(
      cwd,
      "test",
      "contracts",
      "out",
      "MockMiladyAgentRegistry.sol",
      "MockMiladyAgentRegistry.json",
    ),
    path.join(
      cwd,
      "test",
      "contracts",
      "out",
      "MockMilaidyAgentRegistry.sol",
      "MockMilaidyAgentRegistry.json",
    ),
  ]);
  const collectionArtifactPath = resolveArtifactPath([
    path.join(
      cwd,
      "test",
      "contracts",
      "out",
      "MockMiladyCollection.sol",
      "MockMiladyCollection.json",
    ),
    path.join(
      cwd,
      "test",
      "contracts",
      "out",
      "MockMilaidyCollection.sol",
      "MockMilaidyCollection.json",
    ),
  ]);

  if (!registryArtifactPath || !collectionArtifactPath) {
    anvil.kill("SIGTERM");
    throw new Error(
      "Missing contract artifacts under test/contracts/out. Run `cd test/contracts && forge build`.",
    );
  }

  const registryArtifact = readJson(registryArtifactPath);
  const collectionArtifact = readJson(collectionArtifactPath);
  const deployer = new ethers.Wallet(ANVIL_DEPLOYER_PRIVATE_KEY, provider);

  let nonce = await deployer.getNonce("pending");
  const registryFactory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode.object,
    deployer,
  );
  const registryContract = await registryFactory.deploy({ nonce });
  await registryContract.waitForDeployment();
  nonce += 1;

  const collectionFactory = new ethers.ContractFactory(
    collectionArtifact.abi,
    collectionArtifact.bytecode.object,
    deployer,
  );
  const collectionContract = await collectionFactory.deploy({ nonce });
  await collectionContract.waitForDeployment();

  const registryAddress = await registryContract.getAddress();
  const collectionAddress = await collectionContract.getAddress();

  const [totalAgents, collectionDetails] = await Promise.all([
    registryContract.totalAgents(),
    collectionContract.getCollectionDetails(),
  ]);
  if (Number(totalAgents) !== 0) {
    anvil.kill("SIGTERM");
    throw new Error(
      `Registry verification failed: expected totalAgents=0, got ${totalAgents}`,
    );
  }
  if (Number(collectionDetails[1]) !== 0) {
    anvil.kill("SIGTERM");
    throw new Error(
      `Collection verification failed: expected currentSupply=0, got ${collectionDetails[1]}`,
    );
  }

  const validationWallet = new ethers.Wallet(
    DEFAULT_EVM_DEV_PRIVATE_KEY,
    provider,
  );
  await registryContract
    .connect(validationWallet)
    .registerAgent.staticCall(
      "MiladyDevValidation",
      "http://localhost:31337/dev-validation",
      ethers.id("milady-dev"),
      "ipfs://milady-dev-validation",
    );
  await collectionContract
    .connect(validationWallet)
    .mint.staticCall(
      "MiladyDevValidation",
      "http://localhost:31337/dev-validation",
      ethers.id("milady-dev"),
    );

  let anchor = null;
  let anchorConfigured = false;
  const anchorWorkspace = resolveAnchorWorkspace();
  if (anchorRequested) {
    if (!anchorWorkspace) {
      const msg =
        "Anchor workspace not found (no Anchor.toml). Skipping anchor localnet bootstrap.";
      if (anchorRequired) {
        anvil.kill("SIGTERM");
        throw new Error(msg);
      }
      console.log(`  ${green("[milady]")} ${dim(msg)}`);
    } else if (!which("anchor")) {
      const msg =
        "Anchor CLI not found in PATH. Skipping anchor localnet bootstrap.";
      if (anchorRequired) {
        anvil.kill("SIGTERM");
        throw new Error(msg);
      }
      console.log(`  ${green("[milady]")} ${dim(msg)}`);
    } else {
      const { proc: anchorProc, getBufferedStderr: getAnchorStderr } =
        spawnWithBufferedLogs("anchor", ["localnet", "--skip-build"], {
          cwd: anchorWorkspace,
          env: { ...process.env },
        });

      const anchorExit = new Promise((_, reject) => {
        anchorProc.once("error", (err) => reject(err));
        anchorProc.once("exit", (code, signal) => {
          reject(
            new Error(
              `Anchor localnet exited before readiness (code=${code ?? "null"}, signal=${signal ?? "null"})`,
            ),
          );
        });
      });

      try {
        await Promise.race([
          waitForJsonRpc(ANCHOR_RPC_URL, "getHealth", {
            validate: (payload) => payload?.result === "ok",
            timeoutMs: 60_000,
          }),
          anchorExit,
        ]);
        anchor = anchorProc;
        anchorConfigured = true;
      } catch (err) {
        anchorProc.kill("SIGTERM");
        const stderr = getAnchorStderr();
        const msg = err instanceof Error ? err.message : String(err);
        if (anchorRequired) {
          anvil.kill("SIGTERM");
          throw new Error(
            `Failed to start anchor localnet: ${msg}${stderr ? `\n${stderr}` : ""}`,
          );
        }
        console.log(
          `  ${green("[milady]")} ${dim(`Anchor localnet unavailable: ${msg}`)}`,
        );
      }
    }
  }

  const { configPath, tempDir } = createOnchainDevConfig({
    rpcUrl: ANVIL_RPC_URL,
    registryAddress,
    collectionAddress,
    evmPrivateKey: DEFAULT_EVM_DEV_PRIVATE_KEY,
    solanaRpcUrl: anchorConfigured ? ANCHOR_RPC_URL : undefined,
  });

  return {
    env: {
      MILADY_CONFIG_PATH: configPath,
      EVM_PRIVATE_KEY: DEFAULT_EVM_DEV_PRIVATE_KEY,
      MILADY_DEV_CHAIN_ID: String(ANVIL_CHAIN_ID),
      MILADY_DEV_CHAIN_RPC: ANVIL_RPC_URL,
      MILADY_DEV_REGISTRY_ADDRESS: registryAddress,
      MILADY_DEV_COLLECTION_ADDRESS: collectionAddress,
      ...(anchorConfigured ? { SOLANA_RPC_URL: ANCHOR_RPC_URL } : {}),
    },
    anvil,
    anchor,
    tempDir,
    registryAddress,
    collectionAddress,
    anchorConfigured,
  };
}

// ---------------------------------------------------------------------------
// Output filters for API server logs.
// ---------------------------------------------------------------------------

const SUPPRESS_RE = /^\s*(Info|Warn|Debug|Trace)\s/;
const SUPPRESS_UNSTRUCTURED_RE = /^\[dotenv[@\d]/;
const STARTUP_RE =
  /\[milady(?:-api)?\]|runtime bootstrap|runtime ready|runtime created|api server ready|plugin.*load|startup.*complete|\d+ms/i;

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
  if (onchainEnabled) {
    killPort(ANVIL_PORT);
  }
}

let apiProcess = null;
let viteProcess = null;
let anvilProcess = null;
let anchorProcess = null;
let tempOnchainDir = null;
let shuttingDown = false;

function terminateChild(proc, signal = "SIGTERM") {
  if (!proc || proc.killed) return;
  try {
    proc.kill(signal);
  } catch {
    // Best effort.
  }
}

function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  terminateChild(viteProcess);
  terminateChild(apiProcess);
  terminateChild(anchorProcess);
  terminateChild(anvilProcess);

  if (tempOnchainDir) {
    try {
      rmSync(tempOnchainDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 400).unref();
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

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
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`${green("[milady]")} Vite exited with code ${code}`);
      cleanup(code ?? 1);
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

  let chainEnv = {};
  if (onchainEnabled) {
    console.log(
      `  ${green("[milady]")} ${green("Bootstrapping local chain...")}`,
    );
    try {
      const chain = await bootstrapOnchainDev();
      chainEnv = chain.env;
      anvilProcess = chain.anvil;
      anchorProcess = chain.anchor;
      tempOnchainDir = chain.tempDir;

      console.log(
        `  ${green("[milady]")} ${dim(`Anvil ready at ${ANVIL_RPC_URL} (chainId=${ANVIL_CHAIN_ID})`)}`,
      );
      console.log(
        `  ${green("[milady]")} ${dim(`Registry deployed: ${chain.registryAddress}`)}`,
      );
      console.log(
        `  ${green("[milady]")} ${dim(`Collection deployed: ${chain.collectionAddress}`)}`,
      );
      if (chain.anchorConfigured) {
        console.log(
          `  ${green("[milady]")} ${dim(`Anchor localnet ready at ${ANCHOR_RPC_URL}`)}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ${green("[milady]")} ${msg}`);
      cleanup(1);
      process.exit(1);
    }
  } else {
    console.log(
      `  ${green("[milady]")} ${dim("On-chain bootstrap disabled (MILADY_DEV_ONCHAIN=0)")}`,
    );
  }

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
    ? [
        "bun",
        ...resolvedStealthImports.flatMap((filePath) => [
          "--preload",
          filePath,
        ]),
        "--watch",
        "src/runtime/dev-server.ts",
      ]
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
      ...chainEnv,
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
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`\n  ${green("[milady]")} Server exited with code ${code}`);
      cleanup(code ?? 1);
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
      cleanup(1);
    });
}
