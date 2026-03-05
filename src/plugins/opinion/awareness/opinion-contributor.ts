/**
 * Opinion awareness contributor — reports prediction market positions.
 * Position 35 — between wallet(30) and provider(40).
 *
 * NOTE: This contributor is not yet registered with the awareness system.
 * It will be wired up when `src/awareness/contributors/index.ts` lands
 * via PR #799 (bsc-awareness-system). The contributor interface defined in
 * `../types.ts` mirrors the contract from `src/contracts/awareness.ts`.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { opinionClient } from "../client.js";
import {
  type AwarenessContributor,
  type OpinionPosition,
  SUMMARY_CHAR_LIMIT,
} from "../types.js";

/** Strip control characters and newlines from external API strings. */
function sanitizeMarketText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips control chars from external API data
  return text.replace(/[\x00-\x1f\x7f]/g, "").trim();
}

export const opinionContributor: AwarenessContributor = {
  id: "opinion",
  position: 35,
  cacheTtl: 30_000,
  invalidateOn: ["opinion-updated", "config-changed"],
  // Data comes from Opinion.trade's external API; market titles are third-party strings.
  trusted: false,

  async summary(_runtime: IAgentRuntime): Promise<string> {
    if (!opinionClient.isReady) return "Opinion: not connected";
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;
      if (!positions?.length) return "Opinion: no positions";
      const totalPnl = positions.reduce((sum: number, p: OpinionPosition) => {
        return (
          sum +
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
            Number(p.shares || 0)
        );
      }, 0);
      const sign = totalPnl >= 0 ? "+" : "";
      const summary = `Opinion: ${positions.length} positions, ${sign}$${totalPnl.toFixed(2)} unrealized`;
      return summary.length <= SUMMARY_CHAR_LIMIT
        ? summary
        : `${summary.slice(0, SUMMARY_CHAR_LIMIT - 1)}\u2026`;
    } catch {
      return "Opinion: unavailable";
    }
  },

  async detail(
    _runtime: IAgentRuntime,
    level: "brief" | "full",
  ): Promise<string> {
    if (!opinionClient.isReady) return "## Opinion\nNot connected.";
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result ?? [];
      const lines = ["## Opinion Trade"];
      if (!positions.length) {
        lines.push("No open positions.");
        return lines.join("\n");
      }
      for (const p of positions) {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        const title = sanitizeMarketText(p.marketTitle ?? "");
        lines.push(
          `- ${title}: ${(p.side ?? "").toUpperCase()} ${p.shares} @ ${p.avgEntryPrice} \u2192 ${p.currentPrice} (${sign}$${pnl})`,
        );
      }
      if (level === "full") {
        lines.push(`\nTotal positions: ${positions.length}`);
        lines.push(
          `Trading mode: ${opinionClient.canTrade ? "enabled" : "read-only"}`,
        );
      }
      return lines.join("\n");
    } catch {
      return "## Opinion\nUnavailable.";
    }
  },
};
