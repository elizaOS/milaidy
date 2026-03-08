import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { PortfolioClient } from "../core/portfolio.js";
import { getPluginConfig } from "../config.js";

export const getPortfolioAction: Action = {
  name: "LIMITLESS_GET_PORTFOLIO",
  similes: [
    "show portfolio",
    "my positions",
    "limitless positions",
    "prediction market positions",
    "my trades",
    "trading history",
    "show my bets",
    "portfolio pnl",
  ],
  description:
    "Show your current prediction market positions and P&L on Limitless Exchange. Displays active positions, unrealized gains/losses, and recent trades.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const config = getPluginConfig(runtime);
      const portfolio = new PortfolioClient(config.apiBaseUrl, config.apiKey);

      const [positionsRaw, trades] = await Promise.all([
        portfolio.getPositions(),
        portfolio.getTrades().catch(() => []),
      ]);

      const positions: any[] = Array.isArray(positionsRaw)
        ? positionsRaw
        : [
            ...((positionsRaw as any).clob ?? []),
            ...((positionsRaw as any).amm ?? []),
            ...((positionsRaw as any).group ?? []),
          ];

      const sections: string[] = [];

      if (positions.length > 0) {
        const posLines = positions.slice(0, 20).map((p: any) => {
          const title = p.market?.title || p.marketSlug || "Unknown";
          const slug = p.market?.slug || p.marketSlug || "";
          const yes = p.positions?.yes;
          const no = p.positions?.no;
          const parts = [];
          if (yes) {
            parts.push(
              `YES: $${yes.marketValue || "?"} (PnL: ${yes.unrealizedPnl || "?"})`,
            );
          }
          if (no) {
            parts.push(
              `NO: $${no.marketValue || "?"} (PnL: ${no.unrealizedPnl || "?"})`,
            );
          }
          return `- **${title}** (\`${slug}\`)\n  ${parts.join(" | ") || "No position data"}`;
        });
        sections.push(`## Active Positions (${positions.length})\n\n${posLines.join("\n\n")}`);
      } else {
        sections.push("## Active Positions\n\nNo active positions.");
      }

      if (trades.length > 0) {
        const tradeLines = trades.slice(0, 10).map((t: any) => {
          return `- ${t.strategy || "Trade"} ${t.outcome || ""}: $${t.tradeAmountUSD || t.tradeAmount || "?"} (${new Date(t.timestamp).toLocaleString()})`;
        });
        sections.push(`## Recent Trades\n\n${tradeLines.join("\n")}`);
      }

      const text = `# Limitless Exchange Portfolio\n\n${sections.join("\n\n")}`;

      if (callback) {
        await callback({ text, actions: [] } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to fetch portfolio: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show my Limitless prediction market positions" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "# Limitless Exchange Portfolio\n\n## Active Positions (2)\n\n- **Will BTC be above $100,000?** (`btc-above-100k`)\n  YES: $15.00 (PnL: +$3.50)",
          actions: ["LIMITLESS_GET_PORTFOLIO"],
        },
      } as ActionExample,
    ],
  ],
};
