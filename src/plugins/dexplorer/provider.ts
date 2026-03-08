/**
 * Dexplorer Provider — injects Dexplorer capabilities into agent context.
 *
 * Tells the LLM what Dexplorer actions are available and any active alert rules.
 *
 * @module plugins/dexplorer/provider
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { loadConfig } from "./config-store";
import type { AlertRule, DexplorerPluginConfig } from "./types";

export const dexplorerProvider: Provider = {
  name: "dexplorer",
  description: "Dexplorer token scanning and alert capabilities",

  async get(
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const config = loadConfig(runtime);
    const rules = config.alertRules ?? [];
    const activeRules = rules.filter((r: AlertRule) => r.enabled);

    const lines = [
      "## Dexplorer Integration",
      "",
      "You have Dexplorer token scanning capabilities:",
      "- **DEX_SCAN**: Scan for hot tokens (scored 0-100) across chains (solana, base, ethereum, bsc, arbitrum)",
      "- **DEX_SEARCH**: Search for specific tokens by name/symbol",
      "- **DEX_INSPECT**: Get detailed pair info for a chain:address",
      "- **DEX_CONFIGURE_ALERT**: Create alert rules that fire as automatic Milady hooks",
      "",
      "When users ask about tokens, prices, hot pairs, or want to set up alerts, use these actions.",
    ];

    if (activeRules.length > 0) {
      lines.push("");
      lines.push(
        `**Active Alert Rules:** ${activeRules.length} rule(s) configured`,
      );
      for (const rule of activeRules) {
        lines.push(
          `- ${rule.name}: score >= ${rule.minScore}, ${rule.chains.length > 0 ? rule.chains.join("/") : "all chains"} [hook]`,
        );
      }
    }

    return { text: lines.join("\n") };
  },
};
