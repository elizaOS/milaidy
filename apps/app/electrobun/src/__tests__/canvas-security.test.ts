import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for canvas.eval() URL allowlist security guard.
 *
 * The CanvasManager.eval() method must only execute JavaScript on internal
 * URLs (localhost, file://, about:blank). External URLs must be blocked
 * to prevent arbitrary script execution on untrusted origins.
 */

// Mock electrobun/bun so we can control BrowserWindow behavior
vi.mock("electrobun/bun", () => ({
  BrowserWindow: vi.fn(),
}));

// biome-ignore lint/suspicious/noExplicitAny: test helper for private access
type AnyCanvas = any;

// We need to import after mocks are set up
const { CanvasManager } = await import("../native/canvas");

/**
 * Injects a fake canvas window into the manager's internal map
 * with a controlled webview.url value, so we can test the URL check
 * without creating real BrowserWindow instances.
 */
function injectFakeCanvas(manager: AnyCanvas, id: string, url: string): void {
  const mockEvalFn = vi.fn().mockResolvedValue("ok");
  const fakeCanvas = {
    id,
    window: {
      webview: {
        url,
        rpc: {
          requestProxy: {
            evaluateJavascriptWithResponse: mockEvalFn,
          },
        },
      },
    },
    url,
    title: "Test Canvas",
  };
  // Access private windows map
  (manager as AnyCanvas).windows.set(id, fakeCanvas);
}

describe("CanvasManager.eval() URL allowlist", () => {
  let manager: InstanceType<typeof CanvasManager>;

  beforeEach(() => {
    manager = new CanvasManager();
  });

  describe("internal URLs (allowed)", () => {
    it("allows http://localhost", async () => {
      injectFakeCanvas(manager, "c1", "http://localhost");
      const result = await manager.eval({ id: "c1", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows http://localhost:3000", async () => {
      injectFakeCanvas(manager, "c2", "http://localhost:3000");
      const result = await manager.eval({ id: "c2", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows https://localhost", async () => {
      injectFakeCanvas(manager, "c3", "https://localhost");
      const result = await manager.eval({ id: "c3", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows https://localhost:8080", async () => {
      injectFakeCanvas(manager, "c4", "https://localhost:8080");
      const result = await manager.eval({ id: "c4", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows file:// URLs", async () => {
      injectFakeCanvas(manager, "c5", "file:///Users/test/index.html");
      const result = await manager.eval({ id: "c5", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows about:blank", async () => {
      injectFakeCanvas(manager, "c6", "about:blank");
      const result = await manager.eval({ id: "c6", script: "1+1" });
      expect(result).toBe("ok");
    });

    it("allows empty URL (no navigation yet)", async () => {
      injectFakeCanvas(manager, "c7", "");
      const result = await manager.eval({ id: "c7", script: "1+1" });
      expect(result).toBe("ok");
    });
  });

  describe("external URLs (blocked)", () => {
    it("blocks http://example.com", async () => {
      injectFakeCanvas(manager, "c10", "http://example.com");
      await expect(
        manager.eval({ id: "c10", script: "document.cookie" }),
      ).rejects.toThrow("canvas:eval blocked");
    });

    it("blocks https://evil.com", async () => {
      injectFakeCanvas(manager, "c11", "https://evil.com");
      await expect(
        manager.eval({ id: "c11", script: "document.cookie" }),
      ).rejects.toThrow("canvas:eval blocked");
    });

    it("blocks http://google.com", async () => {
      injectFakeCanvas(manager, "c12", "http://google.com");
      await expect(manager.eval({ id: "c12", script: "1+1" })).rejects.toThrow(
        "canvas:eval blocked",
      );
    });

    it("blocks https://attacker.com/path", async () => {
      injectFakeCanvas(manager, "c13", "https://attacker.com/path?q=1");
      await expect(manager.eval({ id: "c13", script: "1+1" })).rejects.toThrow(
        "canvas:eval blocked",
      );
    });
  });

  describe("edge cases (hostname spoofing attempts)", () => {
    it("blocks http://localhost.evil.com (subdomain spoof)", async () => {
      injectFakeCanvas(manager, "c20", "http://localhost.evil.com");
      // The URL allowlist now uses hostname parsing (hostname === "localhost"),
      // so subdomain spoofs are correctly blocked.
      await expect(
        manager.eval({ id: "c20", script: "1+1" }),
      ).rejects.toThrow();
    });

    it("blocks http://localhost@external.com (credential-based spoof)", async () => {
      injectFakeCanvas(manager, "c21", "http://localhost@external.com");
      // The URL allowlist uses URL parsing: the actual hostname is external.com,
      // so the credential-based spoof is correctly blocked.
      await expect(
        manager.eval({ id: "c21", script: "1+1" }),
      ).rejects.toThrow();
    });
  });

  describe("non-existent canvas", () => {
    it("returns null for unknown canvas id", async () => {
      const result = await manager.eval({
        id: "nonexistent",
        script: "1+1",
      });
      expect(result).toBeNull();
    });
  });
});
