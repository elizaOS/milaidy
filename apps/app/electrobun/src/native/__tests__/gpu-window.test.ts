/**
 * Unit tests for the GpuWindowManager native module.
 *
 * Covers:
 * - createWindow — creates a GpuWindow and returns { id, frame, wgpuViewId }
 * - createWindow — idempotent (same id returns existing window info)
 * - destroyWindow — closes and removes the window
 * - destroyWindow — suppresses gpuWindowClosed push event
 * - native close event — fires gpuWindowClosed when user closes window
 * - dispose — closes all windows without firing gpuWindowClosed
 * - listWindows — returns all windows
 * - createView — creates a WGPUView
 * - destroyView — removes a WGPUView
 * - listViews — returns all views
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.fn() INSIDE factories to avoid hoisting issues.
// ---------------------------------------------------------------------------

vi.mock("../rpc-schema", () => ({}));

vi.mock("electrobun/bun", () => {
  const mockWinFrame = { x: 100, y: 100, width: 400, height: 600 };

  // biome-ignore lint/complexity/useArrowFunction: must be `function` — called with `new` in production code
  const GpuWindow = vi.fn(function () {
    return {
      frame: mockWinFrame,
      wgpuViewId: "wgpu_1",
      wgpuView: null,
      on: vi.fn(),
      close: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      minimize: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      setFrame: vi.fn(),
      getFrame: vi.fn(() => mockWinFrame),
    };
  });

  // biome-ignore lint/complexity/useArrowFunction: must be `function` — called with `new` in production code
  const WGPUView = vi.fn(function () {
    return {
      id: "view_1",
      frame: { x: 0, y: 0, width: 400, height: 400 },
      setFrame: vi.fn(),
      setTransparent: vi.fn(),
      setHidden: vi.fn(),
      getNativeHandle: vi.fn(() => 0xdeadbeef),
      remove: vi.fn(),
    };
  });

  return { GpuWindow, WGPUView };
});

// ---------------------------------------------------------------------------
// Module under test (after mocks)
// ---------------------------------------------------------------------------

import * as electrobunBun from "electrobun/bun";
import { GpuWindowManager } from "../gpu-window";

interface MockGpuWindowInstance {
  frame: { x: number; y: number; width: number; height: number };
  wgpuViewId: string;
  wgpuView: {
    setFrame: Mock<
      (x: number, y: number, width: number, height: number) => void
    >;
  } | null;
  on: Mock<(event: string, handler: () => void) => void>;
  close: Mock<() => void>;
  show: Mock<() => void>;
  hide: Mock<() => void>;
  minimize: Mock<() => void>;
  setAlwaysOnTop: Mock<(flag: boolean) => void>;
  setFrame: Mock<(x: number, y: number, width: number, height: number) => void>;
  getFrame: Mock<() => { x: number; y: number; width: number; height: number }>;
}

interface MockWGPUViewInstance {
  id: string;
  frame: { x: number; y: number; width: number; height: number };
  setFrame: Mock<(x: number, y: number, width: number, height: number) => void>;
  setTransparent: Mock<(flag: boolean) => void>;
  setHidden: Mock<(flag: boolean) => void>;
  getNativeHandle: Mock<() => number>;
  remove: Mock<() => void>;
}

type MockGpuWindowConstructor = Mock<
  (options?: unknown) => MockGpuWindowInstance
>;
type MockWGPUViewConstructor = Mock<
  (options?: unknown) => MockWGPUViewInstance
>;
type SendToWebview = (message: string, payload?: unknown) => void;

const MockGpuWindow =
  electrobunBun.GpuWindow as unknown as MockGpuWindowConstructor;
const MockWGPUView =
  electrobunBun.WGPUView as unknown as MockWGPUViewConstructor;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the "close" event handler registered on a mock GpuWindow instance.
 * The mock's `on` method is a vi.fn(); each call is (event, handler).
 */
