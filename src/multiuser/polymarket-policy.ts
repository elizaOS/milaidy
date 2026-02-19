import type { PolymarketPermissions, TenantSettings } from "./types.js";

export interface BetRequest {
  marketId: string;
  outcome: string;
  amountUsd: number;
}

export interface SpendWindowStats {
  spentUsdToday: number;
  lastSpendAtMs: number | null;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
}

export function defaultPolymarketPermissions(): PolymarketPermissions {
  return {
    level: "read_only",
    dailySpendLimitUsd: "50",
    perTradeLimitUsd: "20",
    confirmationMode: "required",
    cooldownSeconds: 30,
  };
}

/**
 * Strict defaults:
 * - Betting is disabled unless explicitly enabled.
 * - Confirmation is required for money actions.
 * - Spend limits are enforced before execution.
 */
export function evaluateBetPolicy(
  settings: TenantSettings,
  request: BetRequest,
  stats: SpendWindowStats,
  nowMs: number,
): PolicyDecision {
  const p = settings.polymarket;
  if (p.level !== "can_bet") {
    return {
      allowed: false,
      reason: "Polymarket bet permissions are disabled",
      requiresConfirmation: false,
    };
  }

  const perTradeLimit = Number.parseFloat(p.perTradeLimitUsd);
  if (Number.isFinite(perTradeLimit) && request.amountUsd > perTradeLimit) {
    return {
      allowed: false,
      reason: `Trade exceeds per-trade limit ($${perTradeLimit})`,
      requiresConfirmation: false,
    };
  }

  const dailyLimit = Number.parseFloat(p.dailySpendLimitUsd);
  if (
    Number.isFinite(dailyLimit) &&
    stats.spentUsdToday + request.amountUsd > dailyLimit
  ) {
    return {
      allowed: false,
      reason: `Trade exceeds daily limit ($${dailyLimit})`,
      requiresConfirmation: false,
    };
  }

  if (stats.lastSpendAtMs != null && p.cooldownSeconds > 0) {
    const deltaSeconds = Math.floor((nowMs - stats.lastSpendAtMs) / 1000);
    if (deltaSeconds < p.cooldownSeconds) {
      return {
        allowed: false,
        reason: `Cooldown active (${p.cooldownSeconds - deltaSeconds}s remaining)`,
        requiresConfirmation: false,
      };
    }
  }

  return {
    allowed: true,
    reason: "Allowed",
    requiresConfirmation: p.confirmationMode === "required",
  };
}
