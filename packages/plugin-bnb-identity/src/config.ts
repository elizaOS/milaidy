import type { IAgentRuntime } from "@elizaos/core";
import type { BnbIdentityConfig } from "./types.js";

export type ResolvedBnbIdentityConfig = BnbIdentityConfig & {
  networkWarning?: string;
};

/** Supported and normalized networks for ERC-8004/BSC flows. */
const SUPPORTED_NETWORKS = new Set(["bsc", "bsc-testnet"]);

/**
 * Normalizes requested BNB network values and rejects unsupported values.
 * Also accepts common aliases (mainnet/testnet) to reduce operator mistakes.
 */
export function normalizeBnbNetwork(value: string): {
  network: string;
  warning?: string;
} {
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_NETWORKS.has(normalized)) {
    return { network: normalized };
  }

  if (
    normalized === "mainnet" ||
    normalized === "bnb" ||
    normalized === "bnb-mainnet"
  ) {
    return {
      network: "bsc",
      warning: `Normalized BNB_NETWORK "${value}" to "bsc" for compatibility.`,
    };
  }

  if (
    normalized === "testnet" ||
    normalized === "bsc-test" ||
    normalized === "bsctestnet" ||
    normalized === "bnb-testnet" ||
    normalized === "bnb_testnet"
  ) {
    return {
      network: "bsc-testnet",
      warning: `Normalized BNB_NETWORK "${value}" to "bsc-testnet" for compatibility.`,
    };
  }

  throw new Error(
    `Unsupported BNB_NETWORK "${value}". Supported values: bsc, bsc-testnet.`,
  );
}

export function loadBnbIdentityConfig(
  runtime: IAgentRuntime,
  options?: { includeNfaSettings?: boolean },
): ResolvedBnbIdentityConfig {
  const { network, warning } = normalizeBnbNetwork(
    String(runtime.getSetting("BNB_NETWORK") ?? "bsc-testnet"),
  );

  const config: ResolvedBnbIdentityConfig = {
    privateKey:
      String(runtime.getSetting("BNB_PRIVATE_KEY") ?? "") || undefined,
    network,
    agentUriBase:
      String(runtime.getSetting("BNB_AGENT_URI_BASE") ?? "") || undefined,
    gatewayPort: parseInt(
      String(runtime.getSetting("MILADY_GATEWAY_PORT") ?? "18789"),
      10,
    ),
    ...(warning ? { networkWarning: warning } : {}),
  };

  if (options?.includeNfaSettings) {
    config.nfaContractAddress =
      String(runtime.getSetting("BAP578_CONTRACT_ADDRESS") ?? "") || undefined;
    config.rpcUrl =
      String(
        runtime.getSetting("BSC_RPC_URL") ??
          runtime.getSetting("BNB_RPC_URL") ??
          "",
      ) || undefined;
  }

  return config;
}
