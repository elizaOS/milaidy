import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { IAgentRuntime } from "@elizaos/core";

export function createLimitlessWallet(privateKey: string, logger?: IAgentRuntime["logger"]) {
  let key = privateKey;

  if (!key) {
    throw new Error("LIMITLESS_PRIVATE_KEY is required");
  }

  if (!key.startsWith("0x")) {
    key = `0x${key}`;
  }

  if (key.length !== 66) {
    throw new Error("Invalid LIMITLESS_PRIVATE_KEY format. Must be 0x-prefixed 32-byte hex string.");
  }

  const account = privateKeyToAccount(key as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: base,
    transport: http(),
  }).extend(publicActions);

  logger?.info(`[limitless] Wallet initialized: ${account.address}`);

  return { client, account };
}
