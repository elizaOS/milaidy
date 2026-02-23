/**
 * Cloud API routes for Milady — handles /api/cloud/* endpoints.
 */

import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { CloudManager } from "../cloud/cloud-manager";
import { validateCloudBaseUrl } from "../cloud/validate-url";
import type { MiladyConfig } from "../config/config";
import { saveMiladyConfig } from "../config/config";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";
import {
  readJsonBody as parseJsonBody,
  sendJson,
  sendJsonError,
} from "./http-helpers";

export interface CloudRouteState {
  config: MiladyConfig;
  cloudManager: CloudManager | null;
  /** The running agent runtime — needed to persist cloud credentials to the DB. */
  runtime: AgentRuntime | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractAgentId(pathname: string): string | null {
  const id = pathname.split("/")[4];
  return id && UUID_RE.test(id) ? id : null;
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  return parseJsonBody(req, res, {
    maxBytes: 1_048_576,
    tooLargeMessage: "Request body too large",
    destroyOnTooLarge: true,
  });
}

const CLOUD_LOGIN_CREATE_TIMEOUT_MS = 10_000;
const CLOUD_LOGIN_POLL_TIMEOUT_MS = 10_000;

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const message = error.message.toLowerCase();
  return message.includes("timed out") || message.includes("timeout");
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return fetch(input, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Returns true if the request was handled, false if path didn't match.
 */
export async function handleCloudRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: CloudRouteState,
): Promise<boolean> {
  // POST /api/cloud/login
  if (method === "POST" && pathname === "/api/cloud/login") {
    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      sendJsonError(res, urlError);
      return true;
    }
    const sessionId = crypto.randomUUID();
    const loginCreateSpan = createIntegrationTelemetrySpan({
      boundary: "cloud",
      operation: "login_create_session",
      timeoutMs: CLOUD_LOGIN_CREATE_TIMEOUT_MS,
    });

    let createRes: Response;
    try {
      createRes = await fetchWithTimeout(
        `${baseUrl}/api/auth/cli-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        },
        CLOUD_LOGIN_CREATE_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        loginCreateSpan.failure({ error: fetchErr, statusCode: 504 });
        sendJsonError(res, "Eliza Cloud login request timed out", 504);
        return true;
      }
      loginCreateSpan.failure({ error: fetchErr, statusCode: 502 });
      sendJsonError(res, "Failed to reach Eliza Cloud", 502);
      return true;
    }

    if (isRedirectResponse(createRes)) {
      loginCreateSpan.failure({
        statusCode: createRes.status,
        errorKind: "redirect_response",
      });
      sendJsonError(
        res,
        "Eliza Cloud login request was redirected; redirects are not allowed",
        502,
      );
      return true;
    }

    if (!createRes.ok) {
      loginCreateSpan.failure({
        statusCode: createRes.status,
        errorKind: "http_error",
      });
      sendJsonError(res, "Failed to create auth session with Eliza Cloud", 502);
      return true;
    }

    loginCreateSpan.success({ statusCode: createRes.status });
    sendJson(res, {
      ok: true,
      sessionId,
      browserUrl: `${baseUrl}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
    });
    return true;
  }

