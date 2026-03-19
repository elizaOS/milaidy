const DEFAULT_CLOUD_BASE =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://www.dev.elizacloud.ai";
const DEFAULT_LOCAL_AGENT_BASE = "http://localhost:2138";
const DEFAULT_AGENT_UI_BASE_DOMAIN = "milady.ai";
const LEGACY_CLOUD_TOKEN_STORAGE_KEY = "milady-cloud-token";
const OFFICIAL_HOSTED_DASHBOARD_HOSTS = new Set([
  "milady.ai",
  "www.milady.ai",
  "app.milady.ai",
  "elizacloud.ai",
  "www.elizacloud.ai",
  "www.dev.elizacloud.ai",
  "dev.elizacloud.ai",
]);

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

export function shouldUseSameHostSandboxDiscovery(): boolean {
  if (typeof window === "undefined") return false;
  return !OFFICIAL_HOSTED_DASHBOARD_HOSTS.has(window.location.hostname);
}

export function getSameHostSandboxDiscoveryUrl(): string | null {
  const configured = import.meta.env.VITE_SANDBOX_DISCOVERY_URL?.trim();
  if (configured) return normalizeUrl(configured, configured);
  if (!shouldUseSameHostSandboxDiscovery()) return null;
  return `${window.location.protocol}//${window.location.hostname}:3456/agents`;
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

/**
 * Rewrite agent UI URLs to use the configured base domain.
 *
 * Cloud APIs may still return legacy *.waifu.fun URLs, but the canonical
 * user-facing domain is milady.ai (or whatever VITE_AGENT_UI_BASE_DOMAIN
 * is set to). This keeps pairing/open-web-ui links on the expected domain
 * without relying on any public sandbox discovery endpoint.
 */
export function rewriteAgentUiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".waifu.fun")) {
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
