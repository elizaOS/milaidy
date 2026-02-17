import { type AgentRuntime, logger } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

const DEFAULT_CLOUD_API_BASE_URL = "https://www.elizacloud.ai/api/v1";
const CLOUD_BILLING_URL =
  "https://www.elizacloud.ai/dashboard/settings?tab=billing";

interface CloudAuthIdentityService {
  isAuthenticated: () => boolean;
  getUserId?: () => string | undefined;
  getOrganizationId?: () => string | undefined;
}

interface CloudAuthCreditsService {
  isAuthenticated: () => boolean;
  getClient: () => { get: <T>(path: string) => Promise<T> };
}

export interface CloudStatusRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json"> {
  config: MiladyConfig;
  runtime: AgentRuntime | null;
}

function resolveCloudApiBaseUrl(rawBaseUrl?: string): string {
  const base = (rawBaseUrl ?? DEFAULT_CLOUD_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  if (base.endsWith("/api/v1")) return base;
  return `${base}/api/v1`;
}

async function fetchCloudCreditsByApiKey(
  baseUrl: string,
  apiKey: string,
): Promise<number | null> {
  const response = await fetch(`${baseUrl}/credits/balance`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  const creditResponse = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof creditResponse.error === "string" && creditResponse.error.trim()
        ? creditResponse.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  const rawBalance =
    typeof creditResponse.balance === "number"
      ? creditResponse.balance
      : typeof (creditResponse.data as Record<string, unknown>)?.balance ===
          "number"
        ? ((creditResponse.data as Record<string, unknown>).balance as number)
        : undefined;
  return typeof rawBalance === "number" ? rawBalance : null;
}

export async function handleCloudStatusRoutes(
  ctx: CloudStatusRouteContext,
): Promise<boolean> {
  const { res, method, pathname, config, runtime, json } = ctx;

  // GET /api/cloud/status
  if (method === "GET" && pathname === "/api/cloud/status") {
    const cloudMode = config.cloud?.enabled;
    const cloudEnabled = cloudMode === true;
    const hasApiKey = Boolean(config.cloud?.apiKey?.trim());
    const effectivelyEnabled =
      cloudEnabled || (cloudMode !== false && hasApiKey);
    const cloudAuth = runtime
      ? (runtime.getService("CLOUD_AUTH") as CloudAuthIdentityService | null)
      : null;
    const authConnected = Boolean(cloudAuth?.isAuthenticated());

    if (authConnected || hasApiKey) {
      json(res, {
        connected: true,
        enabled: effectivelyEnabled,
        hasApiKey,
        userId: authConnected ? cloudAuth?.getUserId?.() : undefined,
        organizationId: authConnected
          ? cloudAuth?.getOrganizationId?.()
          : undefined,
        topUpUrl: CLOUD_BILLING_URL,
        reason: authConnected
          ? undefined
          : runtime
            ? "api_key_present_not_authenticated"
            : "api_key_present_runtime_not_started",
      });
      return true;
    }

    if (!runtime) {
      json(res, {
        connected: false,
        enabled: effectivelyEnabled,
        hasApiKey,
        reason: "runtime_not_started",
      });
      return true;
    }

    json(res, {
      connected: false,
      enabled: effectivelyEnabled,
      hasApiKey,
      reason: "not_authenticated",
    });
    return true;
  }

  // GET /api/cloud/credits
  if (method === "GET" && pathname === "/api/cloud/credits") {
    const cloudAuth = runtime
      ? (runtime.getService("CLOUD_AUTH") as CloudAuthCreditsService | null)
      : null;
    const configApiKey = config.cloud?.apiKey?.trim();

    if (!cloudAuth || !cloudAuth.isAuthenticated()) {
      if (!configApiKey) {
        json(res, { balance: null, connected: false });
        return true;
      }

      try {
        const balance = await fetchCloudCreditsByApiKey(
          resolveCloudApiBaseUrl(config.cloud?.baseUrl),
          configApiKey,
        );
        if (typeof balance !== "number") {
          json(res, {
            balance: null,
            connected: true,
            error: "unexpected response",
          });
          return true;
        }
        const low = balance < 2.0;
        const critical = balance < 0.5;
        json(res, {
          connected: true,
          balance,
          low,
          critical,
          topUpUrl: CLOUD_BILLING_URL,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "cloud API unreachable";
        logger.debug(
          `[cloud/credits] Failed to fetch balance via API key: ${msg}`,
        );
        json(res, { balance: null, connected: true, error: msg });
      }
      return true;
    }

    let balance: number;
    const client = cloudAuth.getClient();
    try {
      // The cloud API returns either { balance: number } (direct)
      // or { success: true, data: { balance: number } } (wrapped).
      // Handle both formats gracefully.
      const creditResponse =
        await client.get<Record<string, unknown>>("/credits/balance");
      const rawBalance =
        typeof creditResponse?.balance === "number"
          ? creditResponse.balance
          : typeof (creditResponse?.data as Record<string, unknown>)
                ?.balance === "number"
            ? ((creditResponse.data as Record<string, unknown>)
                .balance as number)
            : undefined;
      if (typeof rawBalance !== "number") {
        logger.debug(
          `[cloud/credits] Unexpected response shape: ${JSON.stringify(creditResponse)}`,
        );
        json(res, {
          balance: null,
          connected: true,
          error: "unexpected response",
        });
        return true;
      }
      balance = rawBalance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "cloud API unreachable";
      logger.debug(`[cloud/credits] Failed to fetch balance: ${msg}`);
      json(res, { balance: null, connected: true, error: msg });
      return true;
    }

    const low = balance < 2.0;
    const critical = balance < 0.5;
    json(res, {
      connected: true,
      balance,
      low,
      critical,
      topUpUrl: CLOUD_BILLING_URL,
    });
    return true;
  }

  return false;
}
