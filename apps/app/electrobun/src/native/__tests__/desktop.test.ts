/**
 * Unit tests for the Electrobun DesktopManager native module.
 *
 * Covers:
 * - openExternal — http/https allow-list, invalid URL rejection
 * - showItemInFolder — absolute path enforcement
 * - isPackaged — NODE_ENV / ELECTROBUN_DEV env vars
 * - setAutoLaunch macOS — plist write, launchctl load/unload, dir creation
 * - setAutoLaunch Linux — .desktop file write/unlink
 * - setAutoLaunch Windows — reg add/delete via Bun.spawn
 * - getAutoLaunchStatus — per-platform enabled detection
 * - getPath — known name mapping + unknown name fallback
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.fn() INSIDE factories to avoid hoisting issues.
// ---------------------------------------------------------------------------

vi.mock("../mac-window-effects", () => ({
  isAppActive: vi.fn(() => false),
  isKeyWindow: vi.fn(() => false),
  makeKeyAndOrderFront: vi.fn(() => true),
  orderOut: vi.fn(() => true),
}));

vi.mock("node:fs", () => {
  const existsSyncFn = vi.fn(() => false);
  const writeFileSyncFn = vi.fn();
  const mkdirSyncFn = vi.fn();
  const unlinkSyncFn = vi.fn();
  const readFileSyncFn = vi.fn(() => "");
  const fns = {
    existsSync: existsSyncFn,
    writeFileSync: writeFileSyncFn,
    mkdirSync: mkdirSyncFn,
    unlinkSync: unlinkSyncFn,
    readFileSync: readFileSyncFn,
  };
  return { default: fns, ...fns };
});

vi.mock("node:os", () => {
  const homedirFn = vi.fn(() => "/mock/home");
  const fns = { homedir: homedirFn };
  return { default: fns, ...fns };
});

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { default: actual, ...actual };
});

vi.mock("../rpc-schema", () => ({}));

// electrobun/bun must be mocked before module import so PATH_NAME_MAP (which
// reads Utils.paths.* at module load time) resolves to the mock values.
vi.mock("electrobun/bun", () => ({
  Utils: {
    paths: {
      home: "/mock/home",
      appData: "/mock/appdata",
      userData: "/mock/userdata",
      temp: "/tmp",
      cache: "/mock/cache",
      logs: "/mock/logs",
      documents: "/mock/documents",
      downloads: "/mock/downloads",
      desktop: "/mock/desktop",
    },
    quit: vi.fn(),
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
    clipboardWriteText: vi.fn(),
    clipboardReadText: vi.fn(() => ""),
    clipboardReadImage: vi.fn(() => null),
    clipboardWriteImage: vi.fn(),
    clipboardClear: vi.fn(),
    showNotification: vi.fn(),
  },
  Tray: { create: vi.fn() },
  GlobalShortcut: { register: vi.fn(), unregister: vi.fn() },
  Updater: { localInfo: { version: vi.fn(() => "2.0.0") } },
  BrowserWindow: vi.fn(),
  Electrobun: {},
}));

vi.stubGlobal("Bun", {
  spawn: vi.fn(() => makeSpawnResult("")),
  version: "1.2.3",
});

// ---------------------------------------------------------------------------
// Module under test (after mocks)
// ---------------------------------------------------------------------------

import * as nodeFs from "node:fs";
import * as electrobunBun from "electrobun/bun";
import { DesktopManager } from "../desktop";
import * as macEffects from "../mac-window-effects";

const mockExistsSync = nodeFs.existsSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = nodeFs.writeFileSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = nodeFs.mkdirSync as ReturnType<typeof vi.fn>;
const mockUnlinkSync = nodeFs.unlinkSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = nodeFs.readFileSync as ReturnType<typeof vi.fn>;
const mockOpenExternal = electrobunBun.Utils.openExternal as ReturnType<
  typeof vi.fn
>;
const mockShowItemInFolder = electrobunBun.Utils.showItemInFolder as ReturnType<
  typeof vi.fn
>;
const mockSpawn = (globalThis as { Bun: { spawn: ReturnType<typeof vi.fn> } })
  .Bun.spawn;
const mockIsAppActive = macEffects.isAppActive as ReturnType<typeof vi.fn>;
const mockMakeKeyAndOrderFront = macEffects.makeKeyAndOrderFront as ReturnType<
  typeof vi.fn
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpawnResult(stdout: string) {
  const encoded = new TextEncoder().encode(stdout);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(encoded);
      c.close();
    },
  });
  return { exited: Promise.resolve(0), stdout: stream };
}

function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DesktopManager", () => {
  let manager: DesktopManager;

  beforeEach(() => {
    manager = new DesktopManager();
    vi.useRealTimers();
    mockExistsSync.mockReset().mockReturnValue(false);
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockUnlinkSync.mockReset();
    mockReadFileSync.mockReset().mockReturnValue("");
    mockOpenExternal.mockReset();
    mockShowItemInFolder.mockReset();
    mockSpawn.mockReset().mockReturnValue(makeSpawnResult(""));
    mockIsAppActive.mockReset().mockReturnValue(false);
    mockMakeKeyAndOrderFront.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    // Restore platform to darwin (test host)
    setPlatform("darwin");
    delete process.env.NODE_ENV;
    delete process.env.ELECTROBUN_DEV;
    vi.useRealTimers();
  });

  // ── openExternal — URL security ───────────────────────────────────────────

  describe("openExternal", () => {
    it("allows http:// URLs", async () => {
      await expect(
        manager.openExternal({ url: "http://example.com" }),
      ).resolves.toBeUndefined();
      expect(mockOpenExternal).toHaveBeenCalledWith("http://example.com");
    });

    it("allows https:// URLs", async () => {
      await expect(
        manager.openExternal({ url: "https://milady.ai" }),
      ).resolves.toBeUndefined();
      expect(mockOpenExternal).toHaveBeenCalledWith("https://milady.ai");
    });

    it("blocks non-http(s) protocols", async () => {
      await expect(
        manager.openExternal({ url: "file:///etc/passwd" }),
      ).rejects.toThrow("Blocked openExternal");
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it("blocks custom app schemes", async () => {
      await expect(
        manager.openExternal({ url: "milady://action" }),
      ).rejects.toThrow("Blocked openExternal");
    });

    it("throws on invalid (non-parseable) URL", async () => {
      await expect(manager.openExternal({ url: "not-a-url" })).rejects.toThrow(
        "Invalid URL",
      );
    });

    it("throws on empty string URL", async () => {
      await expect(manager.openExternal({ url: "" })).rejects.toThrow();
    });
  });

  // ── showItemInFolder ──────────────────────────────────────────────────────

  describe("showItemInFolder", () => {
    it("accepts an absolute path", async () => {
      await expect(
        manager.showItemInFolder({ path: "/Users/home/file.txt" }),
      ).resolves.toBeUndefined();
      expect(mockShowItemInFolder).toHaveBeenCalledWith("/Users/home/file.txt");
    });

    it("throws on a relative path", async () => {
      await expect(
        manager.showItemInFolder({ path: "relative/path" }),
      ).rejects.toThrow("absolute path");
    });

    it("throws on empty string", async () => {
      await expect(manager.showItemInFolder({ path: "" })).rejects.toThrow(
        "absolute path",
      );
    });
  });

  // ── isPackaged ────────────────────────────────────────────────────────────

  describe("isPackaged", () => {
    it("returns true when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.ELECTROBUN_DEV;
      expect((await manager.isPackaged()).packaged).toBe(true);
    });

    it("returns false when ELECTROBUN_DEV is set", async () => {
      process.env.NODE_ENV = "development";
      process.env.ELECTROBUN_DEV = "1";
      expect((await manager.isPackaged()).packaged).toBe(false);
    });

    it("returns true when ELECTROBUN_DEV is absent (regardless of NODE_ENV)", async () => {
      delete process.env.NODE_ENV;
      delete process.env.ELECTROBUN_DEV;
      expect((await manager.isPackaged()).packaged).toBe(true);
    });
  });

  // ── getPath ───────────────────────────────────────────────────────────────

  describe("getPath", () => {
    it("resolves 'home' to the mock home path", async () => {
      const result = await manager.getPath({ name: "home" });
      expect(result.path).toBe("/mock/home");
    });

    it("resolves 'userData' to the mock userData path", async () => {
      const result = await manager.getPath({ name: "userData" });
      expect(result.path).toBe("/mock/userdata");
    });

    it("resolves 'downloads' to the mock downloads path", async () => {
      const result = await manager.getPath({ name: "downloads" });
      expect(result.path).toBe("/mock/downloads");
    });

    it("falls back to userData for unknown path names", async () => {
      const result = await manager.getPath({ name: "unknownName" });
      // Falls back to Utils.paths.userData
      expect(result.path).toBe("/mock/userdata");
    });
  });

  // ── setAutoLaunch — macOS ─────────────────────────────────────────────────

  describe("setAutoLaunch (macOS)", () => {
    beforeEach(() => setPlatform("darwin"));

    it("writes a plist file when enabling", async () => {
      mockExistsSync.mockReturnValue(true); // dir exists
      await manager.setAutoLaunch({ enabled: true });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = mockWriteFileSync.mock.calls[0] as [
        string,
        string,
      ];
      expect(filePath).toContain("com.miladyai.milady.plist");
      expect(content).toContain("<key>RunAtLoad</key>");
      expect(content).toContain(process.execPath);
    });

    it("creates LaunchAgents directory if missing", async () => {
      mockExistsSync.mockReturnValue(false);
      await manager.setAutoLaunch({ enabled: true });
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("LaunchAgents"),
        { recursive: true },
      );
    });

    it("calls launchctl load after writing plist", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: true });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.arrayContaining(["launchctl", "load"]),
        expect.any(Object),
      );
    });

    it("calls launchctl unload then unlinks plist when disabling", async () => {
      mockExistsSync.mockReturnValue(true); // plist exists
      await manager.setAutoLaunch({ enabled: false });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.arrayContaining(["launchctl", "unload"]),
        expect.any(Object),
      );
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        expect.stringContaining("com.miladyai.milady.plist"),
      );
    });

    it("does nothing when disabling and plist does not exist", async () => {
      mockExistsSync.mockReturnValue(false);
      await manager.setAutoLaunch({ enabled: false });
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it("includes --hidden arg in plist ProgramArguments when openAsHidden is true", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: true, openAsHidden: true });
      const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
      expect(content).toContain("--hidden");
    });

    it("does not include --hidden arg in plist when openAsHidden is false", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: true, openAsHidden: false });
      const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
      expect(content).not.toContain("--hidden");
    });
  });

  // ── setAutoLaunch — Linux ─────────────────────────────────────────────────

  describe("setAutoLaunch (Linux)", () => {
    beforeEach(() => setPlatform("linux"));

    it("writes a .desktop file when enabling", async () => {
      mockExistsSync.mockReturnValue(true); // dir exists
      await manager.setAutoLaunch({ enabled: true });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = mockWriteFileSync.mock.calls[0] as [
        string,
        string,
      ];
      expect(filePath).toContain("milady.desktop");
      expect(content).toContain("[Desktop Entry]");
      expect(content).toContain(process.execPath);
    });

    it("creates autostart directory if missing", async () => {
      mockExistsSync.mockReturnValue(false);
      await manager.setAutoLaunch({ enabled: true });
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("autostart"),
        { recursive: true },
      );
    });

    it("unlinks .desktop file when disabling", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: false });
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        expect.stringContaining("milady.desktop"),
      );
    });

    it("does nothing when disabling and .desktop does not exist", async () => {
      mockExistsSync.mockReturnValue(false);
      await manager.setAutoLaunch({ enabled: false });
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it("appends --hidden to Exec line when openAsHidden is true", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: true, openAsHidden: true });
      const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
      expect(content).toContain(`${process.execPath} --hidden`);
    });

    it("does not append --hidden to Exec line when openAsHidden is false", async () => {
      mockExistsSync.mockReturnValue(true);
      await manager.setAutoLaunch({ enabled: true, openAsHidden: false });
      const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
      expect(content).not.toContain("--hidden");
    });
  });

  // ── setAutoLaunch — Windows ───────────────────────────────────────────────

  describe("setAutoLaunch (Windows)", () => {
    beforeEach(() => setPlatform("win32"));

    it("calls reg add when enabling", async () => {
      await manager.setAutoLaunch({ enabled: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.arrayContaining(["reg", "add"]),
        expect.any(Object),
      );
    });

    it("includes the app path in the reg add command", async () => {
      await manager.setAutoLaunch({ enabled: true });
      const [args] = mockSpawn.mock.calls[0] as [string[]];
      expect(args).toContain(process.execPath);
    });

    it("calls reg delete when disabling", async () => {
      await manager.setAutoLaunch({ enabled: false });
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.arrayContaining(["reg", "delete"]),
        expect.any(Object),
      );
    });

    it("appends --hidden to registry value when openAsHidden is true", async () => {
      await manager.setAutoLaunch({ enabled: true, openAsHidden: true });
      const [args] = mockSpawn.mock.calls[0] as [string[]];
      const valueIdx = args.indexOf("/d") + 1;
      expect(args[valueIdx]).toBe(`${process.execPath} --hidden`);
    });

    it("does not append --hidden to registry value when openAsHidden is false", async () => {
      await manager.setAutoLaunch({ enabled: true, openAsHidden: false });
      const [args] = mockSpawn.mock.calls[0] as [string[]];
      const valueIdx = args.indexOf("/d") + 1;
      expect(args[valueIdx]).toBe(process.execPath);
    });
  });

  // ── getAutoLaunchStatus ───────────────────────────────────────────────────

  describe("getAutoLaunchStatus", () => {
    it("returns enabled: true on macOS when plist exists", async () => {
      setPlatform("darwin");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("<key>RunAtLoad</key>");
      const status = await manager.getAutoLaunchStatus();
      expect(status.enabled).toBe(true);
      expect(status.openAsHidden).toBe(false);
    });

    it("returns openAsHidden: true on macOS when plist contains --hidden", async () => {
      setPlatform("darwin");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("<string>--hidden</string>");
      expect((await manager.getAutoLaunchStatus()).openAsHidden).toBe(true);
    });

    it("returns enabled: false on macOS when plist is missing", async () => {
      setPlatform("darwin");
      mockExistsSync.mockReturnValue(false);
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(false);
    });

    it("returns enabled: true on Linux when .desktop file exists", async () => {
      setPlatform("linux");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("Exec=/path/to/app");
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(true);
    });

    it("returns openAsHidden: true on Linux when .desktop Exec contains --hidden", async () => {
      setPlatform("linux");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("Exec=/path/to/app --hidden");
      expect((await manager.getAutoLaunchStatus()).openAsHidden).toBe(true);
    });

    it("returns enabled: false on Linux when .desktop file is missing", async () => {
      setPlatform("linux");
      mockExistsSync.mockReturnValue(false);
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(false);
    });

    it("returns enabled: true on Windows when reg query includes 'Milady'", async () => {
      setPlatform("win32");
      mockSpawn.mockReturnValue(
        makeSpawnResult("Milady    REG_SZ    /path/to/app"),
      );
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(true);
    });

    it("returns openAsHidden: true on Windows when reg value contains --hidden", async () => {
      setPlatform("win32");
      mockSpawn.mockReturnValue(
        makeSpawnResult("Milady    REG_SZ    /path/to/app --hidden"),
      );
      expect((await manager.getAutoLaunchStatus()).openAsHidden).toBe(true);
    });

    it("returns enabled: false on Windows when reg query output lacks 'Milady'", async () => {
      setPlatform("win32");
      mockSpawn.mockReturnValue(
        makeSpawnResult(
          "ERROR: The system was unable to find the specified registry key",
        ),
      );
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(false);
    });

    it("returns enabled: false on unsupported platform", async () => {
      setPlatform("freebsd");
      expect((await manager.getAutoLaunchStatus()).enabled).toBe(false);
    });
  });

  describe("window restore", () => {
    it("restores a minimized macOS window when the app becomes active", async () => {
      vi.useFakeTimers();
      setPlatform("darwin");

      const fakeWindow = {
        ptr: Symbol("window"),
        isMinimized: vi.fn(() => true),
        show: vi.fn(),
        focus: vi.fn(),
        on: vi.fn(),
      };

      mockIsAppActive.mockReturnValue(false);
      manager.setMainWindow(
        fakeWindow as Parameters<DesktopManager["setMainWindow"]>[0],
      );

      await vi.advanceTimersByTimeAsync(600);
      expect(mockMakeKeyAndOrderFront).not.toHaveBeenCalled();

      mockIsAppActive.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(600);

      expect(mockMakeKeyAndOrderFront).toHaveBeenCalledWith(fakeWindow.ptr);
    });
  });
});
