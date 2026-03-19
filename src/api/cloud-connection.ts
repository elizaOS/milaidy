import { resolveCloudApiBaseUrl as resolveCanonicalCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import { validateCloudBaseUrl } from "@elizaos/autonomous/cloud/validate-url";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { ElizaConfig } from "../config/config";
import {
  clearCloudSecrets,
  getCloudSecret,
  scrubCloudSecretsFromEnv,
} from "./cloud-secrets";

const DEFAULT_CLOUD_API_BASE_URL = "https://www.elizacloud.ai/api/v1";
export const CLOUD_BILLING_URL =
  "https://www.elizacloud.ai/dashboard/settings?tab=billing";

const CLOUD_ENV_KEYS = [
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_ENABLED",
  "ELIZAOS_CLOUD_BASE_URL",
  "ELIZAOS_CLOUD_SMALL_MODEL",
  "ELIZAOS_CLOUD_LARGE_MODEL",
] as const;

const CLOUD_RUNTIME_SECRET_KEYS = [
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_ENABLED",
  "ELIZAOS_CLOUD_BASE_URL",
  "ELIZAOS_CLOUD_SMALL_MODEL",
  "ELIZAOS_CLOUD_LARGE_MODEL",
  "ELIZA_CLOUD_AUTH_TOKEN",
  "ELIZA_CLOUD_USER_ID",
  "ELIZA_CLOUD_ORGANIZATION_ID",
] as const;

const CLOUD_RUNTIME_SETTING_KEYS = [
  "ELIZA_CLOUD_AUTH_TOKEN",
  "ELIZA_CLOUD_USER_ID",
  "ELIZA_CLOUD_ORGANIZATION_ID",
] as const;

const CLOUD_AUTH_CLEAR_METHODS = [
  "disconnect",
  "logout",
  "signOut",
  "signout",
  "clearSession",
  "clearAuth",
  "resetAuth",
  "reset",
] as const;

type CloudClientLike = {
  get?: (path: string) => Promise<unknown>;
};

export type CloudAuthLike = {
  isAuthenticated?: () => boolean;
  getUserId?: () => string | undefined;
  getOrganizationId?: () => string | undefined;
  getClient?: () => CloudClientLike | null;
} & Partial<
  Record<
    (typeof CLOUD_AUTH_CLEAR_METHODS)[number],
    (() => Promise<unknown>) | (() => unknown)
  >
>;

type RuntimeCloudLike = AgentRuntime & {
  agentId: string;
  character: {
    secrets?: Record<string, string | number | boolean>;
    settings?: Record<string, unknown>;
  };
  updateAgent?: (
    agentId: string,
    update: { secrets: Record<string, string | number | boolean> },
  ) => Promise<unknown>;
  setSetting?: (key: string, value: string | null) => unknown;
  getService?: (name: string) => unknown;
};

type CloudManagerLike = {
  disconnect?: () => Promise<void>;
} | null;

export type CloudConnectionSnapshot = {
  apiKey: string | undefined;
  authConnected: boolean;
  cloudAuth: CloudAuthLike | null;
  connected: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  organizationId: string | undefined;
  userId: string | undefined;
};

type CloudCreditsResponse = {
  balance: number | null;
  connected: boolean;
  critical?: boolean;
  error?: string;
  low?: boolean;
  topUpUrl?: string;
};

function normalizeSecret(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRuntimeCloud(runtime: AgentRuntime | null): RuntimeCloudLike | null {
  return runtime as RuntimeCloudLike | null;
}

function getCloudAuth(runtime: AgentRuntime | null): CloudAuthLike | null {
  const runtimeWithServices = asRuntimeCloud(runtime);
  if (typeof runtimeWithServices?.getService !== "function") {
    return null;
  }

  const service = runtimeWithServices.getService("CLOUD_AUTH");
  return service && typeof service === "object"
    ? (service as CloudAuthLike)
    : null;
}

export function resolveCloudApiBaseUrl(rawBaseUrl?: string): string {
  return resolveCanonicalCloudApiBaseUrl(
    rawBaseUrl ?? DEFAULT_CLOUD_API_BASE_URL,
  );
}

export function resolveCloudApiKey(
  config: Pick<ElizaConfig, "cloud"> | Record<string, unknown>,
): string | undefined {
  const configApiKey = normalizeSecret(
    (config as { cloud?: { apiKey?: string } }).cloud?.apiKey,
  );
  if (configApiKey) {
    return configApiKey;
  }

  return normalizeSecret(getCloudSecret("ELIZAOS_CLOUD_API_KEY"));
}

export function resolveCloudConnectionSnapshot(
  config: Partial<ElizaConfig>,
  runtime: AgentRuntime | null,
): CloudConnectionSnapshot {
  const enabled =
    config.cloud?.enabled === true ||
    getCloudSecret("ELIZAOS_CLOUD_ENABLED") === "true";
  const apiKey = resolveCloudApiKey(config);
  const cloudAuth = getCloudAuth(runtime);
  const authConnected = Boolean(cloudAuth?.isAuthenticated?.());
  const hasApiKey = Boolean(apiKey);

  return {
    apiKey,
    authConnected,
    cloudAuth,
    connected: authConnected || hasApiKey,
    enabled,
    hasApiKey,
    organizationId: authConnected
      ? normalizeSecret(cloudAuth?.getOrganizationId?.())
      : undefined,
    userId: authConnected
      ? normalizeSecret(cloudAuth?.getUserId?.())
      : undefined,
  };
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
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      "Cloud credits request was redirected; redirects are not allowed",
    );
  }

  const creditResponse = (await response.json().catch(() => ({}))) as {
    balance?: unknown;
    data?: { balance?: unknown };
    error?: unknown;
  };

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
      : typeof creditResponse.data?.balance === "number"
        ? creditResponse.data.balance
        : undefined;

  return typeof rawBalance === "number" ? rawBalance : null;
}

