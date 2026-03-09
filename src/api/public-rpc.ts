/**
 * Public RPC defaults used when users do not provide private endpoints.
 */

export const PUBLIC_BSC_RPC_PRIMARY = "https://bsc-rpc.publicnode.com";
export const PUBLIC_BSC_RPC_SECONDARY = "https://bsc.publicnode.com";
export const PUBLIC_ETHEREUM_RPC_PRIMARY = "https://ethereum.publicnode.com";
export const PUBLIC_BASE_RPC_PRIMARY = "https://base.publicnode.com";
export const PUBLIC_SOLANA_RPC_PRIMARY = "https://solana-rpc.publicnode.com";
export const DEFAULT_BAP578_CONTRACT_ADDRESS =
  "0x8cc16Dd6d816A33A6822344C3F8958e6dfEfcA34";

export const DEFAULT_BSC_RPC_URLS = [
  PUBLIC_BSC_RPC_PRIMARY,
  PUBLIC_BSC_RPC_SECONDARY,
] as const;

export function normalizeRpcUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function uniqueRpcUrls(
  urls: Array<string | null | undefined>,
): string[] {
  const normalized = urls
    .map((url) => normalizeRpcUrl(url))
    .filter((url): url is string => Boolean(url));
  return [...new Set(normalized)];
}
