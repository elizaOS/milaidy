import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import JSON5 from "json5";
import { formatDocsLink } from "../../terminal/links";
import { theme } from "../../terminal/theme";
import { runCommandWithRuntime } from "../cli-utils";

const defaultRuntime = { error: console.error, exit: process.exit };

// ---------------------------------------------------------------------------
// Provider menu — shown when no key is configured yet
// ---------------------------------------------------------------------------

const PROVIDERS = [
  {
    label: "Anthropic (Claude)",
    key: "ANTHROPIC_API_KEY",
    keyHint: "sk-ant-...",
  },
  { label: "OpenAI (GPT)", key: "OPENAI_API_KEY", keyHint: "sk-..." },
  { label: "Google (Gemini)", key: "GOOGLE_API_KEY", keyHint: "AIza..." },
  { label: "Groq", key: "GROQ_API_KEY", keyHint: "gsk_..." },
  { label: "xAI (Grok)", key: "XAI_API_KEY", keyHint: "xai-..." },
  { label: "OpenRouter", key: "OPENROUTER_API_KEY", keyHint: "sk-or-..." },
  { label: "Mistral", key: "MISTRAL_API_KEY", keyHint: "" },
  {
    label: "Ollama (local, no key)",
    key: "OLLAMA_BASE_URL",
    keyHint: "http://localhost:11434",
  },
  { label: "Skip for now", key: null, keyHint: "" },
] as const;

// ---------------------------------------------------------------------------
// readline helpers
// ---------------------------------------------------------------------------

