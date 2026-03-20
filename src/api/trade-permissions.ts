import type { MiladyConfig } from "../config/config";

export type TradePermissionMode =
  | "user-sign-only"
  | "manual-local-key"
  | "agent-auto";

/**
 * Resolve the active trade permission mode from config.
 * Falls back to "user-sign-only" when not configured.
 */
export function resolveTradePermissionMode(
  config: MiladyConfig,
): TradePermissionMode {
  const raw = (config.features as Record<string, unknown> | undefined)
    ?.tradePermissionMode;
  if (
    raw === "user-sign-only" ||
    raw === "manual-local-key" ||
    raw === "agent-auto"
  ) {
    return raw;
  }
  return "user-sign-only";
}

/**
 * Returns true if local-key execution is permitted for the given actor.
 * @param mode    The resolved trade permission mode.
 * @param isAgent True when the caller is the agent (autonomous), false for user-initiated flows.
 */
export function canUseLocalTradeExecution(
  mode: TradePermissionMode,
  isAgent: boolean,
): boolean {
  if (mode === "agent-auto") return true;
  if (mode === "manual-local-key") return !isAgent;
  return false;
}

