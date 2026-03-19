export function getSpaFallbackRedirectTarget(locationLike: {
  pathname: string;
  search: string;
  hash: string;
}): string | null {
  if (locationLike.pathname !== "/") return null;

  const params = new URLSearchParams(locationLike.search);
  const encodedPath = params.get("p");
  if (!encodedPath) return null;

  let restoredPath: string;
  try {
    restoredPath = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }

  if (!restoredPath.startsWith("/") || restoredPath.startsWith("//")) {
    return null;
  }

  const restoredSearch = params.get("q") ?? "";
  const restoredHash = params.get("h") ?? "";

  return `${restoredPath}${restoredSearch}${restoredHash}`;
}
