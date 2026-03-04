/**
 * CANCEL_OPINION_ORDER — cancels an open order on Opinion.trade.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { OpinionOrder } from "../types.js";

export const cancelOpinionOrderAction: Action = {
  name: "CANCEL_OPINION_ORDER",
  similes: [
    "CANCEL_PREDICTION",
    "CANCEL_BET",
    "REMOVE_ORDER",
    "OPINION_CANCEL",
  ],
  description:
    "Cancel an open order on Opinion.trade. Provide orderId to cancel a specific order, or omit to list open orders.",
  validate: async () => opinionClient.isReady && opinionClient.canTrade,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const orderId =
        typeof params?.orderId === "string" ? params.orderId.trim() : undefined;
      if (orderId && !/^[a-zA-Z0-9_-]+$/.test(orderId)) {
        return { text: "Invalid order ID format.", success: false };
      }
      if (!orderId) {
        const orders = await opinionClient.getOrders("open");
        const list = orders?.result?.list;
        if (!list?.length) {
          return { text: "No open orders to cancel.", success: true };
        }
        const lines = list.map(
          (o: OpinionOrder) =>
            `  ${o.orderId}: ${o.side} ${o.shares}@${o.price}`,
        );
        return {
          text: `Open orders:\n${lines.join("\n")}\n\nProvide an orderId to cancel.`,
          success: true,
        };
      }
      await opinionClient.cancelOrder(orderId);
      return { text: `Order ${orderId} cancelled.`, success: true };
    } catch (err) {
      return {
        text: `Cancel failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "orderId",
      description: "Order ID to cancel (omit to list open orders)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
