const LIFO_POPOUT_VALUES = new Set(["", "1", "true", "lifo"]);
export const LIFO_POPOUT_WINDOW_NAME = "milady-lifo-popout";
export const LIFO_POPOUT_FEATURES = "popup,width=1400,height=860";
export const LIFO_SYNC_CHANNEL_PREFIX = "milady-lifo-sync";

function popoutQueryFromHash(hash: string): string | null {
  if (!hash) return null;
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryIndex = normalized.indexOf("?");
  if (queryIndex < 0) return null;
  return new URLSearchParams(normalized.slice(queryIndex + 1)).get("popout");
}

export function isLifoPopoutValue(value: string | null): boolean {
  if (value === null) return false;
  return LIFO_POPOUT_VALUES.has(value.trim().toLowerCase());
}

export function getPopoutValueFromLocation(location: {
  search: string;
  hash: string;
}): string | null {
  const queryValue = new URLSearchParams(location.search || "").get("popout");
  if (queryValue !== null) return queryValue;
  return popoutQueryFromHash(location.hash || "");
}

export function isLifoPopoutModeAtLocation(location: {
  search: string;
  hash: string;
}): boolean {
  return isLifoPopoutValue(getPopoutValueFromLocation(location));
}

export function isLifoPopoutMode(): boolean {
  if (typeof window === "undefined") return false;
  return isLifoPopoutModeAtLocation(window.location);
}

export function generateLifoSessionId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getLifoSessionIdFromLocation(location: {
  search: string;
  hash: string;
}): string | null {
  const fromSearch = new URLSearchParams(location.search || "").get(
    "lifoSession",
  );
  if (fromSearch) return fromSearch;
  const hash = location.hash || "";
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryIndex = normalized.indexOf("?");
  if (queryIndex < 0) return null;
  return new URLSearchParams(normalized.slice(queryIndex + 1)).get(
    "lifoSession",
  );
}

export function getLifoSyncChannelName(sessionId: string | null): string {
  if (sessionId) return `${LIFO_SYNC_CHANNEL_PREFIX}-${sessionId}`;
  return LIFO_SYNC_CHANNEL_PREFIX;
}

export function isSafeEndpointUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildLifoPopoutUrl(options?: {
  baseUrl?: string;
  targetPath?: string;
  sessionId?: string;
}): string {
  if (typeof window === "undefined") return "";

  const targetPath = options?.targetPath ?? "/lifo";
  const baseUrl = options?.baseUrl;
  const sessionId = options?.sessionId;

  if (window.location.protocol === "file:") {
    const sessionParam = sessionId ? `&lifoSession=${sessionId}` : "";
    return `${window.location.origin}${window.location.pathname}#${targetPath}?popout=lifo${sessionParam}`;
  }

  const url = new URL(baseUrl || window.location.href);
  url.pathname = targetPath;
  const params = new URLSearchParams(url.search);
  params.set("popout", "lifo");
  if (sessionId) params.set("lifoSession", sessionId);
  url.search = params.toString();
  url.hash = "";
  return url.toString();
}
