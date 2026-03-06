/**
 * Opinion context provider — injects position summary into every LLM turn.
 * Position 45 — between wallet(30) and pluginHealth(50).
 */
import type { Provider, ProviderResult } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { OpinionPosition } from "../types.js";

/** Strip control characters and newlines from external API strings. */
function sanitizeMarketText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips control chars from external API data
  return text.replace(/[\x00-\x1f\x7f]/g, "").trim();
}

// -- 30-second TTL cache for positions ------------------------------------
const CACHE_TTL_MS = 30_000;
let _cachedResult: ProviderResult | null = null;
let _cachedAt = 0;

/** @internal Reset cache — exposed for testing only. */
export function _resetPositionCache(): void {
  _cachedResult = null;
  _cachedAt = 0;
}

export const opinionContextProvider: Provider = {
  name: "opinionContext",
  description:
    "Injects active Opinion.trade prediction market positions into agent context",
  position: 45,
  dynamic: true,

  async get(): Promise<ProviderResult> {
    if (!opinionClient.isReady) return { text: "" };

    const now = Date.now();
    if (_cachedResult && now - _cachedAt < CACHE_TTL_MS) {
      return _cachedResult;
    }

    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;
      if (!positions?.length) {
        const result: ProviderResult = {
          text: "Opinion: connected, no open positions",
        };
        _cachedResult = result;
        _cachedAt = now;
        return result;
      }
      const summaries = positions.slice(0, 3).map((p: OpinionPosition) => {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        const title = sanitizeMarketText(p.marketTitle ?? "");
        return `${title}: ${(p.side ?? "").toUpperCase()} ${p.shares}@${p.avgEntryPrice} (${sign}$${pnl})`;
      });
      const extra =
        positions.length > 3 ? ` +${positions.length - 3} more` : "";
      const result: ProviderResult = {
        text: `Opinion: ${summaries.join("; ")}${extra}`,
      };
      _cachedResult = result;
      _cachedAt = now;
      return result;
    } catch {
      return { text: "" };
    }
  },
};
