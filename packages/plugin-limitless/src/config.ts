import type { IAgentRuntime } from "@elizaos/core";
import type { LimitlessConfig } from "./core/types.js";

export function getPluginConfig(runtime: IAgentRuntime): LimitlessConfig {
  const getSetting = (key: string): string =>
    (runtime.getSetting?.(key) as string) || process.env[key] || "";

  return {
    privateKey:
      getSetting("LIMITLESS_PRIVATE_KEY") ||
      getSetting("PRIVATE_KEY") ||
      getSetting("EVM_PRIVATE_KEY"),
    apiKey: getSetting("LIMITLESS_API_KEY"),
    dryRun: (getSetting("LIMITLESS_DRY_RUN") || getSetting("DRY_RUN") || "true") === "true",
    maxSingleTradeUsd: parseFloat(getSetting("LIMITLESS_MAX_SINGLE_TRADE_USD") || getSetting("MAX_SINGLE_TRADE_USD") || "10"),
    maxTotalExposureUsd: parseFloat(getSetting("LIMITLESS_MAX_TOTAL_EXPOSURE_USD") || getSetting("MAX_TOTAL_EXPOSURE_USD") || "50"),
    apiBaseUrl: getSetting("LIMITLESS_API_URL") || "https://api.limitless.exchange",
  };
}
