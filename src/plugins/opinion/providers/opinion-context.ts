/**
 * Opinion context provider — injects position summary into every LLM turn.
 * Position 45 — between wallet(30) and pluginHealth(50).
 */
import type { Provider, ProviderResult } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { OpinionPosition } from "../types.js";

export const opinionContextProvider: Provider = {
  name: "opinionContext",
  description:
    "Injects active Opinion.trade prediction market positions into agent context",
  position: 45,
  dynamic: true,

  async get(): Promise<ProviderResult> {
    if (!opinionClient.isReady) return { text: "" };
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;
      if (!positions?.length) {
        return { text: "Opinion: connected, no open positions" };
      }
      const summaries = positions.slice(0, 3).map((p: OpinionPosition) => {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        return `${p.marketTitle}: ${(p.side ?? "").toUpperCase()} ${p.shares}@${p.avgEntryPrice} (${sign}$${pnl})`;
      });
      const extra =
        positions.length > 3 ? ` +${positions.length - 3} more` : "";
      return { text: `Opinion: ${summaries.join("; ")}${extra}` };
    } catch {
      return { text: "" };
    }
  },
};
