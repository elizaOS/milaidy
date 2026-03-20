function hasRequestForPath(
  requests: readonly string[],
  pathname: string,
): boolean {
  return requests.some((request) => request.endsWith(` ${pathname}`));
}

export function hasPackagedRendererBootstrapRequests(
  requests: readonly string[],
): boolean {
  if (hasRequestForPath(requests, "/api/status")) {
    return true;
  }

  const sawConfig = hasRequestForPath(requests, "/api/config");
  const sawRendererOwnedBootstrapRequest =
    hasRequestForPath(requests, "/api/drop/status") ||
    hasRequestForPath(requests, "/api/stream/settings");

  return sawConfig && sawRendererOwnedBootstrapRequest;
}
