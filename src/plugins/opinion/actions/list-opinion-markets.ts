/**
 * LIST_OPINION_MARKETS — lists active prediction markets on Opinion.trade.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { ChildMarket, OpinionMarket } from "../types.js";

export const listOpinionMarketsAction: Action = {
  name: "LIST_OPINION_MARKETS",

  similes: [
    "OPINION_MARKETS",
    "PREDICTION_MARKETS",
    "SHOW_MARKETS",
    "BROWSE_PREDICTIONS",
  ],

  description:
    "List active prediction markets on Opinion.trade. Use when user asks " +
    "about available prediction markets, macro bets, or economic events to trade.",

  validate: async () => opinionClient.isReady,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const page = typeof params?.page === "number" ? params.page : 1;

      const response = await opinionClient.getMarkets(page);
      const markets = response?.result?.list;

      if (!markets?.length) {
        return { text: "No active prediction markets found.", success: true };
      }

      const lines = markets.map((m: OpinionMarket) => {
        const yes = m.childMarkets?.find(
          (c: ChildMarket) => c.outcomeName?.toLowerCase() === "yes",
        );
        const no = m.childMarkets?.find(
          (c: ChildMarket) => c.outcomeName?.toLowerCase() === "no",
        );
        const yesPrice = yes?.lastPrice ?? "\u2014";
        const noPrice = no?.lastPrice ?? "\u2014";
        const end = m.endTime
          ? new Date(m.endTime).toLocaleDateString()
          : "TBD";
        return `#${m.id} ${m.title}\n  YES: ${yesPrice} | NO: ${noPrice} | Ends: ${end}`;
      });

      const total = response?.result?.total ?? markets.length;
      const header = `Prediction Markets (page ${page}, ${total} total):\n`;
      return { text: header + lines.join("\n\n"), success: true };
    } catch (err) {
      return {
        text: `Failed to list markets: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "page",
      description: "Page number (default 1)",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
