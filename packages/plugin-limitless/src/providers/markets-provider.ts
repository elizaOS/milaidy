import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { LimitlessClient } from "../core/markets.js";
import { getPluginConfig } from "../config.js";

let cachedMarketSummary: { text: string; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const limitlessMarketsProvider: Provider = {
  name: "limitlessMarkets",
  description:
    "Provides current prediction market context from Limitless Exchange — active markets, prices, and trading opportunities on Base chain.",
  position: 20,

  async get(
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    try {
      const config = getPluginConfig(runtime);
      if (!config.apiKey) {
        return { text: "", data: {} };
      }

      // Use cache if fresh
      if (cachedMarketSummary && Date.now() - cachedMarketSummary.fetchedAt < CACHE_TTL) {
        return {
          text: cachedMarketSummary.text,
          data: { source: "limitless", cached: true },
        };
      }

      const client = new LimitlessClient(config.apiBaseUrl, config.apiKey);
      const markets = await client.getActiveMarkets({ tradeType: "clob", limit: 10 });

      if (markets.length === 0) {
        return { text: "", data: {} };
      }

      const lines = markets.map((m) => {
        const yesPrice = m.prices?.[0]?.toFixed(1) ?? "?";
        const noPrice = m.prices?.[1]?.toFixed(1) ?? "?";
        return `- ${m.title} [${m.slug}] YES:${yesPrice}c NO:${noPrice}c`;
      });

      const modeLabel = config.dryRun ? "DRY RUN" : "LIVE";
      const text = [
        "## Limitless Exchange — Active Prediction Markets",
        `Mode: ${modeLabel} | Max trade: $${config.maxSingleTradeUsd} | Max exposure: $${config.maxTotalExposureUsd}`,
        "",
        ...lines,
        "",
        "Use LIMITLESS_SEARCH_MARKETS to search, LIMITLESS_PLACE_ORDER to trade, LIMITLESS_RUN_STRATEGY for autonomous trading.",
      ].join("\n");

      cachedMarketSummary = { text, fetchedAt: Date.now() };

      return {
        text,
        data: { source: "limitless", marketCount: markets.length },
      };
    } catch {
      return { text: "", data: {} };
    }
  },
};
