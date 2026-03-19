export * from "@elizaos/autonomous/config/env-vars";

import { collectConfigEnvVars as upstreamCollectConfigEnvVars } from "@elizaos/autonomous/config/env-vars";
import type { ElizaConfig } from "./types";

const BLOCKED_AUTH_ENV_KEYS = new Set([
  "ELIZA_API_TOKEN",
  "ELIZA_WALLET_EXPORT_TOKEN",
  "ELIZA_TERMINAL_RUN_TOKEN",
]);

export function collectConfigEnvVars(
  cfg?: ElizaConfig,
): Record<string, string> {
  const entries = upstreamCollectConfigEnvVars(cfg);
  return Object.fromEntries(
    Object.entries(entries).filter(
      ([key]) => !BLOCKED_AUTH_ENV_KEYS.has(key.toUpperCase()),
    ),
  );
}
