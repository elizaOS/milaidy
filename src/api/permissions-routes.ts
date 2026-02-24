import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { SystemPermissionId } from "../contracts/permissions";
import { PERMISSION_MAP, SYSTEM_PERMISSIONS } from "../permissions/registry";
import type { RouteRequestContext } from "./route-helpers";

export interface PermissionState {
  id: string;
  status: string;
  lastChecked: number;
  canRequest: boolean;
}

export interface PermissionRouteState {
  runtime: AgentRuntime | null;
  config: MiladyConfig;
  permissionStates?: Record<string, PermissionState>;
  shellEnabled?: boolean;
}

export interface PermissionRouteContext extends RouteRequestContext {
  state: PermissionRouteState;
  saveConfig: (config: MiladyConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
  emitPermissionTelemetry?: (event: PermissionTelemetryEvent) => void;
}

export type PermissionTelemetryAction =
  | "request"
  | "open-settings"
  | "shell-toggle";

export interface PermissionTelemetryEvent {
  type: "permissions_telemetry";
  source: "api";
  ts: number;
  action: PermissionTelemetryAction;
  permissionId: string;
  method: string;
  path: string;
  enabled?: boolean;
  previousEnabled?: boolean;
  restartScheduled?: boolean;
}

const PERMISSION_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function isValidPermissionId(id: string): boolean {
  return PERMISSION_ID_PATTERN.test(id);
}

function isKnownPermissionId(id: string): boolean {
  return PERMISSION_MAP.has(id as SystemPermissionId);
}

function normalizePermissionState(
  id: string,
  candidate: unknown,
): PermissionState | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const value = candidate as Partial<PermissionState>;
  return {
    id,
    status: typeof value.status === "string" ? value.status : "not-determined",
    lastChecked:
      typeof value.lastChecked === "number" &&
      Number.isFinite(value.lastChecked)
        ? value.lastChecked
        : Date.now(),
    canRequest: value.canRequest === true,
  };
}

function buildPermissionTelemetryEvent(
  method: string,
  path: string,
  action: PermissionTelemetryAction,
  permissionId: string,
  overrides: Partial<
    Pick<
      PermissionTelemetryEvent,
      "enabled" | "previousEnabled" | "restartScheduled"
    >
  > = {},
): PermissionTelemetryEvent {
  return {
    type: "permissions_telemetry",
    source: "api",
    ts: Date.now(),
    action,
    permissionId,
    method,
    path,
    ...overrides,
  };
}

