import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { LimitlessClient } from "../core/markets.js";
import { getPluginConfig } from "../config.js";

export const getMarketDetailAction: Action = {
  name: "LIMITLESS_GET_MARKET",
  similes: [
    "market details",
    "market info",
    "orderbook",
    "market depth",
    "show market",
    "get market",
    "market price",
  ],
  description:
    "Get detailed information about a specific Limitless prediction market including current prices, orderbook depth, volume, and expiration details.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const config = getPluginConfig(runtime);
      const client = new LimitlessClient(config.apiBaseUrl, config.apiKey);

      const params = options?.parameters as { slug: string } | undefined;
      if (!params?.slug) {
        if (callback) {
          await callback({
            text: "Please provide a market slug. Use LIMITLESS_SEARCH_MARKETS to find market slugs.",
            actions: [],
          } as Content);
        }
        return { success: false, error: "Missing slug parameter" };
      }

      const [market, orderbook] = await Promise.all([
        client.getMarket(params.slug),
        client.getOrderbook(params.slug).catch(() => null),
      ]);

      const yesPrice = market.prices?.[0]?.toFixed(1) ?? "?";
      const noPrice = market.prices?.[1]?.toFixed(1) ?? "?";
      const expiry = market.expirationTimestamp
        ? new Date(market.expirationTimestamp).toLocaleString()
        : "N/A";

      const sections = [
        `# ${market.title}`,
        `**Slug:** \`${market.slug}\``,
        `**Status:** ${market.status} | **Type:** ${market.tradeType}`,
        `**YES:** ${yesPrice}c | **NO:** ${noPrice}c`,
        `**Volume:** ${market.volumeFormatted || market.volume}`,
        `**Liquidity:** ${market.liquidityFormatted || market.liquidity}`,
        `**Expires:** ${expiry}`,
      ];

      if (market.description) {
        sections.push(`\n**Description:** ${market.description}`);
      }

      if (orderbook) {
        const topBids = orderbook.bids?.slice(0, 5) || [];
        const topAsks = orderbook.asks?.slice(0, 5) || [];

        if (topBids.length > 0 || topAsks.length > 0) {
          const obLines = ["\n## Orderbook"];
          if (topBids.length > 0) {
            obLines.push(
              "**Bids:** " + topBids.map((b) => `${b.price}c x${b.size}`).join(", "),
            );
          }
          if (topAsks.length > 0) {
            obLines.push(
              "**Asks:** " + topAsks.map((a) => `${a.price}c x${a.size}`).join(", "),
            );
          }
          if (orderbook.midpoint) {
            obLines.push(`**Midpoint:** ${orderbook.midpoint.toFixed(1)}c`);
          }
          sections.push(obLines.join("\n"));
        }
      }

      if (callback) {
        await callback({ text: sections.join("\n"), actions: [] } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `Failed to get market details: ${msg}`, actions: [] } as Content);
      }
      return { success: false, error: msg };
    }
  },

  parameters: [
    {
      name: "slug",
      description: "The market slug to get details for (e.g. 'btc-above-100k')",
      required: true,
      schema: { type: "string" },
    },
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me details for btc-above-100k market" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "# Will BTC be above $100,000 at 15:00?\n**Slug:** `btc-above-100k`\n**YES:** 55.0c | **NO:** 45.0c",
          actions: ["LIMITLESS_GET_MARKET"],
        },
      } as ActionExample,
    ],
  ],
};
