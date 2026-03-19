const DEFAULT_CLOUD_BASE =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://www.elizacloud.ai";
const DEFAULT_LOCAL_AGENT_BASE = "http://localhost:2138";
const DEFAULT_SANDBOX_DISCOVERY_URL = "https://sandboxes.waifu.fun/agents";

function normalizeUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  return (candidate && candidate.length > 0 ? candidate : fallback).replace(
    /\/+$/,
    "",
  );
}

export const CLOUD_BASE = normalizeUrl(
  import.meta.env.VITE_ELIZA_CLOUD_BASE,
  DEFAULT_CLOUD_BASE,
);

export const LOCAL_AGENT_BASE = normalizeUrl(
  import.meta.env.VITE_LOCAL_AGENT_BASE,
  DEFAULT_LOCAL_AGENT_BASE,
);

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
