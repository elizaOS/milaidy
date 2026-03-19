/**
 * Opinion Trade plugin — prediction market trading on Opinion.trade (BNB Chain).
 *
 * Enabled by setting OPINION_API_KEY. Supports read-only mode (no private key)
 * or full trading mode (with OPINION_PRIVATE_KEY + OPINION_MULTISIG_ADDRESS).
 *
 * @see https://github.com/elizaos/eliza/pull/802
 */
import type { Plugin, ServiceClass } from "@elizaos/core";
import { cancelOpinionOrderAction } from "./actions/cancel-opinion-order.js";
import { checkOpinionPositionsAction } from "./actions/check-opinion-positions.js";
import { getOpinionMarketAction } from "./actions/get-opinion-market.js";
import { listOpinionMarketsAction } from "./actions/list-opinion-markets.js";
import { placeOpinionBetAction } from "./actions/place-opinion-bet.js";
import { redeemOpinionAction } from "./actions/redeem-opinion.js";
import { opinionClient } from "./client.js";
import { opinionContextProvider } from "./providers/opinion-context.js";
import { OpinionWsService } from "./services/opinion-ws.js";

export const opinionPlugin: Plugin = {
  name: "opinion-trade",
  description: "Prediction market trading on Opinion.trade (BNB Chain)",

  init: async (_config, runtime) => {
    const apiKey = process.env.OPINION_API_KEY;
    if (!apiKey) {
      runtime.logger?.warn?.(
        "Opinion plugin: OPINION_API_KEY not set, skipping init",
      );
      return;
    }

    const privateKey = process.env.OPINION_PRIVATE_KEY;
    const multiSigAddress = process.env.OPINION_MULTISIG_ADDRESS;
    const maxBetUsd = Number(process.env.OPINION_MAX_BET_USD) || 500;
    const rpcUrl =
      process.env.BSC_RPC_URL ||
      process.env.NODEREAL_BSC_RPC_URL ||
      "https://bsc-dataseed.binance.org";

    try {
      await opinionClient.initialize({
        apiKey,
        privateKey,
        multiSigAddress,
        maxBetUsd,
        rpcUrl,
      });
      runtime.logger?.info?.(
        `Opinion plugin initialized (${opinionClient.canTrade ? "trading" : "read-only"} mode)`,
      );
    } catch (err) {
      runtime.logger?.error?.(
        `Opinion plugin init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  actions: [
    listOpinionMarketsAction,
    getOpinionMarketAction,
    placeOpinionBetAction,
    checkOpinionPositionsAction,
    cancelOpinionOrderAction,
    redeemOpinionAction,
  ],

  providers: [opinionContextProvider],

  services: [OpinionWsService as unknown as ServiceClass],
};

export default opinionPlugin;
