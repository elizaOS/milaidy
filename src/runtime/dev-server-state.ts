import path from "node:path";
import { resolveUserPath } from "../config/paths";

export interface DevServerStatePathResolution {
  stateDir: string;
  configPath: string;
  changed: boolean;
  notes: string[];
}

/**
 * Resolve a single canonical state/config pair for headless dev-server mode.
 *
 * Priority:
 * 1) If neither env var is set: use {cwd}/.milady-state/milady.json.
 * 2) If only state dir is set: derive config path from it.
 * 3) If only config path is set: derive state dir from it.
 * 4) If both are set but mismatch: force config to {stateDir}/milady.json.
 */
export function resolveDevServerStatePaths(
  cwd: string,
  env: NodeJS.ProcessEnv,
): DevServerStatePathResolution {
  const rawState = env.MILADY_STATE_DIR?.trim() ?? "";
  const rawConfig = env.MILADY_CONFIG_PATH?.trim() ?? "";

  let stateDir = "";
  let configPath = "";
  const notes: string[] = [];

  if (!rawState && !rawConfig) {
    stateDir = path.resolve(cwd, ".milady-state");
    configPath = path.join(stateDir, "milady.json");
    notes.push("defaulted state/config to workspace-local .milady-state");
  } else if (rawState && !rawConfig) {
    stateDir = resolveUserPath(rawState);
    configPath = path.join(stateDir, "milady.json");
    notes.push("derived MILADY_CONFIG_PATH from MILADY_STATE_DIR");
  } else if (!rawState && rawConfig) {
    configPath = resolveUserPath(rawConfig);
    stateDir = path.dirname(configPath);
    notes.push("derived MILADY_STATE_DIR from MILADY_CONFIG_PATH");
  } else {
    stateDir = resolveUserPath(rawState);
    configPath = resolveUserPath(rawConfig);
    const expectedConfig = path.join(stateDir, "milady.json");
    if (path.resolve(configPath) !== path.resolve(expectedConfig)) {
      notes.push(
        `config/state mismatch detected; forcing MILADY_CONFIG_PATH to ${expectedConfig}`,
      );
      configPath = expectedConfig;
    }
  }

  const changed =
    (env.MILADY_STATE_DIR?.trim() ?? "") !== stateDir ||
    (env.MILADY_CONFIG_PATH?.trim() ?? "") !== configPath;

  return {
    stateDir,
    configPath,
    changed,
    notes,
  };
}

export function applyDevServerStatePaths(
  resolved: DevServerStatePathResolution,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.MILADY_STATE_DIR = resolved.stateDir;
  env.MILADY_CONFIG_PATH = resolved.configPath;
}
