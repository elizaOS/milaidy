/**
 * Shared constants and helpers for wallet action handlers
 * (execute-trade, transfer-token, check-balance).
 *
 * @module actions/wallet-action-shared
 */

/** API port for loopback wallet API calls. Shared across all wallet actions. */
export const WALLET_ACTION_API_PORT =
  process.env.API_PORT || process.env.SERVER_PORT || "2138";

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
