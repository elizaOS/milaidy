/**
 * Public RPC defaults used when users do not provide private endpoints.
 */

export const PUBLIC_BSC_RPC_PRIMARY = "https://bsc-rpc.publicnode.com";
export const PUBLIC_BSC_RPC_SECONDARY = "https://bsc.publicnode.com";
export const PUBLIC_ETHEREUM_RPC_PRIMARY = "https://ethereum.publicnode.com";
export const PUBLIC_BASE_RPC_PRIMARY = "https://base.publicnode.com";
export const PUBLIC_SOLANA_RPC_PRIMARY = "https://solana-rpc.publicnode.com";

export interface AppliedPublicRpcDefault {
  key: "BSC_RPC_URL" | "ETHEREUM_RPC_URL" | "BASE_RPC_URL" | "SOLANA_RPC_URL";
  url: string;
}

export const DEFAULT_BSC_RPC_URLS = [
  PUBLIC_BSC_RPC_PRIMARY,
  PUBLIC_BSC_RPC_SECONDARY,
] as const;

export function applyPublicRpcDefaults(
  env: Record<string, string | undefined>,
): AppliedPublicRpcDefault[] {
  const applied: AppliedPublicRpcDefault[] = [];

  const maybeApply = (
    key: AppliedPublicRpcDefault["key"],
    url: string,
  ): void => {
    if (!env[key]?.trim()) {
      env[key] = url;
      applied.push({ key, url });
    }
  };

  maybeApply("BSC_RPC_URL", PUBLIC_BSC_RPC_PRIMARY);
  maybeApply("ETHEREUM_RPC_URL", PUBLIC_ETHEREUM_RPC_PRIMARY);
  maybeApply("BASE_RPC_URL", PUBLIC_BASE_RPC_PRIMARY);
  maybeApply("SOLANA_RPC_URL", PUBLIC_SOLANA_RPC_PRIMARY);

  return applied;
}

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
