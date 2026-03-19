/**
 * Fallback parsing when the runtime invokes JEJU_SWAP without structured
 * `HandlerOptions.parameters` (common with LLM-chosen actions from chat).
 */

export type JejuSwapDirection = "eth_to_usdc" | "usdc_to_eth";

export interface ParsedJejuSwap {
  direction?: JejuSwapDirection;
  amount?: string;
}

/** First index of a regex match in haystack, or -1. */
function matchIndex(haystack: string, re: RegExp): number {
  return haystack.search(re);
}

/**
 * Infer direction and amount from natural language (e.g. "swap 0.1 ETH for USDC").
 */
export function parseJejuSwapFromUserText(text: string): ParsedJejuSwap {
  const t = text.trim();
  if (!t) return {};

  const lower = t.toLowerCase();

  const ethIdx = matchIndex(lower, /\b(eth|weth|ether)\b/);
  const usdcIdx = matchIndex(lower, /\busdc\b/);

  let direction: JejuSwapDirection | undefined;
  if (ethIdx >= 0 && usdcIdx >= 0) {
    direction = ethIdx < usdcIdx ? "eth_to_usdc" : "usdc_to_eth";
  } else if (ethIdx >= 0 && usdcIdx < 0 && /\bswap\b/.test(lower)) {
    direction = "eth_to_usdc";
  } else if (usdcIdx >= 0 && ethIdx < 0 && /\bswap\b/.test(lower)) {
    direction = "usdc_to_eth";
  }

  let amount: string | undefined;
  if (direction === "eth_to_usdc") {
    const withAsset = t.match(/(\d+(?:\.\d+)?)\s*(?:eth|weth|ether)\b/i);
    if (withAsset) {
      amount = withAsset[1];
    } else {
      const swapBare = t.match(/\bswap\s+(\d+(?:\.\d+)?)\b/i);
      if (swapBare && /\busdc\b/i.test(t)) {
        amount = swapBare[1];
      }
    }
  } else if (direction === "usdc_to_eth") {
    const m = t.match(/(\d+(?:\.\d+)?)\s*usdc\b/i);
    if (m) amount = m[1];
  }

  return { direction, amount };
}