function withCreditFlags(balance: number): CloudCreditsResponse {
  return {
    connected: true,
    balance,
    low: balance < 2.0,
    critical: balance < 0.5,
    topUpUrl: CLOUD_BILLING_URL,
  };
}

export async function fetchUnifiedCloudCredits(
  config: Partial<ElizaConfig>,
  runtime: AgentRuntime | null,
): Promise<CloudCreditsResponse> {
  const snapshot = resolveCloudConnectionSnapshot(config, runtime);
  let authenticatedFailure: string | null = null;
  let authenticatedUnexpectedResponse = false;

  if (!snapshot.connected) {
    return { balance: null, connected: false };
  }

  const cloudClient = snapshot.cloudAuth?.getClient?.();
  if (snapshot.authConnected && typeof cloudClient?.get === "function") {
    try {
      const creditResponse = (await cloudClient.get("/credits/balance")) as {
        balance?: unknown;
        data?: { balance?: unknown };
      };
      const rawBalance =
        typeof creditResponse?.balance === "number"
          ? creditResponse.balance
          : typeof creditResponse?.data?.balance === "number"
            ? creditResponse.data.balance
            : undefined;

      if (typeof rawBalance === "number") {
        return withCreditFlags(rawBalance);
      }

      authenticatedUnexpectedResponse = true;
      logger.debug(
        `[cloud/credits] Unexpected authenticated response shape: ${JSON.stringify(creditResponse)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "cloud API unreachable";
      authenticatedFailure = msg;
      logger.debug(
        `[cloud/credits] Authenticated balance fetch failed: ${msg}`,
      );
    }
  }

  if (!snapshot.apiKey) {
    return {
      balance: null,
      connected: snapshot.connected,
      error:
        authenticatedFailure ??
        (authenticatedUnexpectedResponse
          ? "unexpected response"
          : "missing cloud api key"),
    };
  }

  const resolvedBaseUrl = resolveCloudApiBaseUrl(config.cloud?.baseUrl);
  const baseUrlRejection = await validateCloudBaseUrl(resolvedBaseUrl);
  if (baseUrlRejection) {
    return {
      balance: null,
      connected: true,
      error: baseUrlRejection,
    };
  }

  try {
    const balance = await fetchCloudCreditsByApiKey(
      resolvedBaseUrl,
      snapshot.apiKey,
    );

    if (typeof balance !== "number") {
      return {
        balance: null,
        connected: true,
        error: "unexpected response",
      };
    }

    return withCreditFlags(balance);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "cloud API unreachable";
    logger.debug(`[cloud/credits] Failed to fetch balance via API key: ${msg}`);
    return {
      balance: null,
      connected: true,
      error: msg,
    };
  }
}

async function clearCloudAuthService(
  cloudAuth: CloudAuthLike | null,
): Promise<void> {
  if (!cloudAuth) {
    return;
  }

  const seen = new Set<(...args: never[]) => unknown>();
  for (const methodName of CLOUD_AUTH_CLEAR_METHODS) {
    const method = cloudAuth[methodName];
    if (typeof method !== "function" || seen.has(method)) {
      continue;
    }

    seen.add(method);
    try {
      await method.call(cloudAuth);
    } catch (err) {
      logger.warn(
        `[cloud/disconnect] Failed to invoke CLOUD_AUTH.${methodName}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function clearCloudEnv(): void {
  for (const key of CLOUD_ENV_KEYS) {
    delete process.env[key];
  }
  clearCloudSecrets();
  scrubCloudSecretsFromEnv();
}

async function clearRuntimeCloudState(
  runtime: AgentRuntime | null,
): Promise<void> {
  const runtimeWithCloud = asRuntimeCloud(runtime);
  if (!runtimeWithCloud) {
    return;
  }

  const existingSecrets = runtimeWithCloud.character.secrets ?? {};
  const nextSecrets = { ...existingSecrets };
  for (const key of CLOUD_RUNTIME_SECRET_KEYS) {
    delete nextSecrets[key];
  }
  runtimeWithCloud.character.secrets = nextSecrets;

  if (
    runtimeWithCloud.character.settings &&
    typeof runtimeWithCloud.character.settings === "object"
  ) {
    for (const key of CLOUD_RUNTIME_SETTING_KEYS) {
      delete runtimeWithCloud.character.settings[key];
    }
  }

  if (typeof runtimeWithCloud.setSetting === "function") {
    for (const key of CLOUD_RUNTIME_SETTING_KEYS) {
      try {
        runtimeWithCloud.setSetting(key, null);
      } catch (err) {
        logger.warn(
          `[cloud/disconnect] Failed to clear runtime setting ${key}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  if (typeof runtimeWithCloud.updateAgent === "function") {
    try {
      await runtimeWithCloud.updateAgent(runtimeWithCloud.agentId, {
        secrets: { ...nextSecrets },
      });
    } catch (err) {
      logger.warn(
        `[cloud/disconnect] Failed to clear cloud secrets from agent DB: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export async function disconnectUnifiedCloudConnection(args: {
  cloudManager?: CloudManagerLike;
  config: Partial<ElizaConfig>;
  runtime: AgentRuntime | null;
  saveConfig?: (config: Partial<ElizaConfig>) => void;
}): Promise<void> {
  const { cloudManager = null, config, runtime, saveConfig } = args;

  if (typeof cloudManager?.disconnect === "function") {
    try {
      await cloudManager.disconnect();
    } catch (err) {
      logger.warn(
        `[cloud/disconnect] Failed to disconnect cloud manager: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  await clearCloudAuthService(getCloudAuth(runtime));

  const nextCloud = { ...(config.cloud ?? {}) };
  nextCloud.enabled = false;
  delete nextCloud.apiKey;
  config.cloud = nextCloud;

  try {
    saveConfig?.(config);
  } catch (err) {
    logger.warn(
      `[cloud/disconnect] Failed to save cloud disconnect state: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  clearCloudEnv();
  await clearRuntimeCloudState(runtime);
}
