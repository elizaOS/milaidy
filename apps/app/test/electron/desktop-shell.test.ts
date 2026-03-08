/**
 * Regression tests for shell IPC validation in DesktopManager.
 *
 * Verifies that openExternal rejects non-http(s) URLs and that
 * showItemInFolder rejects relative / empty paths.
 *
 * See PR #574 — security(electron): validate URLs and paths in shell IPC handlers
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — we only need shell and path; stub everything else Electron provides
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn(() => "/mock"),
    getName: vi.fn(() => "milady-test"),
    getVersion: vi.fn(() => "0.0.0-test"),
    getPath: vi.fn(() => "/mock"),
    getLoginItemSettings: vi.fn(() => ({
      openAtLogin: false,
      openAsHidden: false,
    })),
    setLoginItemSettings: vi.fn(),
    isPackaged: false,
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
    on: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
    showItemInFolder: vi.fn(),
    beep: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(() => ""),
    writeHTML: vi.fn(),
    readHTML: vi.fn(() => ""),
    writeRTF: vi.fn(),
    readRTF: vi.fn(() => ""),
    readImage: vi.fn(() => ({ isEmpty: () => true })),
    writeImage: vi.fn(),
    clear: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      resize: vi.fn(() => ({})),
      isEmpty: () => true,
    })),
    createFromDataURL: vi.fn(() => ({})),
  },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  MenuItem: vi.fn(),
  Notification: vi.fn(),
  globalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(),
  },
  powerMonitor: {
    getSystemIdleTime: vi.fn(() => 0),
    getSystemIdleState: vi.fn(() => "active"),
    isOnBatteryPower: vi.fn(() => false),
    on: vi.fn(),
  },
  ipcMain: { handle: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

let DesktopManager: typeof import("../../electron/src/native/desktop").DesktopManager;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to reset singleton state
  const mod = await import("../../electron/src/native/desktop");
  DesktopManager = mod.DesktopManager;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DesktopManager shell validation", () => {
  describe("openExternal", () => {
    it("rejects file:// URLs", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.openExternal({ url: "file:///etc/passwd" }),
      ).rejects.toThrow(/non-http/i);
    });

    it("rejects smb:// URLs", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.openExternal({ url: "smb://evil.com/share" }),
      ).rejects.toThrow(/non-http/i);
    });

    it("rejects custom-scheme URLs", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.openExternal({ url: "myapp://callback?token=secret" }),
      ).rejects.toThrow(/non-http/i);
    });

    it("accepts http:// URLs", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.openExternal({ url: "http://example.com" }),
      ).resolves.toBeUndefined();
    });

    it("accepts https:// URLs", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.openExternal({ url: "https://example.com/page" }),
      ).resolves.toBeUndefined();
    });

    it("throws on malformed URLs", async () => {
      const mgr = new DesktopManager();
      await expect(mgr.openExternal({ url: "not-a-url" })).rejects.toThrow(
        /invalid url/i,
      );
    });
  });

  describe("showItemInFolder", () => {
    it("rejects relative paths", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.showItemInFolder({ path: "relative/path/file.txt" }),
      ).rejects.toThrow(/absolute path/i);
    });

    it("rejects empty strings", async () => {
      const mgr = new DesktopManager();
      await expect(mgr.showItemInFolder({ path: "" })).rejects.toThrow(
        /absolute path/i,
      );
    });

    it("accepts absolute paths", async () => {
      const mgr = new DesktopManager();
      await expect(
        mgr.showItemInFolder({ path: "/Users/test/file.txt" }),
      ).resolves.toBeUndefined();
    });
  });
});
