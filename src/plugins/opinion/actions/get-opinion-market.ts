/**
 * GET_OPINION_MARKET — get detail and orderbook for a specific market.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { ChildMarket, OrderBookEntry } from "../types.js";

export const getOpinionMarketAction: Action = {
  name: "GET_OPINION_MARKET",
  similes: [
    "OPINION_MARKET_DETAIL",
    "CHECK_PREDICTION",
    "MARKET_PRICE",
    "PREDICTION_PRICE",
  ],
  description:
    "Get details and orderbook depth for a specific Opinion.trade prediction market. Use when user asks about a specific market's price, odds, or trading depth.",
  validate: async () => opinionClient.isReady,
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
        return { text: "I need a market ID to look up.", success: false };
      }
      const marketRes = await opinionClient.getMarket(marketId);
      const market = marketRes?.result;
      if (!market) {
        return { text: `Market #${marketId} not found.`, success: false };
      }
      const yesChild = market.childMarkets?.find(
        (c: ChildMarket) => c.outcomeName?.toLowerCase() === "yes",
      );
      const noChild = market.childMarkets?.find(
        (c: ChildMarket) => c.outcomeName?.toLowerCase() === "no",
      );
      let orderbookText = "";
      if (yesChild?.tokenId) {
        try {
          const ob = await opinionClient.getOrderbook(yesChild.tokenId);
          const bids = ob?.result?.bids?.slice(0, 3) ?? [];
          const asks = ob?.result?.asks?.slice(0, 3) ?? [];
          const bestBid = bids[0]?.price ?? "\u2014";
          const bestAsk = asks[0]?.price ?? "\u2014";
          const bidDepth = bids.reduce(
            (sum: number, b: OrderBookEntry) => sum + Number(b.size || 0),
            0,
          );
          const askDepth = asks.reduce(
            (sum: number, a: OrderBookEntry) => sum + Number(a.size || 0),
            0,
          );
          orderbookText = `\nOrderbook (YES): Best Bid ${bestBid} (${bidDepth} shares) | Best Ask ${bestAsk} (${askDepth} shares)`;
        } catch {
          orderbookText = "\nOrderbook: unavailable";
        }
      }
      const end = market.endTime
        ? new Date(market.endTime).toLocaleDateString()
        : "TBD";
      const text = `Market #${market.id}: ${market.title}\nYES: ${yesChild?.lastPrice ?? "\u2014"} (token: ${yesChild?.tokenId ?? "\u2014"})\nNO: ${noChild?.lastPrice ?? "\u2014"} (token: ${noChild?.tokenId ?? "\u2014"})\nEnds: ${end}${orderbookText}`;
      return {
        text,
        success: true,
        data: {
          market,
          yesTokenId: yesChild?.tokenId,
          noTokenId: noChild?.tokenId,
        },
      };
    } catch (err) {
      return {
        text: `Failed to get market: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "marketId",
      description: "The Opinion market ID to look up",
      required: true,
      schema: { type: "number" as const },
    },
  ],
};
