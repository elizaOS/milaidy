import { afterEach, describe, expect, it, vi } from "vitest";

import { MiladyClient } from "../../src/api-client";

type ElectronBridge = {
  ipcRenderer?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
};

describe("MiladyClient system permissions", () => {
  const originalFetch = globalThis.fetch;
  const originalProtocol = (window.location as { protocol?: string }).protocol;
  const originalBase = (window as { __MILADY_API_BASE__?: string })
    .__MILADY_API_BASE__;
  const originalElectron = (window as { electron?: ElectronBridge }).electron;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    (window.location as { protocol?: string }).protocol = originalProtocol;
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      originalBase;
    (window as { electron?: ElectronBridge }).electron = originalElectron;
    vi.restoreAllMocks();
  });

  it("opens permission settings through Electron IPC when available", async () => {
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      undefined;

    const invoke = vi.fn(async () => undefined);
    (window as { electron?: ElectronBridge }).electron = {
      ipcRenderer: { invoke },
    };

    const fetchMock = vi.fn();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await client.openPermissionSettings("accessibility");

    expect(invoke).toHaveBeenCalledWith(
      "permissions:openSettings",
      "accessibility",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to HTTP when Electron openSettings invoke fails", async () => {
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      "http://localhost:2138";

    const invoke = vi.fn(async () => {
      throw new Error("ipc unavailable");
    });
    (window as { electron?: ElectronBridge }).electron = {
      ipcRenderer: { invoke },
    };

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ opened: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient();
    await client.openPermissionSettings("accessibility");

    expect(invoke).toHaveBeenCalledWith(
      "permissions:openSettings",
      "accessibility",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2138/api/permissions/accessibility/open-settings",
      expect.any(Object),
    );
  });

  it("normalizes wrapped permission payloads from /api/permissions", async () => {
    (window as { electron?: ElectronBridge }).electron = undefined;

    const now = Date.now();
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          permissions: {
            accessibility: {
              id: "accessibility",
              status: "denied",
              canRequest: false,
              lastChecked: now,
            },
          },
          shellEnabled: false,
          platform: "darwin",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    const permissions = await client.getPermissions();

    expect(permissions.accessibility.status).toBe("denied");
    expect(permissions.shell.status).toBe("denied");
    expect(permissions.microphone.id).toBe("microphone");
  });

  it("returns shell permission state from wrapped shell toggle response", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          shellEnabled: true,
          permission: {
            id: "shell",
            status: "granted",
            canRequest: false,
            lastChecked: 123,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    const shell = await client.setShellEnabled(true);

    expect(shell).toMatchObject({
      id: "shell",
      status: "granted",
      canRequest: false,
      lastChecked: 123,
    });
  });
});
