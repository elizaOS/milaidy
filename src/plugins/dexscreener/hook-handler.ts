/**
 * DexScreener Hook Handler — default handler for dexscreener:alert hook events.
 *
 * This handler is automatically registered when the plugin initializes.
 * It reacts to alert hook events by pushing formatted messages back into
 * the hook event's message queue, which the session can display to the user.
 *
 * Users can register additional handlers for "gateway:dexscreener:alert"
 * to build custom automations (trading bots, notification pipelines, etc.).
 *
 * @module plugins/dexscreener/hook-handler
 */

import { logger } from "@elizaos/core";
import { registerHook } from "../../hooks/registry";
import type { HookEvent } from "../../hooks/types";
import type { DexAlertEvent } from "./types";

/**
 * Default hook handler for DexScreener alerts.
 *
 * Formats the alert into a human-readable message and pushes it into
 * the hook event's message array so the session UI can display it.
 */
async function handleDexScreenerAlert(event: HookEvent): Promise<void> {
  const alert = event.context.alert as DexAlertEvent | undefined;
  if (!alert) {
    logger.warn(
      { src: "dexscreener-hook-handler" },
      "Received dexscreener:alert event without alert data",
    );
    return;
  }

  const top = alert.topCandidate;
  const lines: string[] = [
    `[DexScreener] ${alert.ruleName}`,
  ];

  if (top) {
    lines.push(
      `Top: ${top.chainId}:${top.token} (score ${top.score.toFixed(1)}) — ${top.pairUrl}`,
    );
  }

  for (const c of alert.candidates.slice(0, 3)) {
    lines.push(
      `  ${c.chainId}:${c.token} score=${c.score.toFixed(1)} ` +
        `1h=${c.priceChangeH1 >= 0 ? "+" : ""}${c.priceChangeH1.toFixed(2)}% ` +
        `vol24=$${c.volumeH24.toLocaleString()} ` +
        `liq=$${c.liquidityUsd.toLocaleString()}` +
        (c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "") +
        (c.riskFlags.length > 0
          ? ` (risk: ${c.riskFlags.join(", ")})`
          : ""),
    );
  }

  if (alert.candidates.length > 3) {
    lines.push(`  ... and ${alert.candidates.length - 3} more`);
  }

  const message = lines.join("\n");
  event.messages.push(message);

  logger.info(
    {
      src: "dexscreener-hook-handler",
      rule: alert.ruleName,
      candidateCount: alert.candidates.length,
      topToken: top?.token,
      topScore: top?.score,
    },
    `DexScreener alert processed: ${alert.ruleName}`,
  );
}

/**
 * Register the default DexScreener hook handler.
 *
 * Listens on "gateway:dexscreener:alert" for alerts fired by the hook bridge.
 */
export function registerDexScreenerHookHandler(): void {
  registerHook("gateway:dexscreener:alert", handleDexScreenerAlert);

  logger.info(
    { src: "dexscreener-hook-handler" },
    "Registered DexScreener alert hook handler on gateway:dexscreener:alert",
  );
}
