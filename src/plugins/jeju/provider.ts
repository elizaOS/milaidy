/**
 * Jeju plugin provider — injects context so the LLM knows about wallet and swap actions.
 */

import type {
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

export const jejuContextProvider: Provider = {
  name: "jeju",
  description: "Jeju/Bazaar wallet and swap actions",

  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    return {
      text: [
        "## Jeju / Bazaar",
        "",
        "You have access to the Jeju network (Bazaar):",
        "- **JEJU_STATUS**: Report the agent's wallet address and balances (ETH, WETH, USDC). Use when the user asks for wallet, balance, or Jeju status.",
        "- **JEJU_SWAP**: Swap ETH↔USDC. Parameters: direction (eth_to_usdc or usdc_to_eth), amount (e.g. 0.1 or 100). Use when the user asks to swap ETH for USDC or USDC for ETH.",
        "",
        "Always use JEJU_STATUS first if the user asks about balance or wallet, then JEJU_SWAP if they want to swap.",
      ].join("\n"),
    };
  },
};
