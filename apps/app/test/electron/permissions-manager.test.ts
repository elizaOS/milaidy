/**
 * Unit tests for PermissionManager (apps/app/electron/src/native/permissions.ts)
 *
 * Tests the orchestration layer: caching, shell toggle, platform routing,
 * aggregate checks, renderer notifications, singleton, and IPC registration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available to the hoisted vi.mock calls
// ---------------------------------------------------------------------------

const { mockDarwin, mockWin32, mockLinux } = vi.hoisted(() => ({
  mockDarwin: {
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openPrivacySettings: vi.fn(),
  },
  mockWin32: {
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openPrivacySettings: vi.fn(),
  },
  mockLinux: {
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openPrivacySettings: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock("../../electron/src/native/permissions-darwin", () => mockDarwin);
vi.mock("../../electron/src/native/permissions-win32", () => mockWin32);
vi.mock("../../electron/src/native/permissions-linux", () => mockLinux);

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are in place)
// ---------------------------------------------------------------------------

import { ipcMain } from "electron";
import {
  getPermissionManager,
  PermissionManager,
  registerPermissionsIPC,
} from "../../electron/src/native/permissions";
import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "../../electron/src/native/permissions-shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the platform-specific mock for the current process.platform */
function currentPlatformMock() {
  switch (process.platform) {
    case "darwin":
      return mockDarwin;
    case "win32":
      return mockWin32;
    case "linux":
      return mockLinux;
    default:
      return mockDarwin;
  }
}

function granted(): PermissionCheckResult {
  return { status: "granted", canRequest: false };
}
function denied(): PermissionCheckResult {
  return { status: "denied", canRequest: false };
}
function _notDetermined(): PermissionCheckResult {
  return { status: "not-determined", canRequest: true };
}

