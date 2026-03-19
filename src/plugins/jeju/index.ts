/**
 * Milady Jeju/Bazaar plugin — wallet, balances, and ETH↔USDC swap on Jeju localnet.
 *
 * Enable via plugins.allow: ["jeju"] in milady.json. Wallet is stored at
 * ~/.milady/jeju-wallet.json. Actions log to the terminal; a dashboard UI
 * can be added later.
 */

import type { IAgentRuntime, Plugin } from "@elizaos/core";
import { jejuStatusAction, jejuSwapAction } from "./actions";
import { jejuContextProvider } from "./provider";
import { getJejuClient } from "./client";

export const jejuPlugin: Plugin = {
  name: "jeju",
  description:
    "Jeju/Bazaar: agent wallet, balances (ETH, WETH, USDC), and ETH↔USDC swap on Jeju localnet",

  providers: [jejuContextProvider],
  actions: [jejuStatusAction, jejuSwapAction],

  init: async (_config: Record<string, unknown>, runtime: IAgentRuntime) => {
    try {
      const client = getJejuClient();
      runtime.logger?.info?.(
        `[jeju] Plugin initialized. Wallet: ${client.address} (fund this address on Jeju localnet)`,
      );
    } catch (err) {
      runtime.logger?.warn?.(
        `[jeju] Plugin init warning: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};

export default jejuPlugin;
