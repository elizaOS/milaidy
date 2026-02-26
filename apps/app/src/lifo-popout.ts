const LIFO_POPOUT_VALUES = new Set(["", "1", "true", "lifo"]);
export const LIFO_POPOUT_WINDOW_NAME = "milady-lifo-popout";

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

export function buildLifoPopoutUrl(options?: {
  baseUrl?: string;
  targetPath?: string;
}): string {
  if (typeof window === "undefined") return "";

  const targetPath = options?.targetPath ?? "/lifo";
  const baseUrl = options?.baseUrl;

  if (window.location.protocol === "file:") {
    return `${window.location.origin}${window.location.pathname}#${targetPath}?popout=lifo`;
  }

  const url = new URL(baseUrl || window.location.href);
  url.pathname = targetPath;
  const params = new URLSearchParams(url.search);
  params.set("popout", "lifo");
  url.search = params.toString();
  url.hash = "";
  return url.toString();
}
