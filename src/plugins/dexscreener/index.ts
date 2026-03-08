/**
 * DexScreener Plugin for Milady — token scanning with alert-to-hook integration.
 *
 * Our own DexScreener integration built from scratch. Scans the free public
 * DexScreener API for hot tokens, scores them 0-100, and fires alerts as
 * Milady hook events when conditions are met.
 *
 * Key feature: alerts become automatic hooks. When a token signal fires,
 * it triggers `gateway:dexscreener:alert` hook events that other hooks
 * and plugins can react to (execute trades, send notifications, log data,
 * update dashboards, etc.).
 *
 * Plugin provides:
 *   - DEX_SCAN action: scan for hot tokens across chains
 *   - DEX_SEARCH action: search for specific tokens
 *   - DEX_INSPECT action: get detailed token/pair info
 *   - DEX_CONFIGURE_ALERT action: create alert rules with auto-hook
 *   - Background scanner service with alert processing
 *   - Provider that injects DexScreener context into agent conversations
 *
 * No API keys required — uses the free DexScreener public API.
 *
 * @module plugins/dexscreener
 */

import { logger } from "@elizaos/core";
import type { Plugin } from "@elizaos/core";
import {
  dexConfigureAlertAction,
  dexInspectAction,
  dexScanAction,
  dexSearchAction,
} from "./actions";
import { saveConfig } from "./config-store";
import { registerDexScreenerHookHandler } from "./hook-handler";
import { dexScreenerProvider } from "./provider";
import { DexScreenerService } from "./service";
import type { DexScreenerPluginConfig } from "./types";

export type { DexScreenerPluginConfig } from "./types";
export type { AlertRule, DexAlertEvent, TokenCandidate } from "./types";
export { DexScreenerClient } from "./client";
export { DexScanner } from "./scanner";
export { fireAlertHook, processAlerts } from "./hook-bridge";

export function createDexScreenerPlugin(
  config?: DexScreenerPluginConfig,
): Plugin {
  const service = new DexScreenerService();

  return {
    name: "dexscreener",
    description:
      "DexScreener token scanning with automatic alert-to-hook integration. " +
      "Scans hot tokens across Solana, Base, Ethereum, BSC, and Arbitrum. " +
      "Alerts fire as Milady hooks for automated reactions.",

    init: async (_pluginConfig, runtime) => {
      // Apply config to runtime settings so actions/service can read it
      if (config) {
        saveConfig(runtime, config);
      }

      // Register the hook handler for dexscreener:alert events
      registerDexScreenerHookHandler();

      // Start background scanner service
      await service.start(runtime);

      logger.info(
        {
          src: "dexscreener-plugin",
          autoHookEnabled: config?.autoHookEnabled !== false,
          scanInterval: config?.scanIntervalSeconds ?? 300,
          ruleCount: config?.alertRules?.length ?? 0,
        },
        "DexScreener plugin initialized",
      );
    },

    providers: [dexScreenerProvider],

    actions: [
      dexScanAction,
      dexSearchAction,
      dexInspectAction,
      dexConfigureAlertAction,
    ],
  };
}
