/**
 * REDEEM_OPINION — claims winnings from a resolved Opinion.trade market.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const redeemOpinionAction: Action = {
  name: "REDEEM_OPINION",
  similes: [
    "CLAIM_PREDICTION",
    "SETTLE_OPINION",
    "CLAIM_WINNINGS",
    "OPINION_REDEEM",
  ],
  description:
    "Claim winnings from a resolved prediction market on Opinion.trade. Requires the marketId of a resolved market. This is an on-chain operation that needs BNB gas.",
  validate: async () => opinionClient.isReady && opinionClient.canTrade,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const marketId =
        typeof params?.marketId === "number"
          ? params.marketId
          : typeof params?.marketId === "string"
            ? Number(params.marketId)
            : undefined;
      if (
        marketId === undefined ||
        marketId === null ||
        Number.isNaN(marketId)
      ) {
        return { text: "I need a market ID to redeem.", success: false };
      }
      const [txHash] = await opinionClient.redeem(marketId);
      return {
        text: `Redeemed market #${marketId}!\nTX: ${txHash}`,
        success: true,
        data: { marketId, txHash },
      };
    } catch (err) {
      return {
        text: `Redeem failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "marketId",
      description: "The resolved market ID to redeem winnings from",
      required: true,
      schema: { type: "number" as const },
    },
  ],
};
