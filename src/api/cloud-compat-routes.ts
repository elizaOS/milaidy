/**
 * Cloud Compat proxy routes — forwards /api/cloud/compat/* to Eliza Cloud v2's
 * /api/compat/* endpoints, injecting stored credentials for authentication.
 *
 * Auth strategy:
 *   1. If a service key is configured, sends X-Service-Key header (S2S auth)
 *   2. Falls back to Authorization: Bearer <apiKey> (standard user auth)
 *
 * Resilience:
 *   - Retries once on HTTP 503 (deploy-in-progress) after a 2s backoff
 *   - 15s timeout per attempt
 *   - Rejects redirects
 *   - 1MB body size limit
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import { validateCloudBaseUrl } from "../cloud/validate-url";
import type { MiladyConfig } from "../config/config";
import { sendJson, sendJsonError } from "./http-helpers";

export interface CloudCompatRouteState {
  config: MiladyConfig;
}

const PROXY_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_048_576;
const RETRY_BACKOFF_MS = 2_000;

/**
 * Resolve the Eliza Cloud base URL from config (without trailing slashes).
 */
export function resolveCloudBaseUrl(config: MiladyConfig): string {
  return (config.cloud?.baseUrl ?? "https://www.elizacloud.ai")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Build auth headers based on available credentials.
 * Prefers X-Service-Key (S2S) when a service key is configured;
 * falls back to Bearer token (standard user API key).
 */
function buildAuthHeaders(config: MiladyConfig): Record<string, string> {
  const serviceKey = (config.cloud as Record<string, unknown> | undefined)
    ?.serviceKey as string | undefined;
  const apiKey = config.cloud?.apiKey?.trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (serviceKey?.trim()) {
    headers["X-Service-Key"] = serviceKey.trim();
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

/**
 * Read request body with size limit enforcement.
 */
function readBody(req: http.IncomingMessage): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      resolve(
        chunks.length > 0 ? Buffer.concat(chunks).toString("utf-8") : undefined,
      ),
    );
    req.on("error", reject);
  });
}

/**
 * Execute a single upstream fetch with timeout and redirect rejection.
 */
async function fetchUpstream(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });

  if (res.status >= 300 && res.status < 400) {
    throw Object.assign(new Error("redirect"), { code: "REDIRECT" });
  }

  return res;
}

/**
 * Returns true if the request was handled, false if path didn't match.
 */
export async function handleCloudCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudCompatRouteState,
): Promise<boolean> {
  // Only handle /api/cloud/compat/* routes
  if (!pathname.startsWith("/api/cloud/compat/")) return false;

  const apiKey = state.config.cloud?.apiKey?.trim();
  if (!apiKey) {
    sendJsonError(
      res,
      "Not connected to Milady Cloud. Please log in first.",
      401,
    );
    return true;
  }

  const baseUrl = resolveCloudBaseUrl(state.config);
  const urlError = await validateCloudBaseUrl(baseUrl);
  if (urlError) {
    sendJsonError(res, urlError, 502);
    return true;
  }

  // Strip /api/cloud prefix and ensure we hit the /api/compat upstream route
  // /api/cloud/compat/agents → /api/compat/agents
  const compatPath = pathname.replace("/api/cloud", "/api");

  // Forward query string if present
  const fullUrl = req.url ?? pathname;
  const qsIndex = fullUrl.indexOf("?");
  const queryString = qsIndex >= 0 ? fullUrl.slice(qsIndex) : "";

  const upstreamUrl = `${baseUrl}${compatPath}${queryString}`;
  const headers = buildAuthHeaders(state.config);

  try {
    // Read request body for non-GET methods
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await readBody(req);
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetchUpstream(upstreamUrl, method, headers, body);
    } catch (firstErr) {
      // Retry once on 503 (deploy/maintenance) after a short backoff
      if (
        firstErr instanceof Response ||
        (firstErr instanceof Error &&
          "code" in firstErr &&
          (firstErr as { code: string }).code === "REDIRECT")
      ) {
        throw firstErr;
      }
      throw firstErr;
    }

    // Retry on 503 (Service Unavailable — likely deploy in progress)
    if (upstreamRes.status === 503) {
      logger.info(
        `[cloud-compat] Got 503 from upstream, retrying after ${RETRY_BACKOFF_MS}ms: ${compatPath}`,
      );
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      try {
        upstreamRes = await fetchUpstream(upstreamUrl, method, headers, body);
      } catch {
        // Fall through to return the original 503
      }
    }

    const responseData = await upstreamRes.json().catch(() => ({
      success: false,
      error: `HTTP ${upstreamRes.status}`,
    }));

    sendJson(res, responseData, upstreamRes.status);
    return true;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "REDIRECT"
    ) {
      sendJsonError(
        res,
        "Milady Cloud request was redirected; redirects are not allowed",
        502,
      );
      return true;
    }

    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        err.message.toLowerCase().includes("timeout"));

    if (isTimeout) {
      logger.warn(`[cloud-compat] Upstream request timed out: ${compatPath}`);
      sendJsonError(res, "Milady Cloud request timed out", 504);
    } else {
      logger.warn(
        `[cloud-compat] Upstream request failed: ${compatPath} — ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJsonError(res, "Failed to reach Milady Cloud", 502);
    }
    return true;
  }
}
