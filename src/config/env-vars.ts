export * from "@elizaos/autonomous/config/env-vars";

import { collectConfigEnvVars as upstreamCollectConfigEnvVars } from "@elizaos/autonomous/config/env-vars";

const COMPAT_BLOCKED_STARTUP_ENV_KEYS = new Set([
  "ELIZA_API_TOKEN",
  "ELIZA_WALLET_EXPORT_TOKEN",
  "ELIZA_TERMINAL_RUN_TOKEN",
]);

export function collectConfigEnvVars(
  ...args: Parameters<typeof upstreamCollectConfigEnvVars>
): ReturnType<typeof upstreamCollectConfigEnvVars> {
  const entries = upstreamCollectConfigEnvVars(...args);

  for (const key of Object.keys(entries)) {
    if (COMPAT_BLOCKED_STARTUP_ENV_KEYS.has(key.toUpperCase())) {
      delete entries[key];
    }
  }

  return entries;
}
