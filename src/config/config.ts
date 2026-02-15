import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { collectConfigEnvVars } from "./env-vars.js";
import { resolveConfigIncludes } from "./includes.js";
import { resolveConfigPath, resolveUserPath } from "./paths.js";
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

  // Load local skills config from ~/.eliza/skills.json (if present)
  // This allows users to add local skill directories without modifying the main config.
  const skillsJsonPath = resolveUserPath("~/.eliza/skills.json");

  // Auto-create if missing so the user knows where to put skills
  if (!fs.existsSync(skillsJsonPath)) {
    try {
      const skillsDir = path.dirname(skillsJsonPath);
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      fs.writeFileSync(
        skillsJsonPath,
        JSON.stringify({ extraDirs: [] }, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.warn(
        `[milaidy] Failed to auto-create ~/.eliza/skills.json: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (fs.existsSync(skillsJsonPath)) {
    try {
      const skillsRaw = fs.readFileSync(skillsJsonPath, "utf-8");
      const skillsConfig = JSON5.parse(skillsRaw) as { extraDirs?: string[] };

      if (
        skillsConfig.extraDirs &&
        Array.isArray(skillsConfig.extraDirs) &&
        skillsConfig.extraDirs.length > 0
      ) {
        if (!resolved.skills) resolved.skills = {};
        if (!resolved.skills.load) resolved.skills.load = {};
        if (!resolved.skills.load.extraDirs)
          resolved.skills.load.extraDirs = [];

        const existing = new Set(resolved.skills.load.extraDirs);
        for (const dir of skillsConfig.extraDirs) {
          const loadedDir = resolveUserPath(dir);
          if (!existing.has(loadedDir)) {
            resolved.skills.load.extraDirs.push(loadedDir);
            existing.add(loadedDir);
          }
        }
      }
    } catch (err) {
      console.warn(
        `[milaidy] Failed to load ~/.eliza/skills.json: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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
