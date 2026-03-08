/**
 * Token logo with CDN image + letter-fallback.
 */

import { useState } from "react";
import { chainIcon, isBscChainName } from "./constants";

/* ── Logo URL resolver ──────────────────────────────────────────────── */

export function tokenLogoUrl(
  chain: string,
  contractAddress: string | null,
): string | null {
  if (!contractAddress) {
    if (isBscChainName(chain))
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png";
    const c = chain.toLowerCase();
    if (c === "ethereum" || c === "mainnet")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
    if (c === "base")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png";
    if (c === "solana")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png";
    return null;
  }
  if (isBscChainName(chain))
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${contractAddress}/logo.png`;
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet")
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${contractAddress}/logo.png`;
  return null;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function TokenLogo({
  symbol,
  chain,
  contractAddress,
  preferredLogoUrl = null,
  size = 32,
}: {
  symbol: string;
  chain: string;
  contractAddress: string | null;
  preferredLogoUrl?: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const usePreferredLogo = Boolean(preferredLogoUrl?.startsWith("http"));
  const url = errored
    ? null
    : usePreferredLogo
      ? preferredLogoUrl
      : tokenLogoUrl(chain, contractAddress);
  const icon = chainIcon(chain);

  if (url) {
    return (
      <img
        src={url}
        alt={symbol}
        width={size}
        height={size}
        className="wt__token-logo"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <span
      className={`wt__token-logo is-letter ${icon.cls}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {symbol.charAt(0).toUpperCase()}
    </span>
  );
}
