/**
 * Expand crypto/degen slang into canonical intent tokens so routing can
 * understand casual phrasing without hard-coding every sentence variant.
 */

const SLANG_RULES: Array<{ re: RegExp; tags: string[] }> = [
  { re: /\b(ape|aping|apeing|all in|all-in|full port|fullport|yolo)\b/i, tags: ["buy", "position", "risk"] },
  { re: /\b(send it|sendit|run it up)\b/i, tags: ["execute", "trade", "risk"] },
  { re: /\b(rekt|wrecked|blown up)\b/i, tags: ["loss", "risk"] },
  { re: /\b(bag|bagged|bagholder|holding the bag)\b/i, tags: ["position", "portfolio"] },
  { re: /\b(moon|moonshot|pump|pamp)\b/i, tags: ["price", "upside", "trading"] },
  { re: /\b(dump|nuke|rug|rugged)\b/i, tags: ["downside", "risk"] },
  { re: /\b(fomo|fud)\b/i, tags: ["market", "sentiment", "risk"] },
  { re: /\b(ngmi|wagmi)\b/i, tags: ["risk", "strategy", "crypto"] },
  { re: /\b(jeet|paper hands|diamond hands)\b/i, tags: ["entry", "exit", "position"] },
  { re: /\b(alpha)\b/i, tags: ["insight", "strategy"] },
  { re: /\b(pnl|p\/l)\b/i, tags: ["portfolio", "performance"] },
  { re: /\b(ca|contract addr|contract address)\b/i, tags: ["token", "contract", "address"] },
  { re: /\b(lp|liquidity pool|pool)\b/i, tags: ["liquidity", "swap", "trading"] },
  { re: /\b(slippage)\b/i, tags: ["trade", "execution", "risk"] },
  { re: /\b(meme coin|memecoin|shitcoin)\b/i, tags: ["crypto", "trading", "meme"] },
];

export function expandCryptoSlangContext(text: string): string {
  const input = text.trim();
  if (!input) return input;
  const tags = new Set<string>();
  for (const rule of SLANG_RULES) {
    if (rule.re.test(input)) {
      for (const tag of rule.tags) tags.add(tag);
    }
  }
  if (tags.size === 0) return input;
  return `${input} ${Array.from(tags).join(" ")}`.trim();
}

