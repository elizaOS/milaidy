import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { collectConfigEnvVars } from "./env-vars.js";
import { resolveConfigIncludes } from "./includes.js";
import { resolveConfigPath } from "./paths.js";
import type { MilaidyConfig } from "./types.js";

export * from "./types.js";

export function loadMilaidyConfig(): MilaidyConfig {
  const configPath = resolveConfigPath();

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { logging: { level: "error" } } as MilaidyConfig;
    }
    throw err;
  }

  const parsed = JSON5.parse(raw) as Record<string, unknown>;
  const resolved = resolveConfigIncludes(parsed, configPath) as MilaidyConfig;

  // Apply default log level so consumers don't need scattered fallbacks.
  if (!resolved.logging) {
    resolved.logging = { level: "error" };
  } else if (!resolved.logging.level) {
    resolved.logging.level = "error";
  }

  const envVars = collectConfigEnvVars(resolved);
  for (const [key, value] of Object.entries(envVars)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return resolved;
}

export function saveMilaidyConfig(config: MilaidyConfig): void {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600, // Owner read+write only — config may contain private keys in env section
  });
}

export function configFileExists(): boolean {
  return fs.existsSync(resolveConfigPath());
}
