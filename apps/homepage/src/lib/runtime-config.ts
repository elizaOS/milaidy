const DEFAULT_CLOUD_BASE =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://www.dev.elizacloud.ai";
const DEFAULT_LOCAL_AGENT_BASE = "http://localhost:2138";
const DEFAULT_SANDBOX_DISCOVERY_URL = "https://sandboxes.waifu.fun/agents";
const DEFAULT_AGENT_UI_BASE_DOMAIN = "milady.ai";
const LEGACY_CLOUD_TOKEN_STORAGE_KEY = "milady-cloud-token";

function normalizeUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  return (candidate && candidate.length > 0 ? candidate : fallback).replace(
    /\/+$/,
    "",
  );
}

function normalizeHostname(
  value: string | undefined,
  fallback: string,
): string {
  const candidate = value
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return candidate && candidate.length > 0 ? candidate : fallback;
}

export const CLOUD_BASE = normalizeUrl(
  import.meta.env.VITE_ELIZA_CLOUD_BASE,
  DEFAULT_CLOUD_BASE,
);

export const LOCAL_AGENT_BASE = normalizeUrl(
  import.meta.env.VITE_LOCAL_AGENT_BASE,
  DEFAULT_LOCAL_AGENT_BASE,
);

export const AGENT_UI_BASE_DOMAIN = normalizeHostname(
  import.meta.env.VITE_AGENT_UI_BASE_DOMAIN,
  DEFAULT_AGENT_UI_BASE_DOMAIN,
);

export function isHostedRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return !(
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function shouldAllowPublicSandboxDiscoveryFallback(): boolean {
  return !isHostedRuntime();
}

export function getCloudTokenStorageKey(): string {
  try {
    const origin = new URL(CLOUD_BASE).origin.replace(/^https?:\/\//, "");
    return `${LEGACY_CLOUD_TOKEN_STORAGE_KEY}:${origin}`;
  } catch {
    return LEGACY_CLOUD_TOKEN_STORAGE_KEY;
  }
}

export { LEGACY_CLOUD_TOKEN_STORAGE_KEY };

export function getSandboxDiscoveryUrls(): string[] {
  const urls = [
    normalizeUrl(
      import.meta.env.VITE_SANDBOX_DISCOVERY_URL,
      DEFAULT_SANDBOX_DISCOVERY_URL,
    ),
  ];

  if (typeof window !== "undefined" && window.location?.hostname) {
    urls.push(
      `${window.location.protocol}//${window.location.hostname}:3456/agents`,
    );
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

/**
 * Optionally rewrite agent UI URLs to use the configured base domain.
 *
 * Only rewrites when `VITE_AGENT_UI_BASE_DOMAIN` is explicitly set to a
 * non-default value.  Otherwise the backend-provided URL (e.g. *.waifu.fun)
 * is returned as-is so we don't force traffic through a domain whose proxy
 * may not be fully configured yet.
 */
export function rewriteAgentUiUrl(url: string): string {
  // Only rewrite if the env var was explicitly provided
  const explicitDomain = import.meta.env.VITE_AGENT_UI_BASE_DOMAIN?.trim();
  if (!explicitDomain) return url;

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith(".waifu.fun") &&
      AGENT_UI_BASE_DOMAIN !== "waifu.fun"
    ) {
      parsed.hostname = parsed.hostname.replace(
        /\.waifu\.fun$/,
        `.${AGENT_UI_BASE_DOMAIN}`,
      );
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
