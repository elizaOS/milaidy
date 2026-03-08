/**
 * DexScreener config persistence helpers.
 *
 * Uses runtime.setSetting/getSetting with JSON serialization since
 * setSetting only accepts string | boolean | null.
 *
 * @module plugins/dexscreener/config-store
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { DexScreenerPluginConfig } from "./types";

const CONFIG_KEY = "DEXSCREENER_CONFIG";

export function loadConfig(runtime: IAgentRuntime): DexScreenerPluginConfig {
  const raw = runtime.getSetting(CONFIG_KEY);
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as DexScreenerPluginConfig;
  } catch {
    return {};
  }
}

export function saveConfig(
  runtime: IAgentRuntime,
  config: DexScreenerPluginConfig,
): void {
  try {
    runtime.setSetting(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Non-critical — config may not persist across restarts
  }
}
