/**
 * Tests for sandbox capability API routes.
 *
 * Tests the route handler logic with mocked SandboxManager.
 * Verifies all capability bridge endpoints: status, exec, browser,
 * screen/vision, audio/voice, computer use, platform info, capabilities.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxManager } from "../../services/sandbox-manager";
import { handleSandboxRoute } from "../sandbox-routes";
import { createMockReq, createMockRes } from "./sandbox-test-helpers";

function createMockManager(
  overrides: Partial<SandboxManager> = {},
): SandboxManager {
  return {
    getStatus: vi.fn().mockReturnValue({
      state: "ready",
      mode: "standard",
      containerId: "abc123",
      browserContainerId: null,
    }),
    getEventLog: vi
      .fn()
      .mockReturnValue([
        { timestamp: Date.now(), type: "state_change", detail: "ready" },
      ]),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "hello world\n",
      stderr: "",
      durationMs: 50,
      executedInSandbox: true,
    }),
    getBrowserCdpEndpoint: vi.fn().mockReturnValue("http://localhost:9222"),
    getBrowserWsEndpoint: vi.fn().mockReturnValue("ws://localhost:9222"),
    isReady: vi.fn().mockReturnValue(true),
    getMode: vi.fn().mockReturnValue("standard"),
    getState: vi.fn().mockReturnValue("ready"),
    ...overrides,
  } as unknown as SandboxManager;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("handleSandboxRoute", () => {
  let mgr: SandboxManager;

  beforeEach(() => {
    mgr = createMockManager();
  });

  describe("routing", () => {
    it("should return false for non-sandbox routes", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      const handled = await handleSandboxRoute(req, res, "/api/chat", "GET", {
        sandboxManager: mgr,
      });
      expect(handled).toBe(false);
    });

    it("should return 503 when manager is null", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/status", "GET", {
        sandboxManager: null,
      });
      expect(res._status).toBe(503);
    });
  });

  describe("GET /api/sandbox/status", () => {
    it("should return manager status", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/status", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.state).toBe("ready");
      expect(body.mode).toBe("standard");
    });
  });

  describe("GET /api/sandbox/events", () => {
    it("should return event log", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/events", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.events).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/sandbox/start", () => {
    it("should call start and return status", async () => {
      const req = createMockReq("POST");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/start", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      expect(mgr.start).toHaveBeenCalled();
    });

    it("should return 500 on start failure", async () => {
      mgr.start = vi
        .fn()
        .mockRejectedValue(
          new Error("Docker not found"),
        ) as SandboxManager["start"];
      const req = createMockReq("POST");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/start", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(500);
    });
  });

  describe("POST /api/sandbox/stop", () => {
    it("should call stop and return status", async () => {
      const req = createMockReq("POST");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/stop", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      expect(mgr.stop).toHaveBeenCalled();
    });
  });

  describe("POST /api/sandbox/recover", () => {
    it("should call recover and return status", async () => {
      const req = createMockReq("POST");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/recover", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      expect(mgr.recover).toHaveBeenCalled();
    });
  });

  describe("POST /api/sandbox/exec", () => {
    it("should execute command and return result", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ command: "echo hello" }),
      );
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/exec", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.stdout).toContain("hello");
      expect(body.executedInSandbox).toBe(true);
    });

    it("should return 400 for missing command", async () => {
      const req = createMockReq("POST", JSON.stringify({}));
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/exec", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
    });

    it("should return 400 for invalid JSON", async () => {
      const req = createMockReq("POST", "not json");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/exec", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
    });

    it("should return 422 for non-zero exit code", async () => {
      mgr.exec = vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "not found",
        durationMs: 10,
        executedInSandbox: true,
      }) as SandboxManager["exec"];
      const req = createMockReq("POST", JSON.stringify({ command: "false" }));
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/exec", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(422);
    });
  });

  describe("GET /api/sandbox/browser", () => {
    it("should return browser endpoints", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/browser", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.cdpEndpoint).toBe("http://localhost:9222");
      expect(body.wsEndpoint).toBe("ws://localhost:9222");
    });
  });

  describe("GET /api/sandbox/platform", () => {
    it("should return platform info without requiring manager", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      // Pass null manager — platform endpoint doesn't need it
      await handleSandboxRoute(req, res, "/api/sandbox/platform", "GET", {
        sandboxManager: null,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.platform).toBeTruthy();
      expect(body.arch).toBeTruthy();
      expect(typeof body.dockerAvailable).toBe("boolean");
    });
  });

  describe("GET /api/sandbox/capabilities", () => {
    it("should return capability detection results", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/capabilities", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.screenshot).toBeTruthy();
      expect(body.browser).toBeTruthy();
      expect(body.shell).toBeTruthy();
      expect(typeof body.screenshot.available).toBe("boolean");
    });
  });

  describe("Screen/Vision bridge", () => {
    it("POST /api/sandbox/screen/screenshot should attempt capture", async () => {
      const req = createMockReq("POST", "{}");
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/screen/screenshot",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      // Will return 200 with base64 data or 500 if no screenshot tool
      expect([200, 500]).toContain(res._status);
    });

    it("POST /api/sandbox/screen/screenshot should reject invalid region types", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ x: "1; rm -rf /", y: 0, width: 100, height: 100 }),
      );
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/screen/screenshot",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect(res._status).toBe(400);
    });

    it("GET /api/sandbox/screen/windows should list windows", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/screen/windows", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.windows).toBeInstanceOf(Array);
    });
  });

  describe("Audio/Voice bridge", () => {
    it("POST /api/sandbox/audio/record should handle request", async () => {
      const req = createMockReq("POST", JSON.stringify({ durationMs: 1000 }));
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/audio/record",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      // Will return 200 or 500 depending on audio tools
      expect([200, 500]).toContain(res._status);
    });

    it("POST /api/sandbox/audio/record should reject invalid JSON", async () => {
      const req = createMockReq("POST", "{durationMs:1000}");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/record", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
      expect(JSON.parse(res._body).error).toContain("Invalid JSON");
    });

    it("POST /api/sandbox/audio/record should reject non-object JSON", async () => {
      const req = createMockReq("POST", "123");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/record", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
      expect(JSON.parse(res._body).error).toContain(
        "Request body must be a JSON object",
      );
    });

    it("POST /api/sandbox/audio/record should reject non-finite duration", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ durationMs: Number.NaN }),
      );
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/record", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
      expect(JSON.parse(res._body).error).toContain(
        "durationMs must be a finite number",
      );
    });

    it("POST /api/sandbox/audio/record should reject oversized duration", async () => {
      const req = createMockReq("POST", JSON.stringify({ durationMs: 60000 }));
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/record", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
      expect(JSON.parse(res._body).error).toContain(
        "durationMs must be between",
      );
    });

    it("POST /api/sandbox/audio/play should require data field", async () => {
      const req = createMockReq("POST", JSON.stringify({}));
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/play", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
    });

    it("POST /api/sandbox/audio/play should reject invalid format characters", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({
          data: Buffer.from("abc").toString("base64"),
          format: "wav;$(touch /tmp/pwned)",
        }),
      );
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/play", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
    });

    it("POST /api/sandbox/audio/play should reject unsupported formats", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({
          data: Buffer.from("abc").toString("base64"),
          format: "exe",
        }),
      );
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/audio/play", "POST", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(400);
    });
  });

  describe("Computer use bridge", () => {
    it("POST /api/sandbox/computer/click should handle request", async () => {
      const req = createMockReq("POST", JSON.stringify({ x: 100, y: 200 }));
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/click",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      // Will succeed or fail depending on OS tools
      expect([200, 500]).toContain(res._status);
    });

    it("POST /api/sandbox/computer/click should reject invalid coordinates", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ x: "1; touch /tmp/pwned", y: 200 }),
      );
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/click",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect(res._status).toBe(400);
    });

    it("POST /api/sandbox/computer/type should handle request", async () => {
      const req = createMockReq("POST", JSON.stringify({ text: "hello" }));
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/type",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect([200, 500]).toContain(res._status);
    });

    it("POST /api/sandbox/computer/type should reject non-string text", async () => {
      const req = createMockReq("POST", JSON.stringify({ text: 123 }));
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/type",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect(res._status).toBe(400);
    });

    it("POST /api/sandbox/computer/keypress should handle request", async () => {
      const req = createMockReq("POST", JSON.stringify({ keys: "Return" }));
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/keypress",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect([200, 500]).toContain(res._status);
    });

    it("POST /api/sandbox/computer/keypress should reject unsafe characters", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ keys: "Return; $(touch /tmp/pwned)" }),
      );
      const res = createMockRes();
      const handled = await handleSandboxRoute(
        req,
        res,
        "/api/sandbox/computer/keypress",
        "POST",
        { sandboxManager: mgr },
      );
      expect(handled).toBe(true);
      expect(res._status).toBe(400);
    });
  });

  describe("Unknown routes", () => {
    it("should return 404 for unknown sandbox sub-routes", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      await handleSandboxRoute(req, res, "/api/sandbox/nonexistent", "GET", {
        sandboxManager: mgr,
      });
      expect(res._status).toBe(404);
    });
  });
});
