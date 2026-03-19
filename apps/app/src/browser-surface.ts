export const DEFAULT_BROWSER_HOME = "https://duckduckgo.com/";
const BROWSER_SEARCH_BASE = "https://duckduckgo.com/?q=";

function hasHttpScheme(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasAnyScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function isLocalHostLike(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /^(localhost|\[::1\])(?::\d+)?(?:\/|$)/.test(normalized) ||
    /^0\.0\.0\.0(?::\d+)?(?:\/|$)/.test(normalized) ||
    /^127(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/.test(normalized) ||
    /^10(?:\.\d{1,3}){3}(?::\d+)?(?:\/|$)/.test(normalized) ||
    /^192\.168(?:\.\d{1,3}){2}(?::\d+)?(?:\/|$)/.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(?::\d+)?(?:\/|$)/.test(
      normalized,
    )
  );
}

function looksLikeUrlCandidate(value: string): boolean {
  if (hasAnyScheme(value)) {
    return true;
  }

  return (
    value.includes(".") ||
    value.includes("/") ||
    value.includes(":") ||
    value.toLowerCase().startsWith("localhost")
  );
}

function toSearchUrl(query: string): string {
  return `${BROWSER_SEARCH_BASE}${encodeURIComponent(query)}`;
}

export function normalizeBrowserAddressInput(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return DEFAULT_BROWSER_HOME;
  }

  if (hasAnyScheme(trimmed) && !isLocalHostLike(trimmed)) {
    if (!hasHttpScheme(trimmed)) {
      return toSearchUrl(trimmed);
    }

    try {
      return new URL(trimmed).toString();
    } catch {
      return toSearchUrl(trimmed);
    }
  }

  if (!looksLikeUrlCandidate(trimmed)) {
    return toSearchUrl(trimmed);
  }

  const prefixed = `${isLocalHostLike(trimmed) ? "http" : "https"}://${trimmed}`;
  try {
    return new URL(prefixed).toString();
  } catch {
    return toSearchUrl(trimmed);
  }
}

export function readBrowserNavigationUrl(detail: unknown): string | null {
  const candidate =
    typeof detail === "string"
      ? detail
      : detail && typeof detail === "object" && "url" in detail
        ? (detail as { url?: unknown }).url
        : null;

  if (typeof candidate !== "string") {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
