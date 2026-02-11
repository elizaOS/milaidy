/**
 * Permission Manager for Electron
 *
 * Provides a unified interface for checking and requesting system permissions
 * across macOS, Windows, and Linux. Manages permission state caching and
 * exposes IPC handlers for the renderer process.
 */

import { ipcMain, BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type {
  SystemPermissionId,
  PermissionState,
  AllPermissionsState,
  PermissionCheckResult,
} from "../../../../../src/permissions/types.js";
import { SYSTEM_PERMISSIONS, isPermissionApplicable } from "../../../../../src/permissions/registry.js";
import * as darwin from "./permissions-darwin.js";
import * as win32 from "./permissions-win32.js";
import * as linux from "./permissions-linux.js";

const platform = process.platform as "darwin" | "win32" | "linux";

/** Default cache timeout: 30 seconds */
const DEFAULT_CACHE_TIMEOUT_MS = 30000;

/**
 * Permission Manager class
 *
 * Handles permission checking, requesting, and caching with platform-specific
 * implementations for macOS, Windows, and Linux.
 */
export class PermissionManager {
  private mainWindow: BrowserWindow | null = null;
  private cache: Map<SystemPermissionId, PermissionState> = new Map();
  private cacheTimeoutMs: number = DEFAULT_CACHE_TIMEOUT_MS;
  private shellEnabled: boolean = true;

  /**
   * Set the main window reference for sending events.
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Set the cache timeout in milliseconds.
   */
  setCacheTimeout(ms: number): void {
    this.cacheTimeoutMs = ms;
  }

  /**
   * Enable or disable shell access.
   * This is a soft toggle - the actual permission is always granted,
   * but we can disable the feature in the UI.
   */
  setShellEnabled(enabled: boolean): void {
    this.shellEnabled = enabled;
    // Clear cache entry to reflect new state
    this.cache.delete("shell");
    // Notify renderer of change
    this.notifyPermissionChange("shell");
  }

  /**
   * Get whether shell access is enabled.
   */
  isShellEnabled(): boolean {
    return this.shellEnabled;
  }

  /**
   * Check if a cached permission is still valid.
   */
  private isCacheValid(id: SystemPermissionId): boolean {
    const cached = this.cache.get(id);
    if (!cached) return false;
    return Date.now() - cached.lastChecked < this.cacheTimeoutMs;
  }

  /**
   * Get a permission from cache, or null if not cached/expired.
   */
  private getFromCache(id: SystemPermissionId): PermissionState | null {
    if (!this.isCacheValid(id)) return null;
    return this.cache.get(id) || null;
  }

  /**
   * Store a permission state in cache.
   */
  private setCache(id: SystemPermissionId, state: PermissionState): void {
    this.cache.set(id, state);
  }

  /**
   * Clear the entire permission cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Notify the renderer process of a permission change.
   */
  private notifyPermissionChange(id: SystemPermissionId): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("permissions:changed", { id });
    }
  }

  /**
   * Check a single permission, using cache if available.
   */
  async checkPermission(id: SystemPermissionId, forceRefresh = false): Promise<PermissionState> {
    // Check if permission is applicable to this platform
    if (!isPermissionApplicable(id, platform)) {
      const state: PermissionState = {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }

    // Check shell toggle
    if (id === "shell" && !this.shellEnabled) {
      const state: PermissionState = {
        id,
        status: "denied",
        lastChecked: Date.now(),
        canRequest: false,
      };
      this.setCache(id, state);
      return state;
    }

    // Return cached value if valid and not forcing refresh
    if (!forceRefresh) {
      const cached = this.getFromCache(id);
      if (cached) return cached;
    }

    // Perform platform-specific check
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

    this.setCache(id, state);
    return state;
  }

  /**
   * Check all permissions at once.
   */
  async checkAllPermissions(forceRefresh = false): Promise<AllPermissionsState> {
    const results = await Promise.all(
      SYSTEM_PERMISSIONS.map((p) => this.checkPermission(p.id, forceRefresh)),
    );

    return results.reduce(
      (acc, state) => {
        acc[state.id] = state;
        return acc;
      },
      {} as AllPermissionsState,
    );
  }

  /**
   * Request a specific permission.
   */
  async requestPermission(id: SystemPermissionId): Promise<PermissionState> {
    // Check if permission is applicable
    if (!isPermissionApplicable(id, platform)) {
      return {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      };
    }

    // Perform platform-specific request
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

    this.setCache(id, state);
    this.notifyPermissionChange(id);
    return state;
  }

  /**
   * Open system settings for a specific permission.
   */
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

  /**
   * Check if all required permissions for a feature are granted.
   */
  async checkFeaturePermissions(
    featureId: string,
  ): Promise<{ granted: boolean; missing: SystemPermissionId[] }> {
    const requiredPerms = SYSTEM_PERMISSIONS.filter((p) =>
      p.requiredForFeatures.includes(featureId),
    ).map((p) => p.id);

    const states = await Promise.all(requiredPerms.map((id) => this.checkPermission(id)));

    const missing = states
      .filter((s) => s.status !== "granted" && s.status !== "not-applicable")
      .map((s) => s.id);

    return {
      granted: missing.length === 0,
      missing,
    };
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.cache.clear();
    this.mainWindow = null;
  }
}

// Singleton instance
let permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManager) {
    permissionManager = new PermissionManager();
  }
  return permissionManager;
}

/**
 * Register all Permission IPC handlers.
 * Call this once during app initialization.
 */
export function registerPermissionsIPC(): void {
  const manager = getPermissionManager();

  // Get all permissions
  ipcMain.handle("permissions:getAll", async (_e: IpcMainInvokeEvent, forceRefresh?: boolean) => {
    return manager.checkAllPermissions(forceRefresh ?? false);
  });

  // Check a single permission
  ipcMain.handle(
    "permissions:check",
    async (_e: IpcMainInvokeEvent, id: SystemPermissionId, forceRefresh?: boolean) => {
      return manager.checkPermission(id, forceRefresh ?? false);
    },
  );

  // Request a permission
  ipcMain.handle("permissions:request", async (_e: IpcMainInvokeEvent, id: SystemPermissionId) => {
    return manager.requestPermission(id);
  });

  // Open settings for a permission
  ipcMain.handle(
    "permissions:openSettings",
    async (_e: IpcMainInvokeEvent, id: SystemPermissionId) => {
      await manager.openSettings(id);
    },
  );

  // Check feature permissions
  ipcMain.handle(
    "permissions:checkFeature",
    async (_e: IpcMainInvokeEvent, featureId: string) => {
      return manager.checkFeaturePermissions(featureId);
    },
  );

  // Toggle shell access
  ipcMain.handle("permissions:setShellEnabled", async (_e: IpcMainInvokeEvent, enabled: boolean) => {
    manager.setShellEnabled(enabled);
    return manager.checkPermission("shell", true);
  });

  // Get shell enabled status
  ipcMain.handle("permissions:isShellEnabled", async () => {
    return manager.isShellEnabled();
  });

  // Clear cache
  ipcMain.handle("permissions:clearCache", async () => {
    manager.clearCache();
  });

  // Get platform info
  ipcMain.handle("permissions:getPlatform", async () => {
    return platform;
  });
}
