import type { AgentRuntime } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
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
  } = ctx;

  if (!pathname.startsWith("/api/permissions")) return false;

  // ── GET /api/permissions ───────────────────────────────────────────────
  // Returns all system permission states (AllPermissionsState shape)
  if (method === "GET" && pathname === "/api/permissions") {
    const permStates = state.permissionStates ?? {};
    // Return permission states at root level to match AllPermissionsState contract
    json(res, {
      ...permStates,
      // Also include metadata for convenience
      _platform: process.platform,
      _shellEnabled: state.shellEnabled ?? true,
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
    if (!permId || permId.includes("/")) {
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
    json(res, {
      message: `Permission request for ${permId}`,
      action: `ipc:permissions:request:${permId}`,
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
    json(res, {
      message: `Opening settings for ${permId}`,
      action: `ipc:permissions:openSettings:${permId}`,
    });
    return true;
  }

  // ── PUT /api/permissions/shell ─────────────────────────────────────────
  // Toggle shell access enabled/disabled
  if (method === "PUT" && pathname === "/api/permissions/shell") {
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return true;
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
    if (state.runtime) {
      scheduleRuntimeRestart(
        `Shell access ${enabled ? "enabled" : "disabled"}`,
      );
    }

    json(res, {
      shellEnabled: enabled,
      permission: state.permissionStates.shell,
    });
    return true;
  }

  // ── PUT /api/permissions/state ─────────────────────────────────────────
  // Update permission states from Electron (called by renderer after IPC)
  if (method === "PUT" && pathname === "/api/permissions/state") {
    const body = await readJsonBody<{
      permissions?: Record<string, PermissionState>;
    }>(req, res);
    if (!body) return true;

    if (body.permissions && typeof body.permissions === "object") {
      state.permissionStates = body.permissions;

      // Auto-enable capabilities if their permissions are met and they aren't explicitly configured.
      let configChanged = false;
      state.config.plugins = state.config.plugins || {};
      state.config.plugins.entries = state.config.plugins.entries || {};

      const capabilities = [
        { id: "browser", required: ["accessibility"] },
        { id: "computeruse", required: ["accessibility", "screen-recording"] },
        { id: "vision", required: ["screen-recording"] },
        { id: "coding-agent", required: [] },
      ];

      for (const cap of capabilities) {
        // If the user hasn't explicitly set enabled true/false in config:
        if (state.config.plugins.entries[cap.id]?.enabled === undefined) {
          // Check if all required permissions are granted (or not-applicable)
          const allGranted = cap.required.every((permId) => {
            const pStatus = state.permissionStates?.[permId]?.status;
            return pStatus === "granted" || pStatus === "not-applicable";
          });

          if (allGranted) {
            state.config.plugins.entries[cap.id] = {
              ...(state.config.plugins.entries[cap.id] || {}),
              enabled: true,
            };
            configChanged = true;
          }
        }
      }

      if (configChanged) {
        saveConfig(state.config);
        if (state.runtime) {
          scheduleRuntimeRestart("Auto-enabled newly permitted capabilities");
        }
      }
    }

    json(res, { updated: true, permissions: state.permissionStates });
    return true;
  }

  return false;
}
