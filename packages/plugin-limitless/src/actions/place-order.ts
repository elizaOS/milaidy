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
import { OrderSigner } from "../core/sign.js";
import { TradingClient } from "../core/trading.js";
import { getOrCreateWallet } from "../core/wallet.js";
import { getPluginConfig } from "../config.js";

export const placeOrderAction: Action = {
  name: "LIMITLESS_PLACE_ORDER",
  similes: [
    "buy prediction market",
    "trade on limitless",
    "bet on market",
    "place a bet",
    "buy yes",
    "buy no",
    "trade prediction",
    "place order limitless",
  ],
  description:
    "Place a prediction market order on Limitless Exchange. Buys YES or NO shares on a specific market. Requires market slug, side (YES/NO), price limit, and USD amount. Respects safety limits and dry-run mode.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey && !!config.privateKey;
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
      const params = options?.parameters as {
        marketSlug: string;
        side: "YES" | "NO";
        priceCents: number;
        amountUsd: number;
        orderType?: "GTC" | "FOK";
      };

      if (!params?.marketSlug || !params?.side || !params?.priceCents || !params?.amountUsd) {
        if (callback) {
          await callback({
            text: "Missing required parameters. I need: marketSlug, side (YES/NO), priceCents (1-99), and amountUsd.",
            actions: [],
          } as Content);
        }
        return { success: false, error: "Missing parameters" };
      }

      // Safety checks
      if (params.amountUsd > config.maxSingleTradeUsd) {
        if (callback) {
          await callback({
            text: `Trade amount $${params.amountUsd} exceeds single trade limit of $${config.maxSingleTradeUsd}. Adjust LIMITLESS_MAX_SINGLE_TRADE_USD to increase.`,
            actions: [],
          } as Content);
        }
        return { success: false, error: "Exceeds single trade limit" };
      }

      if (params.priceCents < 1 || params.priceCents > 99) {
        if (callback) {
          await callback({
            text: "Price must be between 1 and 99 cents.",
            actions: [],
          } as Content);
        }
        return { success: false, error: "Invalid price" };
      }

      const { client: walletClient, account } = getOrCreateWallet(runtime);
      const limitless = new LimitlessClient(config.apiBaseUrl, config.apiKey);
      const signer = new OrderSigner(walletClient as any, account, 8453);
      const trading = new TradingClient(
        limitless,
        signer,
        config.apiBaseUrl,
        config.dryRun,
        runtime.logger,
        config.apiKey,
      );

      const result = await trading.createOrder({
        marketSlug: params.marketSlug,
        side: params.side,
        limitPriceCents: params.priceCents,
        usdAmount: params.amountUsd,
        orderType: params.orderType || "FOK",
      });

      const statusText = config.dryRun ? "DRY RUN (simulated)" : "SUBMITTED";
      const text = `Order ${statusText}: ${params.side} on **${params.marketSlug}** at ${params.priceCents}c for $${params.amountUsd} (${params.orderType || "FOK"})`;

      if (callback) {
        await callback({ text, actions: [] } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `Failed to place order: ${msg}`, actions: [] } as Content);
      }
      return { success: false, error: msg };
    }
  },

  parameters: [
    {
      name: "marketSlug",
      description: "The market slug to trade on (e.g. 'btc-above-100k')",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "side",
      description: "Which side to buy: 'YES' or 'NO'",
      required: true,
      schema: { type: "string", enum: ["YES", "NO"] },
    },
    {
      name: "priceCents",
      description: "Limit price in cents (1-99). E.g. 55 means 55 cents per share.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "amountUsd",
      description: "Amount in USD to spend on this order.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "orderType",
      description: "Order type: 'FOK' (fill-or-kill, default) or 'GTC' (good-till-cancelled)",
      required: false,
      schema: { type: "string", enum: ["FOK", "GTC"] },
    },
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Buy YES on btc-above-100k at 55 cents for $5" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Order SUBMITTED: YES on **btc-above-100k** at 55c for $5 (FOK)",
          actions: ["LIMITLESS_PLACE_ORDER"],
        },
      } as ActionExample,
    ],
  ],
};
