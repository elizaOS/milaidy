/**
 * Wallet contributor — reports wallet configuration status (never keys).
 */
import type { AwarenessContributor } from "../../contracts/awareness";
import type { IAgentRuntime } from "@elizaos/core";

export const walletContributor: AwarenessContributor = {
  id: "wallet",
  position: 30,
  cacheTtl: 60_000,
  invalidateOn: ["wallet-updated"],
  trusted: true,

  async summary(runtime: IAgentRuntime): Promise<string> {
    const evmKey = runtime.getSetting?.("EVM_PRIVATE_KEY");
    const solKey = runtime.getSetting?.("SOLANA_PRIVATE_KEY")
      ?? runtime.getSetting?.("SOL_PRIVATE_KEY");

    const evmConfigured = !!evmKey;
    const solConfigured = !!solKey;

    if (!evmConfigured && !solConfigured) {
      return "Wallet: not configured";
    }

    const evmLabel = evmConfigured ? "EVM configured" : "EVM: none";
    const solLabel = solConfigured ? "SOL configured" : "SOL: none";

    return `Wallet: ${evmLabel} | ${solLabel}`;
  },
};