async function ask(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  // readline doesn't natively hide input; we suppress echo via raw mode
  const { createInterface } = await import("node:readline");
  process.stdout.write(prompt);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode?.(true);
    process.stdin.on("data", function handler(chunk) {
      const char = chunk.toString();
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
      } else if (char === "\u0003") {
        // Ctrl-C
        process.stdin.setRawMode?.(false);
        rl.close();
        process.exit(0);
      } else if (char === "\u007f") {
        // Backspace
        if (value.length > 0) value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}

async function readStdinValue(): Promise<string> {
  if (process.stdin.isTTY) return "";

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf-8").trim();
}

// ---------------------------------------------------------------------------
// Config read/write
// ---------------------------------------------------------------------------

function resolveConfigPath(env = process.env): string {
  if (env.MILADY_CONFIG_PATH?.trim()) {
    return env.MILADY_CONFIG_PATH;
  }

  const stateDir =
    env.MILADY_STATE_DIR?.trim() || path.join(os.homedir(), ".milady");
  return path.join(stateDir, "milady.json");
}

function loadConfig(configPath: string): Record<string, unknown> {
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON5.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveConfig(configPath: string, config: Record<string, unknown>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function getEnvSection(
  config: Record<string, unknown>,
): Record<string, string> {
  const env = config.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    return { ...(env as Record<string, string>) };
  }
  return {};
}

function hasModelKey(env: Record<string, string | undefined>): string | null {
  const keys = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "GROK_API_KEY",
    "OPENROUTER_API_KEY",
    "DEEPSEEK_API_KEY",
    "TOGETHER_API_KEY",
    "MISTRAL_API_KEY",
    "COHERE_API_KEY",
    "PERPLEXITY_API_KEY",
    "ZAI_API_KEY",
    "Z_AI_API_KEY",
    "AI_GATEWAY_API_KEY",
    "ELIZAOS_CLOUD_API_KEY",
    "OLLAMA_BASE_URL",
  ];
  return keys.find((k) => env[k]?.trim()) ?? null;
}

// ---------------------------------------------------------------------------
// Interactive provider wizard
// ---------------------------------------------------------------------------

async function runProviderWizard(configPath: string): Promise<void> {
  const config = loadConfig(configPath);
  const envSection = getEnvSection(config);
  const combinedEnv = { ...process.env, ...envSection } as Record<
    string,
    string | undefined
  >;
  const existingKey = hasModelKey(combinedEnv);

  if (existingKey) {
    console.log(
      `\n${theme.success("✓")} Model API key already set: ${theme.command(existingKey)}`,
    );
    const reconfigure = await ask(`  Reconfigure? ${theme.muted("(y/N) ")}`);
    if (reconfigure.toLowerCase() !== "y") return;
  }

  console.log(`\n${theme.heading("Model Provider Setup")}\n`);
  console.log("  Choose your AI model provider:\n");

  PROVIDERS.forEach((p, i) => {
    const num = theme.muted(`${i + 1}.`);
    console.log(`  ${num} ${p.label}`);
  });

  const choice = await ask(`\n  Provider ${theme.muted("[1]")} `);
  const index = choice === "" ? 0 : Number(choice) - 1;

  if (Number.isNaN(index) || index < 0 || index >= PROVIDERS.length) {
    console.log(`${theme.warn("⚠")}  Invalid choice. Skipping model setup.`);
    return;
  }

  const provider = PROVIDERS[index];
  if (provider.key === null) {
    console.log(
      `${theme.muted("→")} Skipped. Set a key later with ${theme.command("milady setup")}.`,
    );
    return;
  }

  const hint = provider.keyHint
    ? ` ${theme.muted(`(e.g. ${provider.keyHint})`)}`
    : "";
  const isUrl = provider.key === "OLLAMA_BASE_URL";
  const valueLabel = isUrl ? "Base URL" : "API key";

  let value: string;
  if (isUrl) {
    value = await ask(
      `  ${valueLabel}${hint} ${theme.muted(`[http://localhost:11434]`)} `,
    );
    if (value === "") value = "http://localhost:11434";
  } else {
    value = await askSecret(`  ${valueLabel}${hint}: `);
  }

  if (!value) {
    console.log(`${theme.warn("⚠")}  No value entered. Skipping.`);
    return;
  }

  // Write into config env section
  envSection[provider.key] = value;
  config.env = envSection;
  saveConfig(configPath, config);

  console.log(
    `${theme.success("✓")} Saved ${theme.command(provider.key)} to ${configPath}`,
  );
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerSetupCommand(program: Command) {
  program
    .command("setup")
    .description("Initialize ~/.milady/milady.json and the agent workspace")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/getting-started/setup", "docs.milady.ai/getting-started/setup")}\n`,
    )
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--provider <name>", "Model provider (non-interactive)")
    .option(
      "--key <value>",
      "Unsafe: API key or URL via argv (prefer --key-stdin)",
    )
    .option("--key-stdin", "Read the API key or URL from stdin")
    .option("--no-wizard", "Skip the model provider wizard")
    .action(
      async (opts: {
        workspace?: string;
        provider?: string;
        key?: string;
        keyStdin?: boolean;
        wizard: boolean;
      }) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          const { loadMiladyConfig } = await import("../../config/config");
          const { ensureAgentWorkspace, resolveDefaultAgentWorkspaceDir } =
            await import("../../providers/workspace");

          const configPath = resolveConfigPath();
          const keyFromStdin = opts.keyStdin ? await readStdinValue() : "";
          const keyValue = opts.key ?? keyFromStdin;

          if (opts.key && opts.keyStdin) {
            throw new Error("Use either --key or --key-stdin, not both.");
          }

          if (opts.keyStdin && !keyFromStdin) {
            throw new Error("No API key or URL received on stdin.");
          }

          // ── Non-interactive provider set via flags ───────────────────────
          if (opts.provider && keyValue) {
            const providerQuery = opts.provider.toLowerCase();
            const providerEntry = PROVIDERS.find(
              (p) =>
                p.label.toLowerCase().includes(providerQuery) ||
                (p.key ?? "").toLowerCase().includes(providerQuery),
            );
            const envKey =
              providerEntry?.key ??
              opts.provider.toUpperCase().replace(/[^A-Z0-9]/g, "_") +
                "_API_KEY";
            const config = loadConfig(configPath);
            const envSection = getEnvSection(config);
            envSection[envKey] = keyValue;
            config.env = envSection;
            saveConfig(configPath, config);
            console.log(`${theme.success("✓")} Saved ${theme.command(envKey)}`);
            if (opts.key) {
              console.log(
                `${theme.warn("⚠")} ${theme.muted("Passing secrets via --key exposes them in shell history and process lists. Prefer --key-stdin.")}`,
              );
            }
          }

          // ── Interactive wizard (TTY only, skipped with --no-wizard) ──────
          if (opts.wizard !== false && process.stdin.isTTY && !opts.provider) {
            await runProviderWizard(configPath);
          }

          // ── Workspace bootstrap ──────────────────────────────────────────
          let config: Record<string, unknown> = {};
          try {
            config = loadMiladyConfig() as Record<string, unknown>;
            console.log(`${theme.success("✓")} Config loaded`);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
              console.log(
                `${theme.muted("→")} No config found, using defaults`,
              );
            } else {
              throw err;
            }
          }

          const agents = config.agents as
            | Record<string, Record<string, string>>
            | undefined;
          const workspaceDir =
            opts.workspace ??
            agents?.defaults?.workspace ??
            resolveDefaultAgentWorkspaceDir();

          await ensureAgentWorkspace({
            dir: workspaceDir,
            ensureBootstrapFiles: true,
          });

          console.log(
            `${theme.success("✓")} Agent workspace ready: ${workspaceDir}`,
          );

          // ── Final doctor summary ─────────────────────────────────────────
          if (process.stdin.isTTY) {
            console.log(
              `\n${theme.success("Setup complete.")} Running health check...\n`,
            );
            const { runAllChecks } = await import("../doctor/checks");
            const results = await runAllChecks({ checkPorts: false });
            for (const result of results) {
              const icon =
                result.status === "pass"
                  ? theme.success("✓")
                  : result.status === "fail"
                    ? theme.error("✗")
                    : theme.warn("⚠");
              const detail = result.detail
                ? theme.muted(` ${result.detail}`)
                : "";
              console.log(`  ${icon} ${result.label}${detail}`);
            }
            console.log(
              `\n  Run ${theme.command("milady start")} to launch your agent.\n`,
            );
          } else {
            console.log(`\n${theme.success("Setup complete.")}`);
          }
        });
      },
    );
}
