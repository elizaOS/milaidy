import type http from "node:http";
import {
  type CloudRouteState as AutonomousCloudRouteState,
  handleCloudRoute as handleAutonomousCloudRoute,
} from "@elizaos/autonomous/api/cloud-routes";
import { normalizeCloudSiteUrl } from "@elizaos/autonomous/cloud/base-url";
import type { CloudManager } from "@elizaos/autonomous/cloud/cloud-manager";
import { validateCloudBaseUrl } from "@elizaos/autonomous/cloud/validate-url";
import type { AgentRuntime } from "@elizaos/core";
import type { ElizaConfig } from "../config/config";
import { saveElizaConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
import { disconnectUnifiedCloudConnection } from "./cloud-connection";
import { clearCloudSecrets, scrubCloudSecretsFromEnv } from "./cloud-secrets";

// Re-export the public API from the decoupled secrets module so existing
// consumers can still import from "./cloud-routes".
export {
  _resetCloudSecretsForTesting,
  getCloudSecret,
} from "./cloud-secrets";

export interface CloudRouteState {
  config: ElizaConfig;
  cloudManager: CloudManager | null;
  /** The running agent runtime — needed to persist cloud credentials to the DB. */
  runtime: AgentRuntime | null;
}

type CloudRuntimeSecrets = Record<string, string | number | boolean>;
type RuntimeCloudLike = AgentRuntime & {
  agentId: string;
  character: {
    secrets?: CloudRuntimeSecrets;
  };
  updateAgent?: (
    agentId: string,
    update: { secrets: CloudRuntimeSecrets },
  ) => Promise<unknown>;
};

const CLOUD_LOGIN_POLL_TIMEOUT_MS = 10_000;

function sendJson(res: http.ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendJsonError(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  sendJson(res, { error: message }, status);
}

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }
  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function fetchCloudLoginStatus(
  sessionId: string,
  baseUrl: string,
): Promise<Response> {
  return fetch(
    `${baseUrl}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    {
      redirect: "manual",
      signal: AbortSignal.timeout(CLOUD_LOGIN_POLL_TIMEOUT_MS),
    },
  );
}

async function persistCloudLoginStatus(args: {
  apiKey: string;
  state: CloudRouteState;
}): Promise<void> {
  const cloud = { ...(args.state.config.cloud ?? {}) } as Record<
    string,
    unknown
  >;
  const wasCloudEnabled = cloud.enabled === true;
  const services = asRecord(cloud.services);

  cloud.apiKey = args.apiKey;
  cloud.enabled = wasCloudEnabled;

  if (!wasCloudEnabled) {
    if (
      typeof cloud.inferenceMode !== "string" ||
      cloud.inferenceMode === "cloud"
    ) {
      cloud.inferenceMode = "byok";
    }
    cloud.services = {
      ...(services ?? {}),
      inference: false,
    };
  }

  args.state.config.cloud = cloud as ElizaConfig["cloud"];

  try {
    saveElizaConfig(args.state.config);
  } catch {
    // Non-fatal: the authenticated account still lives in sealed secrets/runtime.
  }

  clearCloudSecrets();
  process.env.ELIZAOS_CLOUD_API_KEY = args.apiKey;
  if (wasCloudEnabled) {
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
  }
  scrubCloudSecretsFromEnv();

  const runtime = args.state.runtime as RuntimeCloudLike | null;
  if (runtime && typeof runtime.updateAgent === "function") {
    try {
      const nextSecrets: CloudRuntimeSecrets = {
        ...(runtime.character.secrets ?? {}),
        ELIZAOS_CLOUD_API_KEY: args.apiKey,
      };
      if (wasCloudEnabled) {
        nextSecrets.ELIZAOS_CLOUD_ENABLED = "true";
      } else {
        delete nextSecrets.ELIZAOS_CLOUD_ENABLED;
      }
      runtime.character.secrets = nextSecrets;
      await runtime.updateAgent(runtime.agentId, {
        secrets: { ...nextSecrets },
      });
    } catch {
      // Non-fatal: config/sealed secret persistence is enough for login continuity.
    }
  }

  if (
    args.state.cloudManager &&
    !args.state.cloudManager.getClient() &&
    typeof args.state.cloudManager.init === "function"
  ) {
    await args.state.cloudManager.init();
  }
}

function toAutonomousState(state: CloudRouteState): AutonomousCloudRouteState {
  return {
    ...state,
    saveConfig: saveElizaConfig,
    createTelemetrySpan: createIntegrationTelemetrySpan,
  };
}

export async function handleCloudRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudRouteState,
): Promise<boolean> {
  if (method === "POST" && pathname === "/api/cloud/disconnect") {
    await disconnectUnifiedCloudConnection({
      cloudManager: state.cloudManager,
      config: state.config,
      runtime: state.runtime,
      saveConfig: saveElizaConfig,
    });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, status: "disconnected" }));
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/cloud/login/status")) {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      sendJsonError(res, "sessionId query parameter is required");
      return true;
    }

    const baseUrl = normalizeCloudSiteUrl(state.config.cloud?.baseUrl);
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      sendJsonError(res, urlError);
      return true;
    }

    let pollRes: Response;
    try {
      pollRes = await fetchCloudLoginStatus(sessionId, baseUrl);
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        sendJson(
          res,
          {
            status: "error",
            error: "Eliza Cloud status request timed out",
          },
          504,
        );
        return true;
      }

      sendJson(
        res,
        {
          status: "error",
          error: "Failed to reach Eliza Cloud",
        },
        502,
      );
      return true;
    }

    if (isRedirectResponse(pollRes)) {
      sendJson(
        res,
        {
          status: "error",
          error:
            "Eliza Cloud status request was redirected; redirects are not allowed",
        },
        502,
      );
      return true;
    }

    if (!pollRes.ok) {
      sendJson(
        res,
        pollRes.status === 404
          ? { status: "expired", error: "Session not found or expired" }
          : {
              status: "error",
              error: `Eliza Cloud returned HTTP ${pollRes.status}`,
            },
      );
      return true;
    }

    const data = (await pollRes.json()) as {
      apiKey?: unknown;
      keyPrefix?: unknown;
      status?: unknown;
    };

    if (data.status === "authenticated" && typeof data.apiKey === "string") {
      await persistCloudLoginStatus({
        apiKey: data.apiKey,
        state,
      });
      sendJson(res, {
        status: "authenticated",
        keyPrefix:
          typeof data.keyPrefix === "string" ? data.keyPrefix : undefined,
      });
      return true;
    }

    sendJson(res, {
      status: typeof data.status === "string" ? data.status : "error",
    });
    return true;
  }

  const result = await handleAutonomousCloudRoute(
    req,
    res,
    pathname,
    method,
    toAutonomousState(state),
  );

  // The upstream handler writes secrets to process.env — scrub them
  // immediately so they don't leak to child processes or env dumps.
  scrubCloudSecretsFromEnv();

  return result;
}
