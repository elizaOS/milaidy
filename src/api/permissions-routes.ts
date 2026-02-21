import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentRuntime } from "@elizaos/core";
import type { SystemPermissionId } from "../contracts/permissions";
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

const execFileAsync = promisify(execFile);

const SYSTEM_PERMISSION_IDS: ReadonlySet<SystemPermissionId> = new Set([
  "accessibility",
  "screen-recording",
  "microphone",
  "camera",
  "shell",
]);

const DARWIN_PRIVACY_PANE_URLS: Record<SystemPermissionId, string> = {
  accessibility:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  "screen-recording":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  microphone:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  camera:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  shell:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
};

function isSystemPermissionId(value: string): value is SystemPermissionId {
  return SYSTEM_PERMISSION_IDS.has(value as SystemPermissionId);
}

async function openPermissionSettingsOnHost(
  permissionId: SystemPermissionId,
): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const paneUrl = DARWIN_PRIVACY_PANE_URLS[permissionId];
  if (!paneUrl) return false;

  try {
    await execFileAsync("open", [paneUrl]);
    return true;
  } catch {
    return false;
  }
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
    if (!isSystemPermissionId(permId)) {
      error(res, "Invalid permission ID", 400);
      return true;
    }
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
    if (!isSystemPermissionId(permId)) {
      error(res, "Invalid permission ID", 400);
      return true;
    }

    const openedOnHost = await openPermissionSettingsOnHost(permId);
    if (openedOnHost) {
      json(res, {
        message: `Opening settings for ${permId}`,
        opened: true,
      });
      return true;
    }

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
    }
    json(res, { updated: true, permissions: state.permissionStates });
    return true;
  }

  return false;
}
