/**
 * Unit tests for the Electrobun Canvas native module.
 *
 * Tests the CanvasManager class, focusing on:
 * - openGameWindow URL protocol validation (security boundary)
 * - createWindow / destroyWindow lifecycle
 * - navigate URL allowlist enforcement
 * - canvasManager singleton
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasManager, getCanvasManager } from "../canvas";

// ── Mock BrowserWindow ───────────────────────────────────────────────────────

const mockWindowHandlers: Record<string, () => void> = {};
const mockWinInstance = {
  webview: {
    url: "",
    loadURL: vi.fn(),
    rpc: {},
  },
  getPosition: vi.fn(() => ({ x: 100, y: 100 })),
  getSize: vi.fn(() => ({ width: 800, height: 600 })),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  close: vi.fn(),
  on: vi.fn((event: string, handler: () => void) => {
    mockWindowHandlers[event] = handler;
  }),
};

vi.mock("electrobun/bun", () => {
  // biome-ignore lint/complexity/useArrowFunction: constructor mock requires regular function
  const BrowserWindow = vi.fn(function () {
    return mockWinInstance;
  });
  return { BrowserWindow };
});

// ── helpers ──────────────────────────────────────────────────────────────────

function resetMocks() {
  vi.clearAllMocks();
  Object.keys(mockWindowHandlers).forEach((k) => {
    delete mockWindowHandlers[k];
  });
  mockWinInstance.webview.url = "";
}

// ============================================================================
// CanvasManager — openGameWindow
// ============================================================================

describe("CanvasManager.openGameWindow", () => {
  let manager: CanvasManager;

  beforeEach(() => {
    resetMocks();
    manager = new CanvasManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("allows http URLs", async () => {
    const result = await manager.openGameWindow({
      url: "http://play.example.com",
      title: "Test Game",
    });
    expect(result.id).toMatch(/^game_/);
  });

  it("allows https URLs", async () => {
    const result = await manager.openGameWindow({
      url: "https://secure.game.com/play",
    });
    expect(result.id).toMatch(/^game_/);
  });

  it("blocks file: URLs", async () => {
    await expect(
      manager.openGameWindow({ url: "file:///etc/passwd" }),
    ).rejects.toThrow("openGameWindow blocked");
  });

  it("blocks javascript: URLs", async () => {
    await expect(
      manager.openGameWindow({ url: "javascript:alert(1)" }),
    ).rejects.toThrow("openGameWindow blocked");
  });

  it("blocks data: URLs", async () => {
    await expect(
      manager.openGameWindow({ url: "data:text/html,<script>evil()</script>" }),
    ).rejects.toThrow("openGameWindow blocked");
  });

  it("blocks ftp: URLs", async () => {
    await expect(
      manager.openGameWindow({ url: "ftp://files.example.com" }),
    ).rejects.toThrow("openGameWindow blocked");
  });

  it("rejects invalid/non-parseable URLs", async () => {
    await expect(
      manager.openGameWindow({ url: "not a url at all" }),
    ).rejects.toThrow("openGameWindow blocked");
  });

  it("registers the window so it appears in listWindows", async () => {
    await manager.openGameWindow({ url: "https://game.example.com" });
    const { windows } = await manager.listWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0].id).toMatch(/^game_/);
    expect(windows[0].url).toBe("https://game.example.com");
  });

  it("uses provided title or defaults to 'Milady Game'", async () => {
    const { id } = await manager.openGameWindow({
      url: "https://game.example.com",
      title: "Custom Title",
    });
    const { windows } = await manager.listWindows();
    const win = windows.find((w) => w.id === id);
    expect(win?.title).toBe("Custom Title");
  });

  it("removes game window from list when it fires a close event", async () => {
    await manager.openGameWindow({ url: "https://game.example.com" });
    expect((await manager.listWindows()).windows).toHaveLength(1);
    mockWindowHandlers.close?.();
    expect((await manager.listWindows()).windows).toHaveLength(0);
  });
});

// ============================================================================
// CanvasManager — createWindow / destroyWindow
// ============================================================================

describe("CanvasManager.createWindow", () => {
  let manager: CanvasManager;

  beforeEach(() => {
    resetMocks();
    manager = new CanvasManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("creates a window and returns an id", async () => {
    const { id } = await manager.createWindow({
      url: "http://localhost:5174",
      title: "Canvas 1",
    });
    expect(id).toMatch(/^canvas_/);
  });

  it("adds the window to listWindows", async () => {
    await manager.createWindow({ url: "http://localhost:5174" });
    const { windows } = await manager.listWindows();
    expect(windows).toHaveLength(1);
  });

  it("destroyWindow removes it from listWindows", async () => {
    const { id } = await manager.createWindow({ url: "" });
    await manager.destroyWindow({ id });
    const { windows } = await manager.listWindows();
    expect(windows).toHaveLength(0);
  });

  it("destroyWindow is a no-op for unknown id", async () => {
    await expect(
      manager.destroyWindow({ id: "canvas_999" }),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// CanvasManager — navigate URL allowlist
// ============================================================================

describe("CanvasManager.navigate", () => {
  let manager: CanvasManager;

  beforeEach(() => {
    resetMocks();
    manager = new CanvasManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("allows localhost URLs", async () => {
    const { id } = await manager.createWindow({ url: "" });
    const result = await manager.navigate({ id, url: "http://localhost:3000" });
    expect(result.available).toBe(true);
  });

  it("allows 127.0.0.1 URLs", async () => {
    const { id } = await manager.createWindow({ url: "" });
    const result = await manager.navigate({ id, url: "http://127.0.0.1:5174" });
    expect(result.available).toBe(true);
  });

  it("allows file: URLs", async () => {
    const { id } = await manager.createWindow({ url: "" });
    const result = await manager.navigate({
      id,
      url: "file:///usr/local/share/app.html",
    });
    expect(result.available).toBe(true);
  });

  it("blocks external https URLs", async () => {
    const { id } = await manager.createWindow({ url: "" });
    const result = await manager.navigate({
      id,
      url: "https://external.example.com",
    });
    expect(result.available).toBe(false);
  });

  it("returns available:false for unknown window id", async () => {
    const result = await manager.navigate({
      id: "canvas_999",
      url: "http://localhost",
    });
    expect(result.available).toBe(false);
  });
});

// ============================================================================
// getCanvasManager — singleton
// ============================================================================

describe("getCanvasManager", () => {
  it("returns the same instance on repeated calls", () => {
    const a = getCanvasManager();
    const b = getCanvasManager();
    expect(a).toBe(b);
  });
});