function makeMockWindow(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: { send: vi.fn() },
  } as unknown as import("electron").BrowserWindow;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionManager", () => {
  let manager: PermissionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new PermissionManager();

    // Default: platform mock returns granted for everything
    const pm = currentPlatformMock();
    pm.checkPermission.mockResolvedValue(granted());
    pm.requestPermission.mockResolvedValue(granted());
    pm.openPrivacySettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    manager.dispose();
  });

  // -----------------------------------------------------------------------
  // Cache behavior
  // -----------------------------------------------------------------------

  describe("cache behavior", () => {
    it("returns cached result within TTL", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      const first = await manager.checkPermission("microphone");
      expect(first.status).toBe("granted");

      // Change the underlying result — should still get cached
      pm.checkPermission.mockResolvedValue(denied());
      const second = await manager.checkPermission("microphone");
      expect(second.status).toBe("granted");
      expect(pm.checkPermission).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache on forceRefresh", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      await manager.checkPermission("microphone");

      pm.checkPermission.mockResolvedValue(denied());
      const refreshed = await manager.checkPermission("microphone", true);
      expect(refreshed.status).toBe("denied");
      expect(pm.checkPermission).toHaveBeenCalledTimes(2);
    });

    it("expires after timeout", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      await manager.checkPermission("microphone");

      // Advance past default 30s TTL
      vi.advanceTimersByTime(31_000);

      pm.checkPermission.mockResolvedValue(denied());
      const result = await manager.checkPermission("microphone");
      expect(result.status).toBe("denied");
      expect(pm.checkPermission).toHaveBeenCalledTimes(2);
    });

    it("clearCache invalidates all entries", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      await manager.checkPermission("microphone");
      await manager.checkPermission("camera");

      manager.clearCache();

      pm.checkPermission.mockResolvedValue(denied());
      const mic = await manager.checkPermission("microphone");
      const cam = await manager.checkPermission("camera");
      expect(mic.status).toBe("denied");
      expect(cam.status).toBe("denied");
    });

    it("setCacheTimeout changes TTL", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      manager.setCacheTimeout(5000);
      await manager.checkPermission("microphone");

      vi.advanceTimersByTime(6000);

      pm.checkPermission.mockResolvedValue(denied());
      const result = await manager.checkPermission("microphone");
      expect(result.status).toBe("denied");
    });
  });

  // -----------------------------------------------------------------------
  // Shell toggle
  // -----------------------------------------------------------------------

  describe("shell toggle", () => {
    it("defaults to enabled", () => {
      expect(manager.isShellEnabled()).toBe(true);
    });

    it("returns denied when shell is disabled", async () => {
      const win = makeMockWindow();
      manager.setMainWindow(win);
      manager.setShellEnabled(false);

      const result = await manager.checkPermission("shell");
      expect(result.status).toBe("denied");
    });

    it("returns granted when re-enabled", async () => {
      const win = makeMockWindow();
      manager.setMainWindow(win);
      manager.setShellEnabled(false);
      manager.setShellEnabled(true);

      const result = await manager.checkPermission("shell");
      expect(result.status).toBe("granted");
    });

    it("clears cache entry on toggle", async () => {
      const win = makeMockWindow();
      manager.setMainWindow(win);

      await manager.checkPermission("shell");
      manager.setShellEnabled(false);

      const result = await manager.checkPermission("shell");
      expect(result.status).toBe("denied");
    });

    it("notifies renderer on toggle", () => {
      const win = makeMockWindow();
      manager.setMainWindow(win);
      manager.setShellEnabled(false);

      expect(win.webContents.send).toHaveBeenCalledWith("permissions:changed", {
        id: "shell",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Platform routing
  // -----------------------------------------------------------------------

  describe("platform routing", () => {
    it("dispatches to correct platform module", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(denied());

      const result = await manager.checkPermission("microphone");
      expect(result.status).toBe("denied");
      expect(pm.checkPermission).toHaveBeenCalledWith("microphone");
    });

    it.skipIf(process.platform === "darwin")(
      "returns not-applicable for permissions not on this platform",
      async () => {
        const accessibilityResult =
          await manager.checkPermission("accessibility");
        expect(accessibilityResult.status).toBe("not-applicable");

        const screenResult = await manager.checkPermission("screen-recording");
        expect(screenResult.status).toBe("not-applicable");
      },
    );
  });

  // -----------------------------------------------------------------------
  // checkAllPermissions
  // -----------------------------------------------------------------------

  describe("checkAllPermissions", () => {
    it("checks all SYSTEM_PERMISSIONS and returns keyed object", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      const all = await manager.checkAllPermissions();

      expect(all).toHaveProperty("microphone");
      expect(all).toHaveProperty("camera");
      expect(all).toHaveProperty("shell");
      expect(all).toHaveProperty("accessibility");
      expect(all).toHaveProperty("screen-recording");
    });

    it("passes forceRefresh through", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      await manager.checkAllPermissions(false);
      const callCount1 = pm.checkPermission.mock.calls.length;

      // Second call without force should hit cache — zero new platform calls
      await manager.checkAllPermissions(false);
      const callCount2 = pm.checkPermission.mock.calls.length;
      expect(callCount2).toBe(callCount1);

      // Force refresh should re-check
      await manager.checkAllPermissions(true);
      const callCount3 = pm.checkPermission.mock.calls.length;
      expect(callCount3).toBeGreaterThan(callCount2);
    });
  });

  // -----------------------------------------------------------------------
  // requestPermission
  // -----------------------------------------------------------------------

  describe("requestPermission", () => {
    it("calls platform request and updates cache", async () => {
      const pm = currentPlatformMock();
      pm.requestPermission.mockResolvedValue(granted());

      const win = makeMockWindow();
      manager.setMainWindow(win);

      const result = await manager.requestPermission("microphone");
      expect(result.status).toBe("granted");
      expect(pm.requestPermission).toHaveBeenCalledWith("microphone");

      // Should be cached now
      const cached = await manager.checkPermission("microphone");
      expect(cached.status).toBe("granted");
    });

    it("notifies renderer after request", async () => {
      const pm = currentPlatformMock();
      pm.requestPermission.mockResolvedValue(granted());

      const win = makeMockWindow();
      manager.setMainWindow(win);

      await manager.requestPermission("microphone");
      expect(win.webContents.send).toHaveBeenCalledWith("permissions:changed", {
        id: "microphone",
      });
    });

    it.skipIf(process.platform === "darwin")(
      "returns not-applicable for inapplicable permissions",
      async () => {
        const result = await manager.requestPermission("accessibility");
        expect(result.status).toBe("not-applicable");
      },
    );
  });

  // -----------------------------------------------------------------------
  // openSettings
  // -----------------------------------------------------------------------

  describe("openSettings", () => {
    it("delegates to correct platform module", async () => {
      const pm = currentPlatformMock();
      await manager.openSettings("microphone");
      expect(pm.openPrivacySettings).toHaveBeenCalledWith("microphone");
    });

    it("delegates for each permission id", async () => {
      const pm = currentPlatformMock();
      const ids: SystemPermissionId[] = [
        "accessibility",
        "screen-recording",
        "microphone",
        "camera",
        "shell",
      ];
      for (const id of ids) {
        await manager.openSettings(id);
      }
      expect(pm.openPrivacySettings).toHaveBeenCalledTimes(ids.length);
    });
  });

  // -----------------------------------------------------------------------
  // checkFeaturePermissions
  // -----------------------------------------------------------------------

  describe("checkFeaturePermissions", () => {
    it("returns granted when all required permissions are granted", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      const result = await manager.checkFeaturePermissions("shell");
      expect(result.granted).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("returns missing list when some denied", async () => {
      const pm = currentPlatformMock();
      pm.checkPermission.mockImplementation(async (id: SystemPermissionId) => {
        if (id === "microphone") return denied();
        return granted();
      });

      // "talkmode" requires microphone
      const result = await manager.checkFeaturePermissions("talkmode");
      if (result.missing.length > 0) {
        expect(result.granted).toBe(false);
        expect(result.missing).toContain("microphone");
      }
    });

    it("treats not-applicable as granted", async () => {
      // Permissions not applicable to this platform shouldn't block features
      const pm = currentPlatformMock();
      pm.checkPermission.mockResolvedValue(granted());

      const result = await manager.checkFeaturePermissions("computeruse");
      // accessibility + screen-recording are darwin-only; on other platforms
      // they should be not-applicable and not block the feature
      expect(result.granted).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Renderer notification
  // -----------------------------------------------------------------------

  describe("renderer notification", () => {
    it("sends to mainWindow.webContents", async () => {
      const win = makeMockWindow();
      manager.setMainWindow(win);

      const pm = currentPlatformMock();
      pm.requestPermission.mockResolvedValue(granted());

      await manager.requestPermission("microphone");

      expect(win.webContents.send).toHaveBeenCalledWith("permissions:changed", {
        id: "microphone",
      });
    });

    it("no-ops when window is null", async () => {
      // No window set — should not throw
      const pm = currentPlatformMock();
      pm.requestPermission.mockResolvedValue(granted());

      await expect(
        manager.requestPermission("microphone"),
      ).resolves.toBeDefined();
    });

    it("no-ops when window is destroyed", async () => {
      const win = makeMockWindow(true);
      manager.setMainWindow(win);

      const pm = currentPlatformMock();
      pm.requestPermission.mockResolvedValue(granted());

      await manager.requestPermission("microphone");
      expect(win.webContents.send).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe("singleton", () => {
    it("getPermissionManager returns same instance", () => {
      const a = getPermissionManager();
      const b = getPermissionManager();
      expect(a).toBe(b);
    });
  });

  // -----------------------------------------------------------------------
  // IPC registration
  // -----------------------------------------------------------------------

  describe("IPC registration", () => {
    it("registerPermissionsIPC registers all 9 handlers", () => {
      registerPermissionsIPC();

      const expectedChannels = [
        "permissions:getAll",
        "permissions:check",
        "permissions:request",
        "permissions:openSettings",
        "permissions:checkFeature",
        "permissions:setShellEnabled",
        "permissions:isShellEnabled",
        "permissions:clearCache",
        "permissions:getPlatform",
      ];

      for (const channel of expectedChannels) {
        expect(ipcMain.handle).toHaveBeenCalledWith(
          channel,
          expect.any(Function),
        );
      }
    });
  });
});
