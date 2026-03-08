/**
 * Dexplorer Plugin for Milady — token scanning with alert-to-hook integration.
 *
 * Our own integration powered by the free public DexScreener API. Provides
 * on-demand scanning, search, and inspection actions. Alerts fire directly
 * as Milady hook events — no background scanning loop.
 *
 * Key feature: alerts are native hooks. When a token signal fires,
 * it triggers `gateway:dexplorer:alert` hook events that other hooks
 * and plugins can react to (execute trades, send notifications, log data,
 * update dashboards, etc.).
 *
 * Plugin provides:
 *   - DEX_SCAN action: scan for hot tokens across chains
 *   - DEX_SEARCH action: search for specific tokens
 *   - DEX_INSPECT action: get detailed token/pair info
 *   - DEX_CONFIGURE_ALERT action: create alert rules with hook integration
 *   - Provider that injects Dexplorer context into agent conversations
 *
 * No API keys required — uses the free DexScreener public API.
 *
 * @module plugins/dexplorer
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
import { registerDexplorerHookHandler } from "./hook-handler";
import { dexplorerProvider } from "./provider";
import type { DexplorerPluginConfig } from "./types";

export type { DexplorerPluginConfig } from "./types";
export type { AlertRule, DexAlertEvent, TokenCandidate } from "./types";
export { DexplorerClient } from "./client";
export { DexScanner } from "./scanner";
export { fireAlertHook, processAlerts } from "./hook-bridge";

export function createDexplorerPlugin(
  config?: DexplorerPluginConfig,
): Plugin {
  return {
    name: "dexplorer",
    description:
      "Dexplorer token scanning with automatic alert-to-hook integration. " +
      "Scans hot tokens across Solana, Base, Ethereum, BSC, and Arbitrum. " +
      "Alerts fire as Milady hooks for automated reactions.",

    init: async (_pluginConfig, runtime) => {
      // Apply config to runtime settings so actions can read it
      if (config) {
        saveConfig(runtime, config);
      }

      // Register the hook handler for dexplorer:alert events
      registerDexplorerHookHandler();

      logger.info(
        {
          src: "dexplorer-plugin",
          ruleCount: config?.alertRules?.length ?? 0,
        },
        "Dexplorer plugin initialized",
      );
    },

    providers: [dexplorerProvider],

    actions: [
      dexScanAction,
      dexSearchAction,
      dexInspectAction,
      dexConfigureAlertAction,
    ],
  };
}