function getCloseHandler(
  mockWin: MockGpuWindowInstance,
): (() => void) | undefined {
  const onCalls = mockWin.on.mock.calls as [string, () => void][];
  const closeCall = onCalls.find(([event]) => event === "close");
  return closeCall?.[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GpuWindowManager", () => {
  let manager: GpuWindowManager;
  let sendToWebview: Mock<SendToWebview>;

  beforeEach(() => {
    MockGpuWindow.mockClear();
    MockWGPUView.mockClear();
    manager = new GpuWindowManager();
    sendToWebview = vi.fn();
    manager.setSendToWebview(sendToWebview);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── createWindow ──────────────────────────────────────────────────────────

  describe("createWindow", () => {
    it("creates a GpuWindow and returns { id, frame, wgpuViewId }", async () => {
      const result = await manager.createWindow({ id: "win1" });

      expect(MockGpuWindow).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("win1");
      expect(result.frame).toEqual({ x: 100, y: 100, width: 400, height: 600 });
      expect(result.wgpuViewId).toBe("wgpu_1");
    });

    it("calls setAlwaysOnTop(true) by default", async () => {
      await manager.createWindow({ id: "win_aot" });
      const instance = MockGpuWindow.mock.results[0].value;
      expect(instance.setAlwaysOnTop).toHaveBeenCalledWith(true);
    });

    it("does not call setAlwaysOnTop when alwaysOnTop is false", async () => {
      await manager.createWindow({ id: "win_no_aot", alwaysOnTop: false });
      const instance = MockGpuWindow.mock.results[0].value;
      expect(instance.setAlwaysOnTop).not.toHaveBeenCalled();
    });

    it("returns existing window info when called with the same id (idempotent)", async () => {
      const first = await manager.createWindow({ id: "win_idem" });
      const second = await manager.createWindow({ id: "win_idem" });

      expect(MockGpuWindow).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it("generates a unique id when no id is provided", async () => {
      const result = await manager.createWindow({});
      expect(result.id).toMatch(/^gpu_win_/);
    });

    it("registers a 'close' event handler on the window", async () => {
      await manager.createWindow({ id: "win_close_reg" });
      const instance = MockGpuWindow.mock.results[0].value;
      expect(instance.on).toHaveBeenCalledWith("close", expect.any(Function));
    });
  });

  // ── destroyWindow ─────────────────────────────────────────────────────────

  describe("destroyWindow", () => {
    it("calls close() on the window and removes it", async () => {
      await manager.createWindow({ id: "win_destroy" });
      const instance = MockGpuWindow.mock.results[0].value;

      await manager.destroyWindow({ id: "win_destroy" });

      expect(instance.close).toHaveBeenCalledTimes(1);
      const { windows } = await manager.listWindows();
      expect(windows).toHaveLength(0);
    });

    it("does nothing when the window does not exist", async () => {
      await expect(
        manager.destroyWindow({ id: "nonexistent" }),
      ).resolves.toBeUndefined();
    });

    it("suppresses gpuWindowClosed push event (destroyingWindows guard)", async () => {
      await manager.createWindow({ id: "win_suppress" });
      const instance = MockGpuWindow.mock.results[0].value;

      // Capture the close handler and trigger it after destroyWindow closes
      // the window (simulating the native close event firing synchronously).
      const originalClose = instance.close as ReturnType<typeof vi.fn>;
      let closeHandlerFiredDuringDestroy = false;

      originalClose.mockImplementation(() => {
        // Simulate the native "close" event firing synchronously inside close()
        const handler = getCloseHandler(instance);
        if (handler) {
          handler();
          closeHandlerFiredDuringDestroy = true;
        }
      });

      await manager.destroyWindow({ id: "win_suppress" });

      expect(closeHandlerFiredDuringDestroy).toBe(true);
      expect(sendToWebview).not.toHaveBeenCalledWith(
        "gpuWindowClosed",
        expect.anything(),
      );
    });
  });

  // ── native close event fires gpuWindowClosed ──────────────────────────────

  describe("native close event", () => {
    it("fires gpuWindowClosed when user closes the window (no destroyWindow)", async () => {
      await manager.createWindow({ id: "win_native_close" });
      const instance = MockGpuWindow.mock.results[0].value;

      const handler = getCloseHandler(instance);
      expect(handler).toBeDefined();

      handler?.();

      expect(sendToWebview).toHaveBeenCalledWith("gpuWindowClosed", {
        id: "win_native_close",
      });
    });

    it("removes the window from the map when native close fires", async () => {
      await manager.createWindow({ id: "win_native_remove" });
      const instance = MockGpuWindow.mock.results[0].value;

      const handler = getCloseHandler(instance);
      handler?.();

      const { windows } = await manager.listWindows();
      expect(windows).toHaveLength(0);
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  describe("dispose", () => {
    it("closes all windows without firing gpuWindowClosed", async () => {
      await manager.createWindow({ id: "win_disp_a" });
      await manager.createWindow({ id: "win_disp_b" });

      const instanceA = MockGpuWindow.mock.results[0].value;
      const instanceB = MockGpuWindow.mock.results[1].value;

      // Wire close handlers to fire synchronously, simulating native behaviour
      for (const inst of [instanceA, instanceB]) {
        const handler = getCloseHandler(inst);
        (inst.close as ReturnType<typeof vi.fn>).mockImplementation(() => {
          handler?.();
        });
      }

      manager.dispose();

      expect(instanceA.close).toHaveBeenCalledTimes(1);
      expect(instanceB.close).toHaveBeenCalledTimes(1);
      expect(sendToWebview).not.toHaveBeenCalledWith(
        "gpuWindowClosed",
        expect.anything(),
      );
    });

    it("clears all windows after dispose", async () => {
      await manager.createWindow({ id: "win_disp_clear" });
      manager.dispose();
      const { windows } = await manager.listWindows();
      expect(windows).toHaveLength(0);
    });

    it("removes all views after dispose", async () => {
      await manager.createView({ id: "view_disp", windowId: 1 });
      manager.dispose();
      const { views } = await manager.listViews();
      expect(views).toHaveLength(0);
    });
  });

  // ── listWindows ───────────────────────────────────────────────────────────

  describe("listWindows", () => {
    it("returns all tracked windows", async () => {
      await manager.createWindow({ id: "win_list_a" });
      await manager.createWindow({ id: "win_list_b" });

      const { windows } = await manager.listWindows();
      expect(windows).toHaveLength(2);
      expect(windows.map((w) => w.id)).toContain("win_list_a");
      expect(windows.map((w) => w.id)).toContain("win_list_b");
    });

    it("returns an empty array when no windows exist", async () => {
      const { windows } = await manager.listWindows();
      expect(windows).toHaveLength(0);
    });
  });

  // ── createView ────────────────────────────────────────────────────────────

  describe("createView", () => {
    it("creates a WGPUView and returns { id, frame, viewId }", async () => {
      const result = await manager.createView({ id: "view1", windowId: 42 });

      expect(MockWGPUView).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("view1");
      expect(result.frame).toEqual({ x: 0, y: 0, width: 400, height: 400 });
      expect(result.viewId).toBe("view_1");
    });

    it("passes windowId to WGPUView constructor", async () => {
      await manager.createView({ id: "view_wid", windowId: 99 });
      const ctorArgs = MockWGPUView.mock.calls[0][0] as { windowId: number };
      expect(ctorArgs.windowId).toBe(99);
    });

    it("returns existing view info when called with the same id (idempotent)", async () => {
      const first = await manager.createView({ id: "view_idem", windowId: 1 });
      const second = await manager.createView({ id: "view_idem", windowId: 1 });

      expect(MockWGPUView).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it("generates a unique id when no id is provided", async () => {
      const result = await manager.createView({ windowId: 1 });
      expect(result.id).toMatch(/^gpu_view_/);
    });
  });

  // ── destroyView ───────────────────────────────────────────────────────────

  describe("destroyView", () => {
    it("calls remove() on the view and removes it from the map", async () => {
      await manager.createView({ id: "view_destroy", windowId: 1 });
      const instance = MockWGPUView.mock.results[0].value;

      await manager.destroyView({ id: "view_destroy" });

      expect(instance.remove).toHaveBeenCalledTimes(1);
      const { views } = await manager.listViews();
      expect(views).toHaveLength(0);
    });

    it("does nothing when the view does not exist", async () => {
      await expect(
        manager.destroyView({ id: "nonexistent" }),
      ).resolves.toBeUndefined();
    });
  });

  // ── listViews ─────────────────────────────────────────────────────────────

  describe("listViews", () => {
    it("returns all tracked views", async () => {
      await manager.createView({ id: "view_list_a", windowId: 1 });
      await manager.createView({ id: "view_list_b", windowId: 1 });

      const { views } = await manager.listViews();
      expect(views).toHaveLength(2);
      expect(views.map((v) => v.id)).toContain("view_list_a");
      expect(views.map((v) => v.id)).toContain("view_list_b");
    });

    it("returns an empty array when no views exist", async () => {
      const { views } = await manager.listViews();
      expect(views).toHaveLength(0);
    });
  });
});
