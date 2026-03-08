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

export const searchMarketsAction: Action = {
  name: "LIMITLESS_SEARCH_MARKETS",
  similes: [
    "search prediction markets",
    "find prediction markets",
    "browse markets",
    "look up markets",
    "what prediction markets",
    "show me markets",
    "limitless markets",
    "find markets about",
  ],
  description:
    "Search for prediction markets on Limitless Exchange. Can search by keyword (e.g. 'BTC', 'ETH', 'election') or list active markets. Returns market title, current YES/NO prices, volume, and expiration.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const config = getPluginConfig(runtime);
      const client = new LimitlessClient(config.apiBaseUrl, config.apiKey);

      const params = options?.parameters as { query?: string; limit?: number } | undefined;
      const query = params?.query || extractQueryFromMessage(message.content?.text || "");
      const limit = params?.limit || 10;

      let markets;
      if (query) {
        markets = await client.searchMarkets(query, { limit });
      } else {
        markets = await client.getActiveMarkets({ limit, tradeType: "clob" });
      }

      if (markets.length === 0) {
        if (callback) {
          await callback({
            text: query
              ? `No prediction markets found matching "${query}" on Limitless Exchange.`
              : "No active prediction markets found on Limitless Exchange right now.",
            actions: [],
          } as Content);
        }
        return { success: true };
      }

      const lines = markets.map((m: any) => {
        const yesPrice = m.prices?.[0]?.toFixed(1) ?? "?";
        const noPrice = m.prices?.[1]?.toFixed(1) ?? "?";
        const expiry = m.expirationTimestamp
          ? new Date(m.expirationTimestamp).toLocaleString()
          : "N/A";
        return `- **${m.title}** (slug: \`${m.slug}\`)\n  YES: ${yesPrice}c | NO: ${noPrice}c | Vol: ${m.volumeFormatted || m.volume} | Expires: ${expiry}`;
      });

      const text = query
        ? `Found ${markets.length} market(s) matching "${query}":\n\n${lines.join("\n\n")}`
        : `Top ${markets.length} active prediction markets:\n\n${lines.join("\n\n")}`;

      if (callback) {
        await callback({ text, actions: [] } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `Failed to search markets: ${msg}`, actions: [] } as Content);
      }
      return { success: false, error: msg };
    }
  },

  parameters: [
    {
      name: "query",
      description:
        "Search query for markets (e.g. 'BTC', 'ETH above', 'election'). Leave empty to list active markets.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "limit",
      description: "Maximum number of markets to return. Defaults to 10.",
      required: false,
      schema: { type: "number" },
    },
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me prediction markets about BTC" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: 'Found 5 market(s) matching "BTC":\n\n- **Will BTC be above $100,000 at 15:00?** (slug: `btc-above-100k`)\n  YES: 55.0c | NO: 45.0c',
          actions: ["LIMITLESS_SEARCH_MARKETS"],
        },
      } as ActionExample,
    ],
  ],
};

function extractQueryFromMessage(text: string): string {
  const patterns = [
    /(?:search|find|show|look up|browse)\s+(?:prediction\s+)?markets?\s+(?:about|for|on|related to)\s+(.+)/i,
    /(?:prediction\s+)?markets?\s+(?:about|for|on)\s+(.+)/i,
    /what.*(?:prediction\s+)?markets?\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return "";
}
