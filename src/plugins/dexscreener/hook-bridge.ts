/**
 * DexScreener Hook Bridge — converts token alerts into Milady hook events.
 *
 * This is the core integration: when the scanner finds tokens matching an
 * alert rule, the bridge fires Milady hook events so other hooks/plugins
 * can react automatically (execute trades, send notifications, log to
 * workspace, update dashboards, etc.).
 *
 * Users can opt-in per alert rule via `autoHook: true`.
 *
 * Hook events fired:
 *   type: "gateway"
 *   action: "dexscreener:alert"      (or custom per rule)
 *   context: { rule, candidates, topCandidate, ... }
 *
 * @module plugins/dexscreener/hook-bridge
 */

import { logger } from "@elizaos/core";
import { createHookEvent, triggerHook } from "../../hooks/registry";
import type { HookEvent } from "../../hooks/types";
import type {
  AlertRule,
  DexAlertEvent,
  TokenCandidate,
} from "./types";

/**
 * Evaluate whether an alert rule should fire for the given candidates.
 */
export function shouldFireAlert(
  rule: AlertRule,
  candidates: TokenCandidate[],
): { fire: boolean; reason: string; matchingCandidates: TokenCandidate[] } {
  if (!rule.enabled) {
    return { fire: false, reason: "rule-disabled", matchingCandidates: [] };
  }

  // Filter candidates by chain if rule specifies chains
  let filtered = candidates;
  if (rule.chains.length > 0) {
    const chainSet = new Set(rule.chains.map((c) => c.toLowerCase()));
    filtered = filtered.filter((c) =>
      chainSet.has(c.pair.chainId.toLowerCase()),
    );
  }

  // Filter by minimum score
  filtered = filtered.filter((c) => c.score >= rule.minScore);

  if (filtered.length === 0) {
    return { fire: false, reason: "no-matches", matchingCandidates: [] };
  }

  // Filter by required tags (any match)
  if (rule.requiredTags.length > 0) {
    const tagSet = new Set(rule.requiredTags);
    filtered = filtered.filter((c) =>
      c.tags.some((t) => tagSet.has(t)),
    );
    if (filtered.length === 0) {
      return { fire: false, reason: "no-tag-match", matchingCandidates: [] };
    }
  }

  // Filter out candidates with blocked risk flags
  if (rule.blockedRiskFlags.length > 0) {
    const blockedSet = new Set(rule.blockedRiskFlags);
    filtered = filtered.filter(
      (c) => !c.risk.flags.some((f) => blockedSet.has(f)),
    );
    if (filtered.length === 0) {
      return {
        fire: false,
        reason: "blocked-by-risk",
        matchingCandidates: [],
      };
    }
  }

  // Cooldown check
  if (rule.lastAlertAt) {
    const lastAt = new Date(rule.lastAlertAt).getTime();
    const elapsed = (Date.now() - lastAt) / 1000;
    if (elapsed < rule.cooldownSeconds) {
      return {
        fire: false,
        reason: "cooldown",
        matchingCandidates: filtered,
      };
    }
  }

  return { fire: true, reason: "ok", matchingCandidates: filtered };
}

/**
 * Build a structured alert event from matching candidates.
 */
export function buildAlertEvent(
  rule: AlertRule,
  candidates: TokenCandidate[],
): DexAlertEvent {
  const top = candidates[0] ?? null;
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    timestamp: new Date().toISOString(),
    candidates: candidates.slice(0, 5).map((c) => ({
      chainId: c.pair.chainId,
      token: c.pair.baseSymbol,
      tokenName: c.pair.baseName,
      score: c.score,
      priceChangeH1: c.pair.priceChangeH1,
      volumeH24: c.pair.volumeH24,
      liquidityUsd: c.pair.liquidityUsd,
      pairUrl: c.pair.pairUrl,
      tags: c.tags,
      riskFlags: c.risk.flags,
    })),
    topCandidate: top
      ? {
          chainId: top.pair.chainId,
          token: top.pair.baseSymbol,
          score: top.score,
          pairUrl: top.pair.pairUrl,
        }
      : null,
  };
}

