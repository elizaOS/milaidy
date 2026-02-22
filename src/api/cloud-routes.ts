/**
 * Cloud API routes for Milaidy — handles /api/cloud/* endpoints.
 */

import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { CloudManager } from "../cloud/cloud-manager.js";
import { validateCloudBaseUrl } from "../cloud/validate-url.js";
import type { MilaidyConfig } from "../config/config.js";
import { saveMilaidyConfig } from "../config/config.js";

export interface CloudRouteState {
  config: MilaidyConfig;
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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 1_048_576) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (readErr) {
    const msg =
      readErr instanceof Error
        ? readErr.message
        : "Failed to read request body";
    err(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      err(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    err(res, "Invalid JSON in request body", 400);
    return null;
  }
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

/**
 * Standardized error response with logging.
 * Logs the error and sends a consistent JSON error response.
 */
function err(
  res: http.ServerResponse,
  message: string,
  status = 400,
  context?: Record<string, unknown>,
): void {
  const errorResponse = { error: message };
  logger.error("[cloud-routes]", {
    error: message,
    status,
    ...context,
  });
  json(res, errorResponse, status);
}

const CLOUD_LOGIN_CREATE_TIMEOUT_MS = 10_000;
const CLOUD_LOGIN_POLL_TIMEOUT_MS = 10_000;

/**
 * Cloud container port - configurable via environment variable.
 * Default: 2187 (standard Eliza Cloud container port)
 */
const CONTAINER_API_PORT =
  process.env.CONTAINER_API_PORT ?? "2187";

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
      err(res, urlError, 400, {
        endpoint: "/api/cloud/login",
        baseUrl,
      });
      return true;
    }
    const sessionId = crypto.randomUUID();

    logger.info("[cloud-login] Initiating cloud login session", {
      sessionId,
      baseUrl,
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
        err(res, "Eliza Cloud login request timed out", 504, {
          endpoint: "/api/cloud/login",
          sessionId,
          timeout: CLOUD_LOGIN_CREATE_TIMEOUT_MS,
        });
        return true;
      }
      const message =
        fetchErr instanceof Error ? fetchErr.message : "Unknown error";
      err(res, "Failed to reach Eliza Cloud", 502, {
        endpoint: "/api/cloud/login",
        sessionId,
        error: message,
      });
      return true;
    }

    if (!createRes.ok) {
      err(res, "Failed to create auth session with Eliza Cloud", 502, {
        endpoint: "/api/cloud/login",
        sessionId,
        cloudStatus: createRes.status,
      });
      return true;
    }

    logger.info("[cloud-login] Login session created", { sessionId });

    json(res, {
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
      err(res, "sessionId query parameter is required");
      return true;
    }

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      err(res, urlError);
      return true;
    }
    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(
        `${baseUrl}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
        {},
        CLOUD_LOGIN_POLL_TIMEOUT_MS,
      );
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        json(
          res,
          {
            status: "error",
            error: "Eliza Cloud status request timed out",
          },
          504,
        );
        return true;
      }
      json(
        res,
        {
          status: "error",
          error: "Failed to reach Eliza Cloud",
        },
        502,
      );
      return true;
    }

    if (!pollRes.ok) {
      json(
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
      status: string;
      apiKey?: string;
      keyPrefix?: string;
    };

    if (data.status === "authenticated" && data.apiKey) {
      // ── 1. Save to config file (on-disk persistence) ────────────────
      const cloud = (state.config.cloud ?? {}) as NonNullable<
        typeof state.config.cloud
      >;
      cloud.enabled = true;
      cloud.apiKey = data.apiKey;
      (state.config as Record<string, unknown>).cloud = cloud;
      try {
        saveMilaidyConfig(state.config);
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

      json(res, { status: "authenticated", keyPrefix: data.keyPrefix });
    } else {
      json(res, { status: data.status });
    }
    return true;
  }

  // GET /api/cloud/agents
  if (method === "GET" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      err(res, "Not connected to Eliza Cloud", 401);
      return true;
    }
    json(res, { ok: true, agents: await client.listAgents() });
    return true;
  }

  // POST /api/cloud/agents
  if (method === "POST" && pathname === "/api/cloud/agents") {
    const client = state.cloudManager?.getClient();
    if (!client) {
      err(res, "Not connected to Eliza Cloud", 401);
      return true;
    }

    const body = await readJsonBody<{
      agentName?: string;
      agentConfig?: Record<string, unknown>;
      environmentVars?: Record<string, string>;
    }>(req, res);
    if (!body) return true;

    if (!body.agentName?.trim()) {
      err(res, "agentName is required");
      return true;
    }

    // SECURITY FIX: Sanitize agent name to prevent XSS
    const sanitizedAgentName = sanitizeAgentName(body.agentName);
    if (!sanitizedAgentName) {
      err(res, "Invalid agent name");
      return true;
    }

    const agent = await client.createAgent({
      agentName: sanitizedAgentName,
      agentConfig: body.agentConfig,
      environmentVars: body.environmentVars,
    });
    json(res, { ok: true, agent }, 201);
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
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const proxy = await state.cloudManager.connect(agentId);
    json(res, {
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
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    const client = state.cloudManager.getClient();
    if (!client) {
      err(res, "Not connected to Eliza Cloud", 401);
      return true;
    }
    if (state.cloudManager.getActiveAgentId() === agentId)
      await state.cloudManager.disconnect();
    await client.deleteAgent(agentId);
    json(res, { ok: true, agentId, status: "stopped" });
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
      err(res, "Invalid agent ID or cloud not connected", 400);
      return true;
    }
    if (state.cloudManager.getActiveAgentId())
      await state.cloudManager.disconnect();
    const proxy = await state.cloudManager.connect(agentId);
    json(res, {
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
    json(res, { ok: true, status: "disconnected" });
    return true;
  }

  // POST /api/cloud/elizacloud/device-auth
  if (method === "POST" && pathname === "/api/cloud/elizacloud/device-auth") {
    const body = await readJsonBody<{ deviceId?: string }>(req, res);
    if (!body) return true;

    if (!body.deviceId?.trim()) {
      err(res, "deviceId is required", 400, {
        endpoint: "/api/cloud/elizacloud/device-auth",
      });
      return true;
    }

    // SECURITY FIX: Sanitize deviceId to prevent injection attacks
    const sanitizedDeviceId = sanitizeText(body.deviceId, 200);
    if (!sanitizedDeviceId) {
      err(res, "Invalid device ID", 400, {
        endpoint: "/api/cloud/elizacloud/device-auth",
      });
      return true;
    }

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      err(res, urlError, 400, {
        endpoint: "/api/cloud/elizacloud/device-auth",
        baseUrl,
      });
      return true;
    }

    logger.info("[cloud-device-auth] Initiating device authentication", {
      deviceId: sanitizedDeviceId.slice(0, 20) + "...", // Log only prefix for security
      baseUrl,
    });

    try {
      const authRes = await fetchWithTimeout(
        `${baseUrl}/api/v1/device-auth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: sanitizedDeviceId }),
        },
        10_000,
      );

      if (!authRes.ok) {
        const errData = await authRes.json().catch(() => ({}));
        const errorMsg =
          (errData as { error?: string }).error ||
          `Device auth failed (${authRes.status})`;
        err(res, errorMsg, authRes.status, {
          endpoint: "/api/cloud/elizacloud/device-auth",
          deviceId: body.deviceId,
          cloudStatus: authRes.status,
        });
        return true;
      }

      const authData = (await authRes.json()) as {
        userId: string;
        organizationId: string;
        apiKey: string;
        credits: number;
      };

      logger.info("[cloud-device-auth] Device authentication successful", {
        userId: authData.userId,
        organizationId: authData.organizationId,
        credits: authData.credits,
      });

      json(res, authData);
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        err(res, "Device auth request timed out", 504, {
          endpoint: "/api/cloud/elizacloud/device-auth",
          deviceId: body.deviceId,
          timeout: 10_000,
        });
        return true;
      }
      const message =
        fetchErr instanceof Error ? fetchErr.message : "Unknown error";
      err(res, "Failed to reach Eliza Cloud for device auth", 502, {
        endpoint: "/api/cloud/elizacloud/device-auth",
        deviceId: body.deviceId,
        error: message,
      });
      return true;
    }
    return true;
  }

  // POST /api/cloud/elizacloud/agents
  if (method === "POST" && pathname === "/api/cloud/elizacloud/agents") {
    const body = await readJsonBody<{
      agentName?: string;
      agentConfig?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;

    const elizaAuth = req.headers["x-eliza-auth"];
    if (!elizaAuth || typeof elizaAuth !== "string") {
      err(res, "Missing elizacloud API key", 401, {
        endpoint: "/api/cloud/elizacloud/agents",
      });
      return true;
    }

    // SECURITY FIX: Sanitize agent name to prevent XSS
    if (body.agentName) {
      const sanitizedAgentName = sanitizeAgentName(body.agentName);
      if (!sanitizedAgentName) {
        err(res, "Invalid agent name", 400, {
          endpoint: "/api/cloud/elizacloud/agents",
        });
        return true;
      }
      body.agentName = sanitizedAgentName;
    }

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      err(res, urlError, 400, {
        endpoint: "/api/cloud/elizacloud/agents",
        baseUrl,
      });
      return true;
    }

    logger.info("[cloud-agent-create] Creating cloud agent", {
      agentName: body.agentName,
      hasConfig: !!body.agentConfig,
      baseUrl,
    });

    try {
      const createRes = await fetchWithTimeout(
        `${baseUrl}/api/v1/agents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${elizaAuth}`,
          },
          body: JSON.stringify(body),
        },
        30_000,
      );

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        const errorMsg =
          (errData as { message?: string }).message ||
          `Agent creation failed (${createRes.status})`;
        err(res, errorMsg, createRes.status, {
          endpoint: "/api/cloud/elizacloud/agents",
          agentName: body.agentName,
          cloudStatus: createRes.status,
        });
        return true;
      }

      const agentData = await createRes.json();
      logger.info("[cloud-agent-create] Cloud agent created successfully", {
        agentName: body.agentName,
        agentId: (agentData as { id?: string }).id,
      });
      json(res, agentData);
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        err(res, "Agent creation request timed out", 504, {
          endpoint: "/api/cloud/elizacloud/agents",
          agentName: body.agentName,
          timeout: 30_000,
        });
        return true;
      }
      const message =
        fetchErr instanceof Error ? fetchErr.message : "Unknown error";
      err(res, "Failed to reach Eliza Cloud", 502, {
        endpoint: "/api/cloud/elizacloud/agents",
        agentName: body.agentName,
        error: message,
      });
      return true;
    }
    return true;
  }

  // GET /api/cloud/elizacloud/agents/:agentId
  if (method === "GET" && pathname.startsWith("/api/cloud/elizacloud/agents/")) {
    const agentId = pathname.split("/").pop();
    if (!agentId) {
      err(res, "Agent ID is required");
      return true;
    }

    const elizaAuth = req.headers["x-eliza-auth"];
    if (!elizaAuth || typeof elizaAuth !== "string") {
      err(res, "Missing elizacloud API key", 401);
      return true;
    }

    const baseUrl = state.config.cloud?.baseUrl ?? "https://www.elizacloud.ai";
    const urlError = await validateCloudBaseUrl(baseUrl);
    if (urlError) {
      err(res, urlError);
      return true;
    }

    try {
      const statusRes = await fetchWithTimeout(
        `${baseUrl}/api/v1/agents/${encodeURIComponent(agentId)}`,
        {
          headers: { Authorization: `Bearer ${elizaAuth}` },
        },
        10_000,
      );

      if (!statusRes.ok) {
        const errData = await statusRes.json().catch(() => ({}));
        err(
          res,
          (errData as { message?: string }).message ||
            `Agent status check failed (${statusRes.status})`,
          statusRes.status,
        );
        return true;
      }

      const agentData = await statusRes.json();
      json(res, agentData);
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        err(res, "Agent status request timed out", 504);
        return true;
      }
      err(res, "Failed to reach Eliza Cloud", 502);
      return true;
    }
    return true;
  }

  // POST /api/cloud/discord/connect
  if (method === "POST" && pathname === "/api/cloud/discord/connect") {
    const body = await readJsonBody<{
      code?: string;
      containerIp?: string;
      agentId?: string;
      redirectUri?: string;
    }>(req, res);
    if (!body) return true;

    if (!body.code?.trim()) {
      err(res, "Discord OAuth code is required", 400, {
        endpoint: "/api/cloud/discord/connect",
      });
      return true;
    }
    if (!body.containerIp?.trim()) {
      err(res, "Container IP is required", 400, {
        endpoint: "/api/cloud/discord/connect",
      });
      return true;
    }
    if (!body.redirectUri?.trim()) {
      err(res, "Redirect URI is required", 400, {
        endpoint: "/api/cloud/discord/connect",
      });
      return true;
    }

    logger.info("[cloud-discord] Initiating Discord OAuth connection", {
      agentId: body.agentId,
      containerIp: body.containerIp,
      redirectUri: body.redirectUri,
    });

    try {
      // Proxy Discord OAuth to the cloud container
      // NOTE: Using direct container API instead of elizacloud API because:
      // - Discord OAuth flow requires direct agent container access
      // - elizacloud API doesn't expose Discord-specific endpoints
      // - Container runs agent runtime with Discord client setup
      const containerUrl = `http://${body.containerIp}:${CONTAINER_API_PORT}/api/discord/connect`;
      
      logger.debug("[cloud-discord] Forwarding OAuth to container", {
        containerUrl,
        port: CONTAINER_API_PORT,
      });

      const connectRes = await fetchWithTimeout(
        containerUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: body.code,
            redirect_uri: body.redirectUri,
          }),
        },
        30_000, // 30s timeout for Discord verification
      );

      if (!connectRes.ok) {
        const errData = await connectRes.json().catch(() => ({}));
        const errorMsg =
          (errData as { error?: string }).error ||
          `Discord connection failed (${connectRes.status})`;
        err(res, errorMsg, connectRes.status, {
          endpoint: "/api/cloud/discord/connect",
          agentId: body.agentId,
          containerStatus: connectRes.status,
        });
        return true;
      }

      const connectData = await connectRes.json();
      logger.info("[cloud-discord] Discord OAuth successful", {
        agentId: body.agentId,
      });
      json(res, connectData);
    } catch (fetchErr) {
      if (isTimeoutError(fetchErr)) {
        err(res, "Discord connection request timed out", 504, {
          endpoint: "/api/cloud/discord/connect",
          agentId: body.agentId,
          timeout: 30_000,
        });
        return true;
      }
      const message =
        fetchErr instanceof Error
          ? fetchErr.message
          : "Failed to connect to container";
      err(res, `Container connection error: ${message}`, 502, {
        endpoint: "/api/cloud/discord/connect",
        agentId: body.agentId,
        containerIp: body.containerIp,
        port: CONTAINER_API_PORT,
      });
      return true;
    }
    return true;
  }

  // NOTE: GET /api/cloud/status is handled in server.ts (uses runtime
  // CLOUD_AUTH service to return { connected, userId, topUpUrl, ... }).
  // Do NOT add a handler here — it would shadow the correct one.

  return false;
}
