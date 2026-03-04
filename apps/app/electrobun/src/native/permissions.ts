/**
 * Permission Manager for Electrobun
 *
 * Unified permission checking across macOS, Windows, and Linux.
 * Port from Electron — same logic, no Electron-specific APIs used.
 */

import * as darwin from "./permissions-darwin";
import * as linux from "./permissions-linux";
import type {
  AllPermissionsState,
  PermissionCheckResult,
  PermissionState,
  SystemPermissionId,
} from "./permissions-shared";
import {
  isPermissionApplicable,
  SYSTEM_PERMISSIONS,
} from "./permissions-shared";
import * as win32 from "./permissions-win32";

type SendToWebview = (message: string, payload?: unknown) => void;

const platform = process.platform as "darwin" | "win32" | "linux";
const DEFAULT_CACHE_TIMEOUT_MS = 30000;

export class PermissionManager {
  private sendToWebview: SendToWebview | null = null;
  private cache: Map<SystemPermissionId, PermissionState> = new Map();
  private cacheTimeoutMs = DEFAULT_CACHE_TIMEOUT_MS;
  private shellEnabled = true;

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  setShellEnabled(enabled: boolean): void {
    this.shellEnabled = enabled;
    this.cache.delete("shell");
    this.sendToWebview?.("permissionsChanged", { id: "shell" });
  }

  isShellEnabled(): boolean {
    return this.shellEnabled;
  }

  private getFromCache(id: SystemPermissionId): PermissionState | null {
    const cached = this.cache.get(id);
    if (!cached) return null;
    if (Date.now() - cached.lastChecked >= this.cacheTimeoutMs) return null;
    return cached;
  }

  clearCache(): void {
    this.cache.clear();
  }

  async checkPermission(
    id: SystemPermissionId,
    forceRefresh = false,
  ): Promise<PermissionState> {
    if (!isPermissionApplicable(id, platform)) {
      const state: PermissionState = {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.cache.set(id, state);
      return state;
    }

    if (id === "shell" && !this.shellEnabled) {
      const state: PermissionState = {
        id,
        status: "denied",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.cache.set(id, state);
      return state;
    }

    if (!forceRefresh) {
      const cached = this.getFromCache(id);
      if (cached) return cached;
    }

    let result: PermissionCheckResult;
    switch (platform) {
      case "darwin":
        result = await darwin.checkPermission(id);
        break;
      case "win32":
        result = await win32.checkPermission(id);
        break;
      case "linux":
        result = await linux.checkPermission(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }

    const state: PermissionState = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.cache.set(id, state);
    return state;
  }

  async checkAllPermissions(
    forceRefresh = false,
  ): Promise<AllPermissionsState> {
    const results = await Promise.all(
      SYSTEM_PERMISSIONS.map((p) => this.checkPermission(p.id, forceRefresh)),
    );
    return results.reduce((acc, state) => {
      acc[state.id] = state;
      return acc;
    }, {} as AllPermissionsState);
  }

  async requestPermission(id: SystemPermissionId): Promise<PermissionState> {
    if (!isPermissionApplicable(id, platform)) {
      return {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
    }

    let result: PermissionCheckResult;
    switch (platform) {
      case "darwin":
        result = await darwin.requestPermission(id);
        break;
      case "win32":
        result = await win32.requestPermission(id);
        break;
      case "linux":
        result = await linux.requestPermission(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }

    const state: PermissionState = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest,
    };
    this.cache.set(id, state);
    this.sendToWebview?.("permissionsChanged", { id });
    return state;
  }

  async openSettings(id: SystemPermissionId): Promise<void> {
    switch (platform) {
      case "darwin":
        await darwin.openPrivacySettings(id);
        break;
      case "win32":
        await win32.openPrivacySettings(id);
        break;
      case "linux":
        await linux.openPrivacySettings(id);
        break;
    }
  }

  async checkFeaturePermissions(
    featureId: string,
  ): Promise<{ granted: boolean; missing: SystemPermissionId[] }> {
    const requiredPerms = SYSTEM_PERMISSIONS.filter((p) =>
      p.requiredForFeatures.includes(featureId),
    ).map((p) => p.id);

    const states = await Promise.all(
      requiredPerms.map((id) => this.checkPermission(id)),
    );

    const missing = states
      .filter((s) => s.status !== "granted" && s.status !== "not-applicable")
      .map((s) => s.id);

    return { granted: missing.length === 0, missing };
  }

  dispose(): void {
    this.cache.clear();
    this.sendToWebview = null;
  }
}

let permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManager) {
    permissionManager = new PermissionManager();
  }
  return permissionManager;
}
