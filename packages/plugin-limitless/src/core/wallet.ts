import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { IAgentRuntime } from "@elizaos/core";

/**
 * Resolve a Base-chain private key from the runtime, checking multiple
 * provider sources in priority order:
 *
 *   1. LIMITLESS_PRIVATE_KEY  – dedicated key for this plugin
 *   2. PRIVATE_KEY            – generic agent key
 *   3. EVM_PRIVATE_KEY        – Eliza Cloud / shared EVM wallet
 *
 * Returns the key or null if none found.
 */
export function resolvePrivateKey(runtime?: IAgentRuntime): string | null {
  const candidates = [
    "LIMITLESS_PRIVATE_KEY",
    "PRIVATE_KEY",
    "EVM_PRIVATE_KEY",
  ];

  for (const key of candidates) {
    const value =
      (runtime?.getSetting?.(key) as string | undefined) ||
      process.env[key] ||
      "";
    if (value) return value;
  }

  return null;
}

/**
 * Create a viem wallet client on Base using an already-resolved private key.
 * Throws if the key is missing or malformed.
 */
export function createLimitlessWallet(privateKey: string, logger?: IAgentRuntime["logger"]) {
  let key = privateKey;

  if (!key) {
    throw new Error(
      "No Base wallet found. Set LIMITLESS_PRIVATE_KEY, PRIVATE_KEY, or EVM_PRIVATE_KEY.",
    );
  }

  if (!key.startsWith("0x")) {
    key = `0x${key}`;
  }

  if (key.length !== 66) {
    throw new Error("Invalid private key format. Must be 0x-prefixed 32-byte hex string.");
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

/**
 * High-level helper: resolve the best available Base wallet from the runtime
 * and return a ready-to-use viem wallet client.
 *
 * Checks Eliza Cloud / EVM provider keys before falling back to a
 * Limitless-specific key, so the agent reuses an existing wallet when one
 * is already configured.
 */
export function getOrCreateWallet(runtime: IAgentRuntime) {
  const key = resolvePrivateKey(runtime);

  if (!key) {
    throw new Error(
      "No Base wallet available. Provide one of: LIMITLESS_PRIVATE_KEY, PRIVATE_KEY, or EVM_PRIVATE_KEY.",
    );
  }

  return createLimitlessWallet(key, runtime.logger);
}
