const LIFO_POPOUT_VALUES = new Set(["", "1", "true", "lifo"]);

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
