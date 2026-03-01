/**
 * PLACE_OPINION_BET — places a prediction market bet on Opinion.trade.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";
import { loadMiladyConfig } from "../../../config/config.js";
import { resolveTradePermissionMode, canUseLocalTradeExecution } from "../../../api/server.js";

export const placeOpinionBetAction: Action = {
  name: "PLACE_OPINION_BET",
  similes: ["BET_OPINION", "PREDICT", "BUY_YES", "BUY_NO", "OPINION_BUY", "OPINION_SELL", "PLACE_PREDICTION"],
  description: "Place a prediction bet on Opinion.trade markets. Use when user wants to bet on economic outcomes (CPI, Fed rates, NFP). Requires marketId, tokenId, side (buy/sell), and amount in USDT. Respects trade permission mode.",
  validate: async () => opinionClient.isReady && opinionClient.canTrade,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const side = typeof params?.side === "string" ? params.side.trim().toLowerCase() : undefined;
      if (side !== "buy" && side !== "sell") {
        return { text: 'I need a valid side ("buy" or "sell").', success: false };
      }
      const marketId = typeof params?.marketId === "number" ? params.marketId : typeof params?.marketId === "string" ? Number(params.marketId) : undefined;
      if (!marketId || Number.isNaN(marketId)) {
        return { text: "I need a valid market ID.", success: false };
      }
      const tokenId = typeof params?.tokenId === "string" ? params.tokenId.trim() : undefined;
      if (!tokenId) {
        return { text: "I need a token ID (YES or NO outcome token).", success: false };
      }
      const amountRaw = typeof params?.amount === "string" ? params.amount.trim() : typeof params?.amount === "number" ? String(params.amount) : undefined;
      if (!amountRaw || Number.isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
        return { text: "I need a positive USDT amount.", success: false };
      }
      const config = loadMiladyConfig();
      const tradeMode = resolveTradePermissionMode(config);
      const canExecute = canUseLocalTradeExecution(tradeMode, true);
      if (!canExecute) {
        return {
          text: `Bet prepared: ${side.toUpperCase()} $${amountRaw} on market #${marketId}.\nCurrent trade mode is "${tradeMode}" — manual confirmation required.\nToken: ${tokenId}`,
          success: true,
          data: { marketId, tokenId, side, amount: amountRaw, requiresConfirmation: true },
        };
      }
      const price = typeof params?.price === "string" && params.price.trim() ? params.price.trim() : typeof params?.price === "number" ? String(params.price) : undefined;
      const result = await opinionClient.placeBet({ marketId, tokenId, side: side as "buy" | "sell", amount: amountRaw, price });
      const orderId = result?.result?.orderId ?? "unknown";
      const orderType = price ? `limit @ ${price}` : "market";
      return {
        text: `Bet placed! ${side.toUpperCase()} $${amountRaw} on market #${marketId} (${orderType}).\nOrder ID: ${orderId}`,
        success: true,
        data: { orderId, marketId, tokenId, side, amount: amountRaw },
      };
    } catch (err) {
      return { text: `Bet failed: ${err instanceof Error ? err.message : String(err)}`, success: false };
    }
  },
  parameters: [
    { name: "marketId", description: "Opinion market ID", required: true, schema: { type: "number" as const } },
    { name: "tokenId", description: "Token ID for YES or NO outcome", required: true, schema: { type: "string" as const } },
    { name: "side", description: '"buy" or "sell"', required: true, schema: { type: "string" as const } },
    { name: "amount", description: 'USDT amount to bet (e.g. "10")', required: true, schema: { type: "string" as const } },
    { name: "price", description: "Limit price 0.01-0.99 (omit for market order)", required: false, schema: { type: "string" as const } },
  ],
};
