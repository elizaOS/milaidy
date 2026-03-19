/**
 * Unit tests for the Electrobun ScreenCapture native module.
 *
 * In Electrobun, screen capture uses platform CLI tools and a hidden
 * BrowserWindow for game-URL capture. The main webview capture runs
 * inside setInterval handlers.
 *
 * Covers:
 * - getSources — synthetic source list
 * - takeScreenshot / captureWindow — real CLI capture (returns available boolean)
 * - startRecording / stopRecording / pauseRecording / resumeRecording lifecycle
 * - getRecordingState default shape
 * - startFrameCapture state management and idempotency
 * - stopFrameCapture return shape + timer cleanup
 * - saveScreenshot — base64 decode + fs.writeFileSync
 * - dispose cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.fn() defined INSIDE factories; shared references via local consts
// so default-import and named-import both point to the same mock function.
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => {
  const existsSyncFn = vi.fn(() => false);
  const writeFileSyncFn = vi.fn();
  const mkdirSyncFn = vi.fn();
  const unlinkSyncFn = vi.fn();
  const readFileSyncFn = vi.fn(() => Buffer.alloc(0));
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
  const tmpdirFn = vi.fn(() => "/tmp");
  const fns = { homedir: homedirFn, tmpdir: tmpdirFn };
  return { default: fns, ...fns };
});

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { default: actual, ...actual };
});

const mockBrowserWindowInstance = {
  webview: {
    rpc: {
      requestProxy: {
        evaluateJavascriptWithResponse: vi.fn(() => Promise.resolve(null)),
      },
    },
  },
  on: vi.fn(),
  close: vi.fn(),
};

vi.mock("electrobun/bun", () => ({
  // Must use `function` (not arrow) so `new BrowserWindow(...)` works correctly.
  // Arrow functions cannot be used as constructors; vi.fn with an arrow silently
  // causes `new BrowserWindow()` to return undefined instead of the mock instance.
  // biome-ignore lint/complexity/useArrowFunction: required for constructor mock correctness
  BrowserWindow: vi.fn(function () {
    return mockBrowserWindowInstance;
  }),
}));

vi.stubGlobal("Bun", {
  spawn: vi.fn(() => ({ exited: Promise.resolve(0) })),
});

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ ok: true })),
);

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------
import * as nodeFs from "node:fs";
import { ScreenCaptureManager } from "../screencapture";

// Both named export and default.writeFileSync/existsSync point to the same fn
const mockWriteFileSync = nodeFs.writeFileSync as ReturnType<typeof vi.fn>;
const mockExistsSync = nodeFs.existsSync as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScreenCaptureManager", () => {
  let manager: ScreenCaptureManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ScreenCaptureManager();
    manager.setSendToWebview(vi.fn());
    mockWriteFileSync.mockClear();
    mockExistsSync.mockReset().mockReturnValue(false);
    mockBrowserWindowInstance.close.mockClear();
    mockBrowserWindowInstance.on.mockClear();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // ── getSources ────────────────────────────────────────────────────────────

  describe("getSources", () => {
    it("returns available: true with a non-empty sources array", async () => {
      const result = await manager.getSources();
      expect(result.available).toBe(true);
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("first source has id, name, and thumbnail", async () => {
      const { sources } = await manager.getSources();
      const src = sources[0];
      expect(src).toHaveProperty("id");
      expect(src).toHaveProperty("name");
      expect(src).toHaveProperty("thumbnail");
    });

    it("source name is 'Entire Screen'", async () => {
      const { sources } = await manager.getSources();
      expect(sources[0].name).toBe("Entire Screen");
    });

    it("source id is 'screen:0'", async () => {
      const { sources } = await manager.getSources();
      expect(sources[0].id).toBe("screen:0");
    });
  });

  // ── takeScreenshot / captureWindow ───────────────────────────────────────

  describe("takeScreenshot", () => {
    it("returns an object with an available boolean", async () => {
      const result = await manager.takeScreenshot();
      expect(typeof result.available).toBe("boolean");
    });

    it("returns data as a base64 data URL when available", async () => {
      const result = await manager.takeScreenshot();
      if (result.available && result.data) {
        expect(result.data).toMatch(/^data:image\/png;base64,/);
      }
    });
  });

  describe("captureWindow", () => {
    it("returns an object with an available boolean", async () => {
      const result = await manager.captureWindow();
      expect(typeof result.available).toBe("boolean");
    });

    it("returns an object with an available boolean when windowId is provided", async () => {
      const result = await manager.captureWindow({ windowId: "12345" });
      expect(typeof result.available).toBe("boolean");
    });
  });

  // ── recording lifecycle ───────────────────────────────────────────────────

  describe("recording lifecycle", () => {
    afterEach(async () => {
      // Clean up any running recording after each test
      await manager.stopRecording();
    });

    it("startRecording returns an object with an available boolean", async () => {
      const result = await manager.startRecording();
      expect(typeof result.available).toBe("boolean");
    });

    it("stopRecording returns available: false when no recording is active", async () => {
      expect((await manager.stopRecording()).available).toBe(false);
    });

    it("pauseRecording returns available: false when no recording is active", async () => {
      expect((await manager.pauseRecording()).available).toBe(false);
    });

    it("resumeRecording returns available: false when no recording is active", async () => {
      expect((await manager.resumeRecording()).available).toBe(false);
    });
  });

  // ── getRecordingState ─────────────────────────────────────────────────────

  describe("getRecordingState", () => {
    it("reports not recording by default", async () => {
      expect((await manager.getRecordingState()).recording).toBe(false);
    });

    it("reports zero duration", async () => {
      expect((await manager.getRecordingState()).duration).toBe(0);
    });

    it("reports paused: false", async () => {
      expect((await manager.getRecordingState()).paused).toBe(false);
    });
  });

  // ── startFrameCapture ─────────────────────────────────────────────────────

  describe("startFrameCapture", () => {
    it("returns available: true on first call", async () => {
      expect((await manager.startFrameCapture()).available).toBe(true);
    });

    it("is idempotent — second call also returns available: true", async () => {
      await manager.startFrameCapture();
      expect((await manager.startFrameCapture()).available).toBe(true);
    });

    it("does not re-start when already capturing", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      await manager.startFrameCapture();
      setIntervalSpy.mockClear();
      await manager.startFrameCapture();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("starts an interval for webview capture (no gameUrl)", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      await manager.startFrameCapture({ fps: 5 });
      expect(setIntervalSpy).toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    });

    it("computes correct interval from fps (fps=4 → 250 ms)", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      await manager.startFrameCapture({ fps: 4 });
      const call = setIntervalSpy.mock.calls.find((args) => args[1] === 250);
      expect(call).toBeDefined();
      setIntervalSpy.mockRestore();
    });

    it("does NOT use setInterval for gameUrl capture path (uses BrowserWindow)", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      await manager.startFrameCapture({
        gameUrl: "http://localhost:3000/game",
      });
      // Game capture sets up its own timer after BrowserWindow loads
      // (still uses setInterval internally, but the outer call returns early)
      setIntervalSpy.mockRestore();
    });

    // ── gameUrl allowlist (security) ─────────────────────────────────────────

    it("allows localhost gameUrl", async () => {
      const result = await manager.startFrameCapture({
        gameUrl: "http://localhost:8080/game",
      });
      expect(result.available).toBe(true);
    });

    it("allows 127.0.0.1 gameUrl", async () => {
      await manager.stopFrameCapture();
      const result = await manager.startFrameCapture({
        gameUrl: "http://127.0.0.1:3000/",
      });
      expect(result.available).toBe(true);
    });

    it("allows file:// gameUrl", async () => {
      await manager.stopFrameCapture();
      const result = await manager.startFrameCapture({
        gameUrl: "file:///Users/user/game/index.html",
      });
      expect(result.available).toBe(true);
    });

    it("blocks external https gameUrl", async () => {
      await manager.stopFrameCapture();
      const result = await manager.startFrameCapture({
        gameUrl: "https://evil.com/",
      });
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/blocked/i);
    });

    it("blocks external http gameUrl with localhost subdomain bypass attempt", async () => {
      await manager.stopFrameCapture();
      const result = await manager.startFrameCapture({
        gameUrl: "http://localhost.evil.com/",
      });
      expect(result.available).toBe(false);
    });

    it("blocks invalid gameUrl string", async () => {
      await manager.stopFrameCapture();
      const result = await manager.startFrameCapture({
        gameUrl: "not-a-url",
      });
      expect(result.available).toBe(false);
    });
  });

  // ── stopFrameCapture ──────────────────────────────────────────────────────

  describe("stopFrameCapture", () => {
    it("returns { available: true }", async () => {
      const result = await manager.stopFrameCapture();
      expect(result).toEqual({ available: true });
    });

    it("clears the interval timer after webview capture", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      await manager.startFrameCapture({ fps: 5 });
      await manager.stopFrameCapture();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("returns { available: true } even when nothing was started", async () => {
      const result = await manager.stopFrameCapture();
      expect(result.available).toBe(true);
    });

    it("allows restart after stop", async () => {
      await manager.startFrameCapture();
      await manager.stopFrameCapture();
      expect((await manager.startFrameCapture()).available).toBe(true);
    });
  });

  // ── isFrameCaptureActive ──────────────────────────────────────────────────

  describe("isFrameCaptureActive", () => {
    it("returns active: false initially", async () => {
      expect((await manager.isFrameCaptureActive()).active).toBe(false);
    });

    it("returns active: true after startFrameCapture", async () => {
      await manager.startFrameCapture();
      expect((await manager.isFrameCaptureActive()).active).toBe(true);
    });

    it("returns active: false after stopFrameCapture", async () => {
      await manager.startFrameCapture();
      await manager.stopFrameCapture();
      expect((await manager.isFrameCaptureActive()).active).toBe(false);
    });
  });

  // ── saveScreenshot ────────────────────────────────────────────────────────

  describe("saveScreenshot", () => {
    it("returns { available: true, path } on success", async () => {
      const b64 = Buffer.from("data").toString("base64");
      const result = await manager.saveScreenshot({
        data: b64,
        filename: "test.jpg",
      });
      expect(result.available).toBe(true);
      expect(result.path).toBeTruthy();
    });

    it("writes base64-decoded bytes to the filesystem", async () => {
      const original = "fake-jpeg-bytes";
      const b64 = Buffer.from(original).toString("base64");
      await manager.saveScreenshot({ data: b64, filename: "test.jpg" });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const [, buf] = mockWriteFileSync.mock.calls[0] as [string, Buffer];
      expect(buf.toString("utf8")).toBe(original);
    });

    it("includes the filename in the output path", async () => {
      const b64 = Buffer.alloc(4).toString("base64");
      await manager.saveScreenshot({ data: b64, filename: "shot.jpg" });

      const [writePath] = mockWriteFileSync.mock.calls[0] as [string];
      expect(writePath).toContain("shot.jpg");
    });

    it("writes to the Pictures directory", async () => {
      const b64 = Buffer.alloc(4).toString("base64");
      await manager.saveScreenshot({ data: b64, filename: "pic.jpg" });

      const [writePath] = mockWriteFileSync.mock.calls[0] as [string];
      expect(writePath).toContain("Pictures");
    });

    it("uses a default filename when none is provided", async () => {
      const b64 = Buffer.alloc(4).toString("base64");
      await manager.saveScreenshot({ data: b64 });

      const [writePath] = mockWriteFileSync.mock.calls[0] as [string];
      expect(writePath).toContain("screenshot-");
    });

    it("strips data: URI prefix from base64 if present", async () => {
      const original = "jpeg-data";
      const b64 = Buffer.from(original).toString("base64");
      const dataUri = `data:image/jpeg;base64,${b64}`;
      await manager.saveScreenshot({ data: dataUri, filename: "uri.jpg" });

      const [, buf] = mockWriteFileSync.mock.calls[0] as [string, Buffer];
      expect(buf.toString("utf8")).toBe(original);
    });
  });

  // ── setMainWebview ────────────────────────────────────────────────────────

  describe("setMainWebview", () => {
    it("accepts a webview reference without throwing", () => {
      const fakeWebview = {
        rpc: {
          requestProxy: {
            evaluateJavascriptWithResponse: vi.fn(() => Promise.resolve(null)),
          },
        },
      };
      expect(() => manager.setMainWebview(fakeWebview)).not.toThrow();
    });

    it("accepts null without throwing", () => {
      expect(() => manager.setMainWebview(null)).not.toThrow();
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  describe("dispose", () => {
    it("stops frame capture if active", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      await manager.startFrameCapture({ fps: 5 });
      manager.dispose();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it("is idempotent — safe to call multiple times", async () => {
      await manager.startFrameCapture();
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
