import type { Plugin } from "@elizaos/core";
import { searchMarketsAction } from "./actions/search-markets.js";
import { getMarketDetailAction } from "./actions/get-market-detail.js";
import { placeOrderAction } from "./actions/place-order.js";
import { getPortfolioAction } from "./actions/get-portfolio.js";
import { runStrategyAction } from "./actions/run-strategy.js";
import { approveMarketAction } from "./actions/approve-market.js";
import { limitlessMarketsProvider } from "./providers/markets-provider.js";

// Re-export core modules for external use
export { LimitlessClient } from "./core/markets.js";
export { TradingClient } from "./core/trading.js";
export { OrderSigner } from "./core/sign.js";
export { PortfolioClient } from "./core/portfolio.js";
export { createLimitlessWallet } from "./core/wallet.js";
export { getPluginConfig } from "./config.js";
export type {
  Market,
  MarketDetail,
  Orderbook,
  Order,
  SignedOrder,
  Trade,
  Position,
  LimitlessConfig,
} from "./core/types.js";

export const limitlessPlugin: Plugin = {
  name: "@milady/plugin-limitless",
  description:
    "Limitless Exchange prediction market trading — discover markets, place orders, manage portfolio, and run autonomous trading strategies on Base chain.",
  actions: [
    searchMarketsAction,
    getMarketDetailAction,
    placeOrderAction,
    getPortfolioAction,
    runStrategyAction,
    approveMarketAction,
  ],
  providers: [limitlessMarketsProvider],
  evaluators: [],

  async init(_config: Record<string, unknown>, runtime) {
    const apiKey =
      (runtime.getSetting?.("LIMITLESS_API_KEY") as string) ||
      process.env.LIMITLESS_API_KEY;

    if (apiKey) {
      runtime.logger.info("[limitless] Plugin initialized — Limitless Exchange integration active");
    } else {
      runtime.logger.warn(
        "[limitless] Plugin loaded but LIMITLESS_API_KEY not set — market actions will be unavailable",
      );
    }
  },
};

export default limitlessPlugin;
