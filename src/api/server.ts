import type http from "node:http";

export * from "@elizaos/autonomous/api/server";

/**
 * Build the Authorization header value to use when forwarding requests to
 * Hyperscape. Returns `null` when no token is configured.
 *
 * - When `HYPERSCAPE_AUTH_TOKEN` is set, its value is used (prefixed with
 *   "Bearer " if not already present) regardless of any incoming header.
 * - When the env var is unset, returns `null` so callers know not to forward
 *   any credentials.
 */
export function resolveHyperscapeAuthorizationHeader(
  _req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const token = process.env.HYPERSCAPE_AUTH_TOKEN;
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}
