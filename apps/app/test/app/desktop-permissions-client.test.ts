// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock } = vi.hoisted(() => ({
  invokeDesktopBridgeRequestMock: vi.fn(),
}));

vi.mock("@elizaos/app-core/bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
}));

import { installDesktopPermissionsClientPatch } from "../../src/desktop-permissions-client";

describe("desktop permissions client patch", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
  });

  it("prefers Electrobun RPC for permission reads used by onboarding", async () => {
    const originalGetPermissions = vi.fn(async () => ({
      accessibility: { id: "accessibility", status: "denied" },
    }));
    const originalGetPermission = vi.fn(async () => ({
      id: "accessibility",
      status: "denied",
    }));
    const originalRequestPermission = vi.fn(async () => ({
      id: "microphone",
      status: "denied",
    }));
    const originalOpenPermissionSettings = vi.fn(async () => undefined);
    const originalRefreshPermissions = vi.fn(async () => ({
      accessibility: { id: "accessibility", status: "denied" },
    }));
    const originalSetShellEnabled = vi.fn(async () => ({
      id: "shell",
      status: "denied",
    }));
    const originalIsShellEnabled = vi.fn(async () => false);
    const client = {
      getPermissions: originalGetPermissions,
      getPermission: originalGetPermission,
      requestPermission: originalRequestPermission,
      openPermissionSettings: originalOpenPermissionSettings,
      refreshPermissions: originalRefreshPermissions,
      setShellEnabled: originalSetShellEnabled,
      isShellEnabled: originalIsShellEnabled,
    };

    invokeDesktopBridgeRequestMock.mockImplementation(async (options) => {
      switch (options.rpcMethod) {
        case "permissionsGetAll":
          return {
            accessibility: { id: "accessibility", status: "granted" },
          };
        case "permissionsCheck":
          return { id: "accessibility", status: "granted" };
        case "permissionsRequest":
          return { id: "microphone", status: "granted" };
        case "permissionsOpenSettings":
          return undefined;
        case "permissionsSetShellEnabled":
          return { id: "shell", status: "granted" };
        case "permissionsIsShellEnabled":
          return true;
        default:
          return null;
      }
    });

    const restore = installDesktopPermissionsClientPatch(client);

    await expect(client.getPermissions()).resolves.toEqual({
      accessibility: { id: "accessibility", status: "granted" },
    });
    await expect(client.getPermission("accessibility")).resolves.toEqual({
      id: "accessibility",
      status: "granted",
    });
    await expect(client.requestPermission("microphone")).resolves.toEqual({
      id: "microphone",
      status: "granted",
    });
    await expect(client.refreshPermissions()).resolves.toEqual({
      accessibility: { id: "accessibility", status: "granted" },
    });
    await expect(client.setShellEnabled(true)).resolves.toEqual({
      id: "shell",
      status: "granted",
    });
    await expect(client.isShellEnabled()).resolves.toBe(true);
    await expect(
      client.openPermissionSettings("accessibility"),
    ).resolves.toBeUndefined();

    expect(originalGetPermissions).not.toHaveBeenCalled();
    expect(originalGetPermission).not.toHaveBeenCalled();
    expect(originalRequestPermission).not.toHaveBeenCalled();
    expect(originalRefreshPermissions).not.toHaveBeenCalled();
    expect(originalSetShellEnabled).not.toHaveBeenCalled();
    expect(originalIsShellEnabled).not.toHaveBeenCalled();
    expect(originalOpenPermissionSettings).not.toHaveBeenCalled();

    restore();
  });

  it("falls back to the HTTP client when Electrobun RPC is unavailable", async () => {
    const originalGetPermissions = vi.fn(async () => ({
      accessibility: { id: "accessibility", status: "granted" },
    }));
    const originalGetPermission = vi.fn(async () => ({
      id: "accessibility",
      status: "granted",
    }));
    const originalRequestPermission = vi.fn(async () => ({
      id: "microphone",
      status: "granted",
    }));
    const originalOpenPermissionSettings = vi.fn(async () => undefined);
    const originalRefreshPermissions = vi.fn(async () => ({
      accessibility: { id: "accessibility", status: "granted" },
    }));
    const originalSetShellEnabled = vi.fn(async () => ({
      id: "shell",
      status: "granted",
    }));
    const originalIsShellEnabled = vi.fn(async () => true);
    const client = {
      getPermissions: originalGetPermissions,
      getPermission: originalGetPermission,
      requestPermission: originalRequestPermission,
      openPermissionSettings: originalOpenPermissionSettings,
      refreshPermissions: originalRefreshPermissions,
      setShellEnabled: originalSetShellEnabled,
      isShellEnabled: originalIsShellEnabled,
    };

    invokeDesktopBridgeRequestMock.mockResolvedValue(null);

    const restore = installDesktopPermissionsClientPatch(client);

    await client.getPermissions();
    await client.getPermission("accessibility");
    await client.requestPermission("microphone");
    await client.refreshPermissions();
    await client.setShellEnabled(false);
    await client.isShellEnabled();
    await client.openPermissionSettings("accessibility");

    expect(originalGetPermissions).toHaveBeenCalledTimes(1);
    expect(originalGetPermission).toHaveBeenCalledWith("accessibility");
    expect(originalRequestPermission).toHaveBeenCalledWith("microphone");
    expect(originalRefreshPermissions).toHaveBeenCalledTimes(1);
    expect(originalSetShellEnabled).toHaveBeenCalledWith(false);
    expect(originalIsShellEnabled).toHaveBeenCalledTimes(1);
    expect(originalOpenPermissionSettings).toHaveBeenCalledWith(
      "accessibility",
    );

    restore();
  });
});