  // GET /api/cloud/login/status?sessionId=...
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

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      sendJsonError(res, urlError);
      return true;
    }
    const loginPollSpan = createIntegrationTelemetrySpan({
      boundary: "cloud",
      operation: "login_poll_status",
      timeoutMs: CLOUD_LOGIN_POLL_TIMEOUT_MS,
    });
    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(
        `${baseUrl}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
        {},
        CLOUD_LOGIN_POLL_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        loginPollSpan.failure({ error: fetchErr, statusCode: 504 });
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
      loginPollSpan.failure({ error: fetchErr, statusCode: 502 });
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
      loginPollSpan.failure({
        statusCode: pollRes.status,
        errorKind: "redirect_response",
      });
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
      loginPollSpan.failure({
        statusCode: pollRes.status,
        errorKind: "http_error",
      });
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

    let data: {
      status: string;
      apiKey?: string;
      keyPrefix?: string;
    };
    try {
      data = (await pollRes.json()) as {
        status: string;
        apiKey?: string;
        keyPrefix?: string;
      };
    } catch (parseErr) {
      loginPollSpan.failure({ error: parseErr, statusCode: pollRes.status });
      throw parseErr;
    }
    loginPollSpan.success({ statusCode: pollRes.status });

    if (data.status === "authenticated" && data.apiKey) {
      // ── 1. Save to config file (on-disk persistence) ────────────────
      const cloud = (state.config.cloud ?? {}) as NonNullable<
        typeof state.config.cloud
      >;
      cloud.enabled = true;
      cloud.apiKey = data.apiKey;
      (state.config as Record<string, unknown>).cloud = cloud;
      try {
        saveMiladyConfig(state.config);
        logger.info("[cloud-login] API key saved to config file");
      } catch (saveErr) {
        logger.error(
          `[cloud-login] Failed to save config: ${saveErr instanceof Error ? saveErr.message : saveErr}`,
        );
      }

      // ── 2. Push into process.env (immediate, no restart needed) ─────
      process.env.ELIZAOS_CLOUD_API_KEY = data.apiKey;
      process.env.ELIZAOS_CLOUD_ENABLED = "true";

      // ── 3. Persist to agent DB record (survives config-file resets) ─
      if (state.runtime) {
        try {
          // Update in-memory character secrets
          if (!state.runtime.character.secrets) {
            state.runtime.character.secrets = {};
          }
          const secrets = state.runtime.character.secrets as Record<
            string,
            string
          >;
          secrets.ELIZAOS_CLOUD_API_KEY = data.apiKey;
          secrets.ELIZAOS_CLOUD_ENABLED = "true";

          // Write to database
          await state.runtime.updateAgent(state.runtime.agentId, {
            secrets: { ...secrets },
          });
          logger.info("[cloud-login] API key persisted to agent DB record");
        } catch (dbErr) {
          logger.warn(
            `[cloud-login] DB persistence failed (non-fatal): ${dbErr instanceof Error ? dbErr.message : dbErr}`,
          );
        }
      }

      // ── 4. Init cloud manager if needed ─────────────────────────────
      if (state.cloudManager && !state.cloudManager.getClient()) {
        await state.cloudManager.init();
      }

      sendJson(res, { status: "authenticated", keyPrefix: data.keyPrefix });
    } else {
      sendJson(res, { status: data.status });
    }
    return true;
  }

  // GET /api/cloud/agents
  if (method === "GET" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      sendJsonError(res, "Not connected to Eliza Cloud", 401);
      return true;
    }
    sendJson(res, { ok: true, agents: await client.listAgents() });
    return true;
  }

  // POST /api/cloud/agents
  if (method === "POST" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      sendJsonError(res, "Not connected to Eliza Cloud", 401);
      return true;
    }

    const body = await readJsonBody<{
      agentName?: string;
      agentConfig?: Record<string, unknown>;
      environmentVars?: Record<string, string>;
    }>(req, res);
    if (!body) return true;

    if (!body.agentName?.trim()) {
      sendJsonError(res, "agentName is required");
      return true;
    }

    const agent = await client.createAgent({
      agentName: body.agentName,
      agentConfig: body.agentConfig,
      environmentVars: body.environmentVars,
    });
    sendJson(res, { ok: true, agent }, 201);
    return true;
  }

  // POST /api/cloud/agents/:id/provision
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/provision")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      sendJsonError(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const proxy = await state.cloudManager.connect(agentId);
    sendJson(res, {
      ok: true,
      agentId,
      agentName: proxy.agentName,
      status: state.cloudManager.getStatus(),
    });
    return true;
  }

  // POST /api/cloud/agents/:id/shutdown
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/shutdown")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      sendJsonError(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const client = state.cloudManager.getClient();
    if (!client) {
      sendJsonError(res, "Not connected to Eliza Cloud", 401);
      return true;
    }
    if (state.cloudManager.getActiveAgentId() === agentId)
      await state.cloudManager.disconnect();
    await client.deleteAgent(agentId);
    sendJson(res, { ok: true, agentId, status: "stopped" });
    return true;
  }

  // POST /api/cloud/agents/:id/connect
  if (
    method === "POST" &&
    pathname.startsWith("/api/cloud/agents/") &&
    pathname.endsWith("/connect")
  ) {
    const agentId = extractAgentId(pathname);
    if (!agentId || !state.cloudManager) {
      sendJsonError(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    if (state.cloudManager.getActiveAgentId())
      await state.cloudManager.disconnect();
    const proxy = await state.cloudManager.connect(agentId);
    sendJson(res, {
      ok: true,
      agentId,
      agentName: proxy.agentName,
      status: state.cloudManager.getStatus(),
    });
    return true;
  }

  // POST /api/cloud/disconnect
  if (method === "POST" && pathname === "/api/cloud/disconnect") {
    if (state.cloudManager) await state.cloudManager.disconnect();
    const cloud = (state.config.cloud ?? {}) as NonNullable<
      typeof state.config.cloud
    >;
    cloud.enabled = false;
    delete cloud.apiKey;
    (state.config as Record<string, unknown>).cloud = cloud;

    try {
      saveMiladyConfig(state.config);
    } catch (saveErr) {
      logger.warn(
        `[cloud-login] Failed to save cloud disconnect state: ${saveErr instanceof Error ? saveErr.message : saveErr}`,
      );
    }

    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;

    if (state.runtime) {
      try {
        if (!state.runtime.character.secrets) {
          state.runtime.character.secrets = {};
        }
        const secrets = state.runtime.character.secrets as Record<
          string,
          string | number | boolean
        >;
        delete secrets.ELIZAOS_CLOUD_API_KEY;
        delete secrets.ELIZAOS_CLOUD_ENABLED;
        await state.runtime.updateAgent(state.runtime.agentId, {
          secrets: { ...secrets },
        });
      } catch (dbErr) {
        logger.warn(
          `[cloud-login] Failed to clear cloud secrets from agent DB: ${dbErr instanceof Error ? dbErr.message : dbErr}`,
        );
      }
    }

    sendJson(res, { ok: true, status: "disconnected" });
    return true;
  }

  // NOTE: GET /api/cloud/status is handled in server.ts (uses runtime
  // CLOUD_AUTH service to return { connected, userId, topUpUrl, ... }).
  // Do NOT add a handler here — it would shadow the correct one.

  return false;
}