export async function handlePermissionRoutes(
  ctx: PermissionRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    state,
    readJsonBody,
    json,
    error,
    saveConfig,
    scheduleRuntimeRestart,
    emitPermissionTelemetry,
  } = ctx;

  if (!pathname.startsWith("/api/permissions")) return false;

  // ── GET /api/permissions ───────────────────────────────────────────────
  // Returns all system permission states
  if (method === "GET" && pathname === "/api/permissions") {
    const permStates = state.permissionStates ?? {};
    json(res, {
      permissions: permStates,
      platform: process.platform,
      shellEnabled: state.shellEnabled ?? true,
    });
    return true;
  }

  // ── GET /api/permissions/definitions ───────────────────────────────────
  // Returns canonical permission metadata and platform applicability.
  if (method === "GET" && pathname === "/api/permissions/definitions") {
    const platform = process.platform;
    const permissions = SYSTEM_PERMISSIONS.map((definition) => ({
      ...definition,
      applicable: definition.platforms.includes(
        platform as "darwin" | "win32" | "linux",
      ),
    }));
    json(res, {
      platform,
      permissions,
    });
    return true;
  }

  // ── GET /api/permissions/shell ─────────────────────────────────────────
  // Return shell toggle status in a stable shape for UI clients.
  if (method === "GET" && pathname === "/api/permissions/shell") {
    const enabled = state.shellEnabled ?? true;
    if (!state.permissionStates) {
      state.permissionStates = {};
    }
    const shellState = state.permissionStates.shell;
    const permission: PermissionState = {
      id: "shell",
      status: enabled ? "granted" : "denied",
      lastChecked: shellState?.lastChecked ?? Date.now(),
      canRequest: false,
    };
    state.permissionStates.shell = permission;

    // Keep the legacy top-level permission fields for compatibility with
    // callers that previously treated /api/permissions/shell as a generic
    // /api/permissions/:id response.
    json(res, {
      enabled,
      ...permission,
      permission,
    });
    return true;
  }

  // ── GET /api/permissions/:id ───────────────────────────────────────────
  // Returns a single permission state
  if (method === "GET" && pathname.startsWith("/api/permissions/")) {
    const permId = pathname.slice("/api/permissions/".length);
    if (!isValidPermissionId(permId)) {
      error(res, "Invalid permission ID", 400);
      return true;
    }
    const permStates = state.permissionStates ?? {};
    const permState = permStates[permId];
    if (!permState) {
      json(res, {
        id: permId,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      });
      return true;
    }
    json(res, permState);
    return true;
  }

  // ── POST /api/permissions/refresh ──────────────────────────────────────
  // Force refresh all permission states (clears cache)
  if (method === "POST" && pathname === "/api/permissions/refresh") {
    // Signal to the client that they should refresh permissions via IPC
    // The actual permission checking happens in the Electron main process
    json(res, {
      message: "Permission refresh requested",
      action: "ipc:permissions:refresh",
    });
    return true;
  }

  // ── POST /api/permissions/:id/request ──────────────────────────────────
  // Request a specific permission (triggers system prompt or opens settings)
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/request$/)
  ) {
    const permId = pathname.split("/")[3];
    if (!isValidPermissionId(permId)) {
      error(res, "Invalid permission ID", 400);
      return true;
    }
    if (!isKnownPermissionId(permId)) {
      error(res, "Unknown permission ID", 400);
      return true;
    }
    const telemetry = buildPermissionTelemetryEvent(
      method,
      pathname,
      "request",
      permId,
    );
    emitPermissionTelemetry?.(telemetry);
    json(res, {
      message: `Permission request for ${permId}`,
      action: `ipc:permissions:request:${permId}`,
      telemetry,
    });
    return true;
  }

  // ── POST /api/permissions/:id/open-settings ────────────────────────────
  // Open system settings for a specific permission
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/open-settings$/)
  ) {
    const permId = pathname.split("/")[3];
    if (!isValidPermissionId(permId)) {
      error(res, "Invalid permission ID", 400);
      return true;
    }
    if (!isKnownPermissionId(permId)) {
      error(res, "Unknown permission ID", 400);
      return true;
    }
    const telemetry = buildPermissionTelemetryEvent(
      method,
      pathname,
      "open-settings",
      permId,
    );
    emitPermissionTelemetry?.(telemetry);
    json(res, {
      message: `Opening settings for ${permId}`,
      action: `ipc:permissions:openSettings:${permId}`,
      telemetry,
    });
    return true;
  }

  // ── PUT /api/permissions/shell ─────────────────────────────────────────
  // Toggle shell access enabled/disabled
  if (method === "PUT" && pathname === "/api/permissions/shell") {
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return true;
    const previousEnabled = state.shellEnabled ?? true;
    const enabled = body.enabled === true;
    state.shellEnabled = enabled;

    // Update permission state
    if (!state.permissionStates) {
      state.permissionStates = {};
    }
    state.permissionStates.shell = {
      id: "shell",
      status: enabled ? "granted" : "denied",
      lastChecked: Date.now(),
      canRequest: false,
    };

    // Save to config
    if (!state.config.features) {
      state.config.features = {};
    }
    state.config.features.shellEnabled = enabled;
    saveConfig(state.config);

    // If a runtime is active, restart so plugin loading honors the new
    // shellEnabled flag and shell tools are loaded/unloaded consistently.
    const restartScheduled = Boolean(state.runtime);
    if (restartScheduled) {
      scheduleRuntimeRestart(
        `Shell access ${enabled ? "enabled" : "disabled"}`,
      );
    }

    const telemetry = buildPermissionTelemetryEvent(
      method,
      pathname,
      "shell-toggle",
      "shell",
      {
        enabled,
        previousEnabled,
        restartScheduled,
      },
    );
    emitPermissionTelemetry?.(telemetry);

    json(res, {
      shellEnabled: enabled,
      permission: state.permissionStates.shell,
      telemetry,
    });
    return true;
  }

  // ── PUT /api/permissions/state ─────────────────────────────────────────
  // Update permission states from Electron (called by renderer after IPC)
  if (method === "PUT" && pathname === "/api/permissions/state") {
    const body = await readJsonBody<{
      permissions?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;
    if (body.permissions && typeof body.permissions === "object") {
      const normalized: Record<string, PermissionState> = {};
      for (const [permissionId, candidate] of Object.entries(
        body.permissions,
      )) {
        if (!isValidPermissionId(permissionId)) continue;
        const nextState = normalizePermissionState(permissionId, candidate);
        if (!nextState) continue;
        normalized[permissionId] = nextState;
      }
      state.permissionStates = normalized;
    }
    json(res, { updated: true, permissions: state.permissionStates });
    return true;
  }

  return false;
}
