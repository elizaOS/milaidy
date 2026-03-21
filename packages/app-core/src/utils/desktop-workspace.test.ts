import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock, isElectrobunRuntimeMock } = vi.hoisted(
  () => ({
    invokeDesktopBridgeRequestMock: vi.fn(),
    isElectrobunRuntimeMock: vi.fn(),
  }),
);

vi.mock("../bridge/electrobun-rpc", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

import {
  formatDesktopWorkspaceSummary,
  loadDesktopWorkspaceSnapshot,
  openDesktopSettingsWindow,
  openDesktopSurfaceWindow,
} from "./desktop-workspace";

describe("desktop-workspace utilities", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
  });

  it("returns an unsupported snapshot outside the desktop runtime", async () => {
    isElectrobunRuntimeMock.mockReturnValue(false);

    const snapshot = await loadDesktopWorkspaceSnapshot();

    expect(snapshot.supported).toBe(false);
    expect(formatDesktopWorkspaceSummary(snapshot)).toContain(
      "Desktop runtime unavailable",
    );
    expect(invokeDesktopBridgeRequestMock).not.toHaveBeenCalled();
  });

  it("loads the desktop snapshot from typed bridge requests", async () => {
    isElectrobunRuntimeMock.mockReturnValue(true);
    const responses: Record<string, unknown> = {
      desktopGetVersion: {
        version: "1.2.3",
        name: "Milady",
        runtime: "electrobun",
      },
      desktopIsPackaged: { packaged: false },
      desktopGetAutoLaunchStatus: { enabled: true, openAsHidden: true },
      desktopGetWindowBounds: { x: 1, y: 2, width: 800, height: 600 },
      desktopIsWindowMaximized: { maximized: false },
      desktopIsWindowMinimized: { minimized: false },
      desktopIsWindowVisible: { visible: true },
      desktopIsWindowFocused: { focused: true },
      desktopGetPowerState: {
        onBattery: false,
        idleState: "active",
        idleTime: 4,
      },
      desktopGetPrimaryDisplay: {
        id: 1,
        bounds: { x: 0, y: 0, width: 1728, height: 1117 },
        workArea: { x: 0, y: 0, width: 1728, height: 1080 },
        scaleFactor: 2,
        isPrimary: true,
      },
      desktopGetAllDisplays: {
        displays: [
          {
            id: 1,
            bounds: { x: 0, y: 0, width: 1728, height: 1117 },
            workArea: { x: 0, y: 0, width: 1728, height: 1080 },
            scaleFactor: 2,
            isPrimary: true,
          },
        ],
      },
      desktopGetCursorPosition: { x: 10, y: 11 },
      desktopReadFromClipboard: { text: "clipboard text", hasImage: false },
      desktopClipboardAvailableFormats: { formats: ["text/plain"] },
      desktopGetPath: { path: "/tmp/example" },
    };

    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) =>
        responses[rpcMethod] ?? null,
    );

    const snapshot = await loadDesktopWorkspaceSnapshot();

    expect(snapshot.supported).toBe(true);
    expect(snapshot.version?.runtime).toBe("electrobun");
    expect(snapshot.autoLaunch).toEqual({
      enabled: true,
      openAsHidden: true,
    });
    expect(snapshot.window.bounds?.width).toBe(800);
    expect(snapshot.clipboard?.text).toBe("clipboard text");
    expect(snapshot.paths.downloads).toBe("/tmp/example");
    expect(formatDesktopWorkspaceSummary(snapshot)).toContain("Milady 1.2.3");
    expect(formatDesktopWorkspaceSummary(snapshot)).toContain("Auto-launch on");
  });

  it("opens detached settings and surface windows through the typed bridge", async () => {
    await openDesktopSettingsWindow("desktop");
    await openDesktopSurfaceWindow("release");

    expect(invokeDesktopBridgeRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        rpcMethod: "desktopOpenSettingsWindow",
        ipcChannel: "desktop:openSettingsWindow",
        params: { tabHint: "desktop" },
      }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rpcMethod: "desktopOpenSurfaceWindow",
        ipcChannel: "desktop:openSurfaceWindow",
        params: { surface: "release" },
      }),
    );
  });
});