/**
 * Fire a Milady hook event for a DexScreener alert.
 *
 * This is what makes alerts "automatic hooks" — any registered hook handler
 * listening for gateway:dexscreener:alert (or the custom action) will execute.
 */
export async function fireAlertHook(
  rule: AlertRule,
  alertEvent: DexAlertEvent,
  sessionKey = "dexscreener",
): Promise<void> {
  const action = rule.hookAction ?? "dexscreener:alert";

  const hookEvent: HookEvent = createHookEvent(
    "gateway",
    action,
    sessionKey,
    {
      source: "dexscreener-plugin",
      ruleId: rule.id,
      ruleName: rule.name,
      alert: alertEvent,
      topToken: alertEvent.topCandidate?.token ?? null,
      topScore: alertEvent.topCandidate?.score ?? null,
      topChain: alertEvent.topCandidate?.chainId ?? null,
      candidateCount: alertEvent.candidates.length,
      timestamp: alertEvent.timestamp,
    },
  );

  logger.info(
    {
      src: "dexscreener-hook-bridge",
      ruleId: rule.id,
      ruleName: rule.name,
      action,
      candidateCount: alertEvent.candidates.length,
      topToken: alertEvent.topCandidate?.token,
    },
    `Firing DexScreener hook: ${action}`,
  );

  await triggerHook(hookEvent);
}

/**
 * Process a set of candidates against all alert rules.
 *
 * For each rule that fires, optionally sends the alert through the hook
 * system and/or webhook. Returns updated rules with lastAlertAt set.
 */
export async function processAlerts(
  rules: AlertRule[],
  candidates: TokenCandidate[],
  opts: {
    sessionKey?: string;
    onWebhook?: (rule: AlertRule, event: DexAlertEvent) => Promise<void>;
  } = {},
): Promise<{
  updatedRules: AlertRule[];
  firedCount: number;
  results: Array<{
    ruleId: string;
    fired: boolean;
    reason: string;
  }>;
}> {
  const updatedRules: AlertRule[] = [];
  const results: Array<{ ruleId: string; fired: boolean; reason: string }> = [];
  let firedCount = 0;

  for (const rule of rules) {
    const { fire, reason, matchingCandidates } = shouldFireAlert(
      rule,
      candidates,
    );

    if (!fire) {
      updatedRules.push(rule);
      results.push({ ruleId: rule.id, fired: false, reason });
      continue;
    }

    const alertEvent = buildAlertEvent(rule, matchingCandidates);
    const now = new Date().toISOString();

    // Fire as Milady hook if autoHook is enabled
    if (rule.autoHook && rule.channels.includes("hook")) {
      try {
        await fireAlertHook(rule, alertEvent, opts.sessionKey);
      } catch (err) {
        logger.error(
          {
            src: "dexscreener-hook-bridge",
            ruleId: rule.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to fire alert hook",
        );
      }
    }

    // Fire webhook if configured
    if (rule.channels.includes("webhook") && rule.webhookUrl && opts.onWebhook) {
      try {
        await opts.onWebhook(rule, alertEvent);
      } catch (err) {
        logger.error(
          {
            src: "dexscreener-hook-bridge",
            ruleId: rule.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to send webhook alert",
        );
      }
    }

    // Log channel
    if (rule.channels.includes("log")) {
      const top = alertEvent.topCandidate;
      logger.info(
        {
          src: "dexscreener-alert",
          rule: rule.name,
          topToken: top?.token,
          topScore: top?.score,
          topChain: top?.chainId,
          matchCount: matchingCandidates.length,
        },
        `[DexScreener Alert] ${rule.name}: ${top?.chainId}:${top?.token} score=${top?.score}`,
      );
    }

    firedCount++;
    updatedRules.push({ ...rule, lastAlertAt: now });
    results.push({ ruleId: rule.id, fired: true, reason: "ok" });
  }

  return { updatedRules, firedCount, results };
}
