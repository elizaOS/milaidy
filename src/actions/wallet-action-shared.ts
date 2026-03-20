/**
 * Shared constants and helpers for wallet action handlers
 * (execute-trade, transfer-token, check-balance).
 *
 * @module actions/wallet-action-shared
 */

import type { IAgentRuntime } from "@elizaos/core";

/** API port for loopback wallet API calls. Shared across all wallet actions. */
export const WALLET_ACTION_API_PORT =
  process.env.MILADY_API_PORT || process.env.MILADY_PORT || "2138";

/**
 * Build Authorization headers for loopback API calls.
 * Reads ELIZA_API_TOKEN from the environment and formats it as a Bearer token.
 * Returns an empty object when no token is configured.
 */
export function buildAuthHeaders(): Record<string, string> {
  const token = process.env.ELIZA_API_TOKEN?.trim();
  if (!token) return {};
  return {
    Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`,
  };
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Returns true when the runtime has any wallet capability that can support
 * trade/transfer actions in local or cloud-managed flows.
 */
export function hasWalletExecutionAccess(runtime: IAgentRuntime): boolean {
  const runtimeGet = (key: string): unknown => {
    try {
      return runtime.getSetting(key);
    } catch {
      return undefined;
    }
  };

  return (
    hasValue(runtimeGet("EVM_PRIVATE_KEY")) ||
    hasValue(runtimeGet("PRIVY_APP_ID")) ||
    hasValue(runtimeGet("BABYLON_PRIVY_APP_ID")) ||
    hasValue(runtimeGet("MILADY_MANAGED_EVM_ADDRESS")) ||
    hasValue(process.env.EVM_PRIVATE_KEY) ||
    hasValue(process.env.PRIVY_APP_ID) ||
    hasValue(process.env.BABYLON_PRIVY_APP_ID) ||
    hasValue(process.env.MILADY_MANAGED_EVM_ADDRESS)
  );
}
