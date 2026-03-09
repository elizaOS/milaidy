/**
 * Health check functions for `milady doctor`.
 *
 * All functions are pure / injectable — no top-level side effects — so they
 * can be unit-tested without touching the filesystem or network.
 */

import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
  fix?: string;
}

// ---------------------------------------------------------------------------
// Model provider API key env vars (order = display preference)
// ---------------------------------------------------------------------------

export const MODEL_KEY_VARS = [
  { key: "ANTHROPIC_API_KEY", alias: "CLAUDE_API_KEY", label: "Anthropic (Claude)" },
  { key: "OPENAI_API_KEY", label: "OpenAI" },
  { key: "GOOGLE_API_KEY", alias: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google (Gemini)" },
  { key: "GROQ_API_KEY", label: "Groq" },
  { key: "XAI_API_KEY", alias: "GROK_API_KEY", label: "xAI (Grok)" },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter" },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek" },
  { key: "TOGETHER_API_KEY", label: "Together AI" },
  { key: "MISTRAL_API_KEY", label: "Mistral" },
  { key: "COHERE_API_KEY", label: "Cohere" },
  { key: "PERPLEXITY_API_KEY", label: "Perplexity" },
  { key: "ZAI_API_KEY", alias: "Z_AI_API_KEY", label: "Zai" },
  { key: "AI_GATEWAY_API_KEY", alias: "AIGATEWAY_API_KEY", label: "Vercel AI Gateway" },
  { key: "ELIZAOS_CLOUD_API_KEY", label: "elizaOS Cloud" },
  { key: "OLLAMA_BASE_URL", label: "Ollama (local)" },
] as const;

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export function checkRuntime(): CheckResult {
  const isBun =
    typeof (globalThis as Record<string, unknown>).Bun !== "undefined";

  if (isBun) {
    const bun = (globalThis as Record<string, unknown>).Bun as {
      version: string;
    };
    const [major] = bun.version.split(".").map(Number);
    if (major < 1) {
      return {
        label: "Runtime",
        status: "fail",
        detail: `Bun ${bun.version} (requires >=1.0)`,
        fix: "curl -fsSL https://bun.sh/install | bash",
      };
    }
    return { label: "Runtime", status: "pass", detail: `Bun ${bun.version}` };
  }

  const ver = process.version;
  const match = ver.match(/^v(\d+)/);
  const major = match ? Number(match[1]) : 0;
  if (major < 22) {
    return {
      label: "Runtime",
      status: "fail",
      detail: `Node.js ${ver} (requires >=22)`,
      fix: "Install Node.js 22+ — https://nodejs.org",
    };
  }
  return { label: "Runtime", status: "pass", detail: `Node.js ${ver}` };
}

export function checkConfigFile(configPath?: string): CheckResult {
  const resolved =
    configPath ??
    process.env.MILADY_CONFIG_PATH ??
    path.join(os.homedir(), ".milady", "milady.json");

  if (!existsSync(resolved)) {
    return {
      label: "Config file",
      status: "warn",
      detail: `Not found: ${resolved}`,
      fix: "milady setup",
    };
  }

  try {
    JSON.parse(readFileSync(resolved, "utf-8"));
    return { label: "Config file", status: "pass", detail: resolved };
  } catch {
    return {
      label: "Config file",
      status: "fail",
      detail: `Invalid JSON: ${resolved}`,
      fix: `Edit and fix: ${resolved}`,
    };
  }
}

export function checkModelKey(
  env: Record<string, string | undefined> = process.env,
): CheckResult {
  for (const entry of MODEL_KEY_VARS) {
    if (env[entry.key]?.trim()) {
      return {
        label: "Model API key",
        status: "pass",
        detail: `${entry.key} is set (${entry.label})`,
      };
    }
    if ("alias" in entry && entry.alias && env[entry.alias]?.trim()) {
      return {
        label: "Model API key",
        status: "pass",
        detail: `${entry.alias} is set (${entry.label})`,
      };
    }
  }
  return {
    label: "Model API key",
    status: "fail",
    detail: "No model provider API key found",
    fix: "milady setup",
  };
}

export function checkStateDir(
  env: Record<string, string | undefined> = process.env,
): CheckResult {
  const dir =
    env.MILADY_STATE_DIR ?? path.join(os.homedir(), ".milady");

  if (!existsSync(dir)) {
    return {
      label: "State directory",
      status: "warn",
      detail: `${dir} (will be created on first run)`,
    };
  }

  try {
    accessSync(dir, constants.W_OK);
    return { label: "State directory", status: "pass", detail: dir };
  } catch {
    return {
      label: "State directory",
      status: "fail",
      detail: `${dir} is not writable`,
      fix: `chmod u+w "${dir}"`,
    };
  }
}

export function checkDatabase(
  env: Record<string, string | undefined> = process.env,
): CheckResult {
  const stateDir =
    env.MILADY_STATE_DIR ?? path.join(os.homedir(), ".milady");
  const dbDir = path.join(stateDir, "workspace", ".eliza", ".elizadb");

  if (!existsSync(dbDir)) {
    return {
      label: "Database",
      status: "warn",
      detail: "Not initialized (created automatically on first start)",
    };
  }

  return { label: "Database", status: "pass", detail: dbDir };
}

export function checkPort(port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve({
        label: `Port ${port}`,
        status: "warn",
        detail: "In use by another process",
        fix: `MILADY_PORT=<other> milady start`,
      });
    });
    socket.once("error", () => {
      socket.destroy();
      resolve({ label: `Port ${port}`, status: "pass", detail: "Available" });
    });
  });
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

export interface DoctorOptions {
  env?: Record<string, string | undefined>;
  configPath?: string;
  checkPorts?: boolean;
  apiPort?: number;
  uiPort?: number;
}

export async function runAllChecks(opts: DoctorOptions = {}): Promise<CheckResult[]> {
  const env = opts.env ?? process.env;

  const sync: CheckResult[] = [
    checkRuntime(),
    checkConfigFile(opts.configPath),
    checkModelKey(env),
    checkStateDir(env),
    checkDatabase(env),
  ];

  if (opts.checkPorts === false) {
    return sync;
  }

  const portResults = await Promise.all([
    checkPort(opts.apiPort ?? 31337),
    checkPort(opts.uiPort ?? 2138),
  ]);

  return [...sync, ...portResults];
}
