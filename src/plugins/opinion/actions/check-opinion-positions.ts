/**
 * CHECK_OPINION_POSITIONS — shows user's Opinion.trade positions with P&L.
 */
import type { Action } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { OpinionPosition } from "../types.js";

export const checkOpinionPositionsAction: Action = {
  name: "CHECK_OPINION_POSITIONS",
  similes: [
    "OPINION_POSITIONS",
    "PREDICTION_PORTFOLIO",
    "MY_PREDICTIONS",
    "OPINION_HOLDINGS",
  ],
  description:
    "Check current positions on Opinion.trade prediction markets. Shows each position's market, side, shares, average price, current price, and P&L.",
  validate: async () => opinionClient.isReady,
  handler: async () => {
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;
      if (!positions?.length) {
        return { text: "No open positions on Opinion.trade.", success: true };
      }
      const lines = positions.map((p: OpinionPosition) => {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        return `${p.marketTitle ?? `Market #${p.marketId}`}\n  ${(p.side ?? "").toUpperCase()} ${p.shares} shares @ avg ${p.avgEntryPrice} \u2192 now ${p.currentPrice} (${sign}$${pnl})`;
      });
      return {
        text: `Opinion Positions:\n\n${lines.join("\n\n")}`,
        success: true,
      };
    } catch (err) {
      return {
        text: `Failed to check positions: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [],
};
