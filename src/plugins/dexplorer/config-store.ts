/**
 * Dexplorer config persistence helpers.
 *
 * Uses runtime.setSetting/getSetting with JSON serialization since
 * setSetting only accepts string | boolean | null.
 *
 * @module plugins/dexplorer/config-store
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { DexplorerPluginConfig } from "./types";

const CONFIG_KEY = "DEXPLORER_CONFIG";

export function loadConfig(runtime: IAgentRuntime): DexplorerPluginConfig {
  const raw = runtime.getSetting(CONFIG_KEY);
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as DexplorerPluginConfig;
  } catch {
    return {};
  }
}

export function saveConfig(
  runtime: IAgentRuntime,
  config: DexplorerPluginConfig,
): void {
  try {
    runtime.setSetting(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Non-critical — config may not persist across restarts
  }
}
