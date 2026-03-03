/**
 * Dedicated boundary tests for CUA (Computer Use Agent) route handlers,
 * service utilities, and security permissions. Covers hasCuaConfig(),
 * resolveHost(), resolvePort(), parseBooleanValue(), compactCuaStep/Result(),
 * handleCuaRoute(), and CUA permission mapping.
 *
 * @see https://github.com/milady-ai/milaidy/issues/590
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROVIDER_PLUGINS } from "../config/plugin-auto-enable";
import {
  getRequiredPermissions,
  SYSTEM_PERMISSIONS,
} from "../permissions/registry";
import { OPTIONAL_CORE_PLUGINS } from "../runtime/core-plugins";
import {
  createEnvSandbox,
  createMockHttpResponse,
  createMockIncomingMessage,
  createMockJsonRequest,
} from "../test-support/test-helpers";
import { handleCuaRoute } from "./cua-routes";
import type { BenchmarkSession, CuaServiceLike } from "./server-utils";
import {
  compactCuaResult,
  compactCuaStep,
  DEFAULT_HOST,
  DEFAULT_PORT,
  hasCuaConfig,
  parseBooleanValue,
  resolveHost,
  resolvePort,
} from "./server-utils";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockCuaService(
  overrides: Partial<CuaServiceLike> = {},
): CuaServiceLike {
  return {
    runTask: vi.fn().mockResolvedValue({ status: "completed", steps: [] }),
    approveLatest: vi
      .fn()
      .mockResolvedValue({ status: "completed", steps: [] }),
    cancelLatest: vi.fn().mockResolvedValue(undefined),
    screenshotBase64: vi.fn().mockResolvedValue("iVBORw0KGgo="),
    getStatus: vi.fn().mockReturnValue({ running: false }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 1: hasCuaConfig()
// ---------------------------------------------------------------------------

describe("hasCuaConfig", () => {
  const envKeys = [
    "CUA_HOST",
    "CUA_API_KEY",
    "CUA_SANDBOX_NAME",
    "CUA_CONTAINER_NAME",
  ] as const;

  const sandbox = createEnvSandbox(envKeys);

  beforeEach(() => sandbox.clear());
  afterEach(() => sandbox.restore());

  it("returns false when no CUA env vars are set", () => {
    expect(hasCuaConfig()).toBe(false);
  });

  it("returns true for local mode (CUA_HOST only)", () => {
    process.env.CUA_HOST = "http://localhost:6080";
    expect(hasCuaConfig()).toBe(true);
  });

  it("returns true for cloud mode (CUA_API_KEY + CUA_SANDBOX_NAME)", () => {
    process.env.CUA_API_KEY = "test-key";
    process.env.CUA_SANDBOX_NAME = "sandbox-1";
    expect(hasCuaConfig()).toBe(true);
  });

  it("returns true for cloud mode (CUA_API_KEY + CUA_CONTAINER_NAME)", () => {
    process.env.CUA_API_KEY = "test-key";
    process.env.CUA_CONTAINER_NAME = "container-1";
    expect(hasCuaConfig()).toBe(true);
  });

  it("returns false for CUA_API_KEY alone (incomplete cloud config)", () => {
    process.env.CUA_API_KEY = "test-key";
    expect(hasCuaConfig()).toBe(false);
  });

  it("returns false for CUA_SANDBOX_NAME alone (no API key)", () => {
    process.env.CUA_SANDBOX_NAME = "sandbox-1";
    expect(hasCuaConfig()).toBe(false);
  });

  it("returns false when CUA_HOST is whitespace-only", () => {
    process.env.CUA_HOST = "   ";
    expect(hasCuaConfig()).toBe(false);
  });

  it("returns false when CUA_API_KEY is whitespace-only with sandbox set", () => {
    process.env.CUA_API_KEY = "  ";
    process.env.CUA_SANDBOX_NAME = "sandbox-1";
    expect(hasCuaConfig()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 2: resolveHost() loopback enforcement
// ---------------------------------------------------------------------------

describe("resolveHost", () => {
  const sandbox = createEnvSandbox(["MILADY_BENCH_HOST"]);

  beforeEach(() => sandbox.clear());
  afterEach(() => sandbox.restore());

  it("defaults to 127.0.0.1 when env is unset", () => {
    expect(resolveHost()).toBe("127.0.0.1");
  });

  it("accepts 127.0.0.1", () => {
    process.env.MILADY_BENCH_HOST = "127.0.0.1";
    expect(resolveHost()).toBe("127.0.0.1");
  });

  it("accepts ::1", () => {
    process.env.MILADY_BENCH_HOST = "::1";
    expect(resolveHost()).toBe("::1");
  });

  it("accepts localhost", () => {
    process.env.MILADY_BENCH_HOST = "localhost";
    expect(resolveHost()).toBe("localhost");
  });

  it("rejects 0.0.0.0 and falls back to default", () => {
    process.env.MILADY_BENCH_HOST = "0.0.0.0";
    expect(resolveHost()).toBe(DEFAULT_HOST);
  });

  it("rejects LAN IP and falls back to default", () => {
    process.env.MILADY_BENCH_HOST = "192.168.1.100";
    expect(resolveHost()).toBe(DEFAULT_HOST);
  });

  it("rejects external hostname and falls back to default", () => {
    process.env.MILADY_BENCH_HOST = "evil.example.com";
    expect(resolveHost()).toBe(DEFAULT_HOST);
  });
});

// ---------------------------------------------------------------------------
// Section 3: resolvePort()
// ---------------------------------------------------------------------------

describe("resolvePort", () => {
  const sandbox = createEnvSandbox(["MILADY_BENCH_PORT"]);

  beforeEach(() => sandbox.clear());
  afterEach(() => sandbox.restore());

  it("defaults to 3939 when env is unset", () => {
    expect(resolvePort()).toBe(DEFAULT_PORT);
  });

  it("parses a valid port number", () => {
    process.env.MILADY_BENCH_PORT = "8080";
    expect(resolvePort()).toBe(8080);
  });

  it("falls back to default for non-numeric input", () => {
    process.env.MILADY_BENCH_PORT = "not-a-port";
    expect(resolvePort()).toBe(DEFAULT_PORT);
  });

  it("falls back to default for port 0", () => {
    process.env.MILADY_BENCH_PORT = "0";
    expect(resolvePort()).toBe(DEFAULT_PORT);
  });

  it("falls back to default for port > 65535", () => {
    process.env.MILADY_BENCH_PORT = "70000";
    expect(resolvePort()).toBe(DEFAULT_PORT);
  });
});

// ---------------------------------------------------------------------------
// Section 4: parseBooleanValue()
// ---------------------------------------------------------------------------

describe("parseBooleanValue", () => {
  it("returns boolean value directly", () => {
    expect(parseBooleanValue(true)).toBe(true);
    expect(parseBooleanValue(false)).toBe(false);
  });

  it("returns true for non-zero numbers", () => {
    expect(parseBooleanValue(1)).toBe(true);
    expect(parseBooleanValue(-1)).toBe(true);
  });

  it("returns false for 0", () => {
    expect(parseBooleanValue(0)).toBe(false);
  });

  it("parses truthy strings (case-insensitive)", () => {
    for (const v of [
      "1",
      "true",
      "TRUE",
      "True",
      "yes",
      "YES",
      "y",
      "Y",
      "on",
      "ON",
    ]) {
      expect(parseBooleanValue(v)).toBe(true);
    }
  });

  it("parses falsy strings (case-insensitive)", () => {
    for (const v of [
      "0",
      "false",
      "FALSE",
      "False",
      "no",
      "NO",
      "n",
      "N",
      "off",
      "OFF",
    ]) {
      expect(parseBooleanValue(v)).toBe(false);
    }
  });

  it("trims whitespace before parsing", () => {
    expect(parseBooleanValue("  true  ")).toBe(true);
    expect(parseBooleanValue("  false  ")).toBe(false);
  });

  it("returns default for unrecognized values", () => {
    expect(parseBooleanValue("maybe")).toBe(false);
    expect(parseBooleanValue("maybe", true)).toBe(true);
    expect(parseBooleanValue(undefined)).toBe(false);
    expect(parseBooleanValue(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 5: compactCuaStep() + compactCuaResult()
// ---------------------------------------------------------------------------

describe("compactCuaStep", () => {
  it("strips screenshot when includeScreenshots is false", () => {
    const step = { action: "click", screenshotAfterBase64: "base64data" };
    const result = compactCuaStep(step, false);
    expect(result).not.toHaveProperty("screenshotAfterBase64");
    expect(result.hasScreenshot).toBe(true);
  });

  it("keeps screenshot when includeScreenshots is true", () => {
    const step = { action: "click", screenshotAfterBase64: "base64data" };
    const result = compactCuaStep(step, true);
    expect(result.screenshotAfterBase64).toBe("base64data");
    expect(result.hasScreenshot).toBe(true);
  });

  it("sets hasScreenshot to false when no screenshot present", () => {
    const step = { action: "click" };
    const result = compactCuaStep(step, false);
    expect(result.hasScreenshot).toBe(false);
  });

  it("wraps non-record values", () => {
    const result = compactCuaStep("not-a-record", false);
    expect(result).toEqual({ step: "not-a-record" });
  });

  it("wraps null values", () => {
    const result = compactCuaStep(null, false);
    expect(result).toEqual({ step: null });
  });
});

describe("compactCuaResult", () => {
  it("compacts completed result with steps", () => {
    const input = {
      status: "completed",
      steps: [{ action: "click", screenshotAfterBase64: "img" }],
    };
    const result = compactCuaResult(input, false);
    expect(result.status).toBe("completed");
    expect((result.steps as unknown[])[0]).not.toHaveProperty(
      "screenshotAfterBase64",
    );
  });

  it("compacts failed result with steps", () => {
    const input = {
      status: "failed",
      steps: [{ action: "type", screenshotAfterBase64: "img" }],
      error: "timeout",
    };
    const result = compactCuaResult(input, false);
    expect(result.status).toBe("failed");
    expect(result.error).toBe("timeout");
  });

  it("handles paused_for_approval with pending field", () => {
    const input = {
      status: "paused_for_approval",
      pending: {
        reason: "needs approval",
        screenshotBeforeBase64: "before-img",
        stepsSoFar: [{ action: "navigate", screenshotAfterBase64: "ss" }],
      },
    };
    const result = compactCuaResult(input, false);
    expect(result.status).toBe("paused_for_approval");
    const pending = result.pending as Record<string, unknown>;
    expect(pending).not.toHaveProperty("screenshotBeforeBase64");
    expect(pending.hasScreenshotBefore).toBe(true);
  });

  it("returns unknown status for non-record input", () => {
    const result = compactCuaResult("bad-input", false);
    expect(result.status).toBe("unknown");
    expect(result.raw).toBe("bad-input");
  });
});

// ---------------------------------------------------------------------------
// Section 6: handleCuaRoute() route handlers
// ---------------------------------------------------------------------------

describe("handleCuaRoute", () => {
  // -- GET /status -----------------------------------------------------------

  describe("GET /api/benchmark/cua/status", () => {
    it("returns 503 when service is null", async () => {
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/status",
      });
      const { res, getStatus, getJson } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/status",
        req,
        res,
        getCuaService: () => null,
        activeSession: null,
      });

      expect(handled).toBe(true);
      expect(getStatus()).toBe(503);
      expect(getJson()).toHaveProperty("ok", false);
    });

    it("returns 200 with status from service", async () => {
      const service = createMockCuaService({
        getStatus: vi.fn().mockReturnValue({ running: true, task: "browse" }),
      });
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/status",
      });
      const { res, getStatus, getJson } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/status",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(getJson()).toMatchObject({ ok: true, status: { running: true } });
    });

    it("returns 500 on service throw", async () => {
      const service = createMockCuaService({
        getStatus: vi.fn().mockImplementation(() => {
          throw new Error("status boom");
        }),
      });
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/status",
      });
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/status",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(500);
      expect(getJson()).toHaveProperty("error", "status boom");
    });
  });

  // -- GET /screenshot -------------------------------------------------------

  describe("GET /api/benchmark/cua/screenshot", () => {
    it("returns 503 when service is null", async () => {
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/screenshot",
      });
      const { res, getStatus } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/screenshot",
        req,
        res,
        getCuaService: () => null,
        activeSession: null,
      });

      expect(handled).toBe(true);
      expect(getStatus()).toBe(503);
    });

    it("returns 200 with base64 screenshot", async () => {
      const service = createMockCuaService({
        screenshotBase64: vi.fn().mockResolvedValue("iVBORw0KGgoAAAA=="),
      });
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/screenshot",
      });
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/screenshot",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(200);
      const body = getJson() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.screenshot).toBe("iVBORw0KGgoAAAA==");
      expect(body.mimeType).toBe("image/png");
    });

    it("returns 500 on service throw", async () => {
      const service = createMockCuaService({
        screenshotBase64: vi
          .fn()
          .mockRejectedValue(new Error("screenshot boom")),
      });
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/screenshot",
      });
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/screenshot",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(500);
      expect(getJson()).toHaveProperty("error", "screenshot boom");
    });
  });

  // -- POST /run -------------------------------------------------------------

  describe("POST /api/benchmark/cua/run", () => {
    it("returns 503 when service is null", async () => {
      const req = createMockJsonRequest(
        { goal: "test goal" },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getStatus } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => null,
        activeSession: null,
      });

      expect(handled).toBe(true);
      expect(getStatus()).toBe(503);
    });

    it("returns 400 for missing goal", async () => {
      const service = createMockCuaService();
      const req = createMockJsonRequest(
        {},
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(400);
      expect(getJson()).toHaveProperty("error");
    });

    it("returns 400 for empty goal string", async () => {
      const service = createMockCuaService();
      const req = createMockJsonRequest(
        { goal: "   " },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getStatus } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(400);
    });

    it("uses roomId from body when provided", async () => {
      const service = createMockCuaService();
      const req = createMockJsonRequest(
        { goal: "browse web", roomId: "custom-room-123" },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(service.runTask).toHaveBeenCalledWith(
        "custom-room-123",
        "browse web",
      );
    });

    it("uses session roomId as fallback", async () => {
      const service = createMockCuaService();
      const session = { roomId: "session-room" } as BenchmarkSession;
      const req = createMockJsonRequest(
        { goal: "browse web" },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: session,
      });

      expect(service.runTask).toHaveBeenCalledWith(
        "session-room",
        "browse web",
      );
    });

    it("accepts snake_case params (room_id, auto_approve)", async () => {
      const service = createMockCuaService();
      const req = createMockJsonRequest(
        { goal: "test", room_id: "snake-room", auto_approve: false },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      const body = getJson() as Record<string, unknown>;
      expect(body.room_id).toBe("snake-room");
      expect(body.auto_approve).toBe(false);
    });

    it("runs auto-approve loop when enabled", async () => {
      const service = createMockCuaService({
        runTask: vi.fn().mockResolvedValue({ status: "paused_for_approval" }),
        approveLatest: vi
          .fn()
          .mockResolvedValueOnce({ status: "paused_for_approval" })
          .mockResolvedValueOnce({ status: "completed", steps: [] }),
      });
      const req = createMockJsonRequest(
        { goal: "auto task", autoApprove: true },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      const body = getJson() as Record<string, unknown>;
      expect(body.approvals).toBe(2);
      expect(service.approveLatest).toHaveBeenCalledTimes(2);
    });

    it("caps auto-approve loop at maxApprovals", async () => {
      const service = createMockCuaService({
        runTask: vi.fn().mockResolvedValue({ status: "paused_for_approval" }),
        approveLatest: vi
          .fn()
          .mockResolvedValue({ status: "paused_for_approval" }),
      });
      const req = createMockJsonRequest(
        { goal: "capped task", autoApprove: true, maxApprovals: 2 },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      const body = getJson() as Record<string, unknown>;
      expect(body.approvals).toBe(2);
      expect(service.approveLatest).toHaveBeenCalledTimes(2);
    });

    it("returns 500 on service throw", async () => {
      const service = createMockCuaService({
        runTask: vi.fn().mockRejectedValue(new Error("run boom")),
      });
      const req = createMockJsonRequest(
        { goal: "test" },
        { method: "POST", url: "/api/benchmark/cua/run" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/run",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(500);
      expect(getJson()).toHaveProperty("error", "run boom");
    });
  });

  // -- POST /approve ---------------------------------------------------------

  describe("POST /api/benchmark/cua/approve", () => {
    it("returns 503 when service is null", async () => {
      const req = createMockJsonRequest(
        {},
        { method: "POST", url: "/api/benchmark/cua/approve" },
      );
      const { res, getStatus } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/approve",
        req,
        res,
        getCuaService: () => null,
        activeSession: null,
      });

      expect(getStatus()).toBe(503);
    });

    it("returns 200 with result on success", async () => {
      const service = createMockCuaService({
        approveLatest: vi
          .fn()
          .mockResolvedValue({ status: "completed", steps: [] }),
      });
      const req = createMockJsonRequest(
        { roomId: "room-1" },
        { method: "POST", url: "/api/benchmark/cua/approve" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/approve",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(200);
      const body = getJson() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.room_id).toBe("room-1");
    });

    it("returns 500 on service throw", async () => {
      const service = createMockCuaService({
        approveLatest: vi.fn().mockRejectedValue(new Error("approve boom")),
      });
      const req = createMockJsonRequest(
        {},
        { method: "POST", url: "/api/benchmark/cua/approve" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/approve",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(500);
      expect(getJson()).toHaveProperty("error", "approve boom");
    });
  });

  // -- POST /cancel ----------------------------------------------------------

  describe("POST /api/benchmark/cua/cancel", () => {
    it("returns 503 when service is null", async () => {
      const req = createMockJsonRequest(
        {},
        { method: "POST", url: "/api/benchmark/cua/cancel" },
      );
      const { res, getStatus } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/cancel",
        req,
        res,
        getCuaService: () => null,
        activeSession: null,
      });

      expect(getStatus()).toBe(503);
    });

    it("returns 200 with cancelled status", async () => {
      const service = createMockCuaService();
      const req = createMockJsonRequest(
        { room_id: "cancel-room" },
        { method: "POST", url: "/api/benchmark/cua/cancel" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/cancel",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(200);
      const body = getJson() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.status).toBe("cancelled");
      expect(body.room_id).toBe("cancel-room");
    });

    it("returns 500 on service throw", async () => {
      const service = createMockCuaService({
        cancelLatest: vi.fn().mockRejectedValue(new Error("cancel boom")),
      });
      const req = createMockJsonRequest(
        {},
        { method: "POST", url: "/api/benchmark/cua/cancel" },
      );
      const { res, getStatus, getJson } = createMockHttpResponse();

      await handleCuaRoute({
        pathname: "/api/benchmark/cua/cancel",
        req,
        res,
        getCuaService: () => service,
        activeSession: null,
      });

      expect(getStatus()).toBe(500);
      expect(getJson()).toHaveProperty("error", "cancel boom");
    });
  });

  // -- Route matching --------------------------------------------------------

  describe("route matching", () => {
    it("returns false for unknown path", async () => {
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/benchmark/cua/unknown",
      });
      const { res } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/unknown",
        req,
        res,
        getCuaService: () => createMockCuaService(),
        activeSession: null,
      });

      expect(handled).toBe(false);
    });

    it("returns false for wrong HTTP method", async () => {
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/benchmark/cua/status",
      });
      const { res } = createMockHttpResponse();

      const handled = await handleCuaRoute({
        pathname: "/api/benchmark/cua/status",
        req,
        res,
        getCuaService: () => createMockCuaService(),
        activeSession: null,
      });

      expect(handled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Section 7: CUA permission + mapping
// ---------------------------------------------------------------------------

describe("CUA permission and plugin mapping", () => {
  it("CUA requires accessibility and screen-recording permissions", () => {
    const perms = getRequiredPermissions("cua");
    expect(perms).toContain("accessibility");
    expect(perms).toContain("screen-recording");
    expect(perms).toHaveLength(2);
  });

  it("accessibility permission is darwin-only", () => {
    const perm = SYSTEM_PERMISSIONS.find((p) => p.id === "accessibility");
    expect(perm?.platforms).toEqual(["darwin"]);
  });

  it("screen-recording permission is darwin-only", () => {
    const perm = SYSTEM_PERMISSIONS.find((p) => p.id === "screen-recording");
    expect(perm?.platforms).toEqual(["darwin"]);
  });

  it("@elizaos/plugin-cua is in OPTIONAL_CORE_PLUGINS", () => {
    expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-cua");
  });

  it("AUTH_PROVIDER_PLUGINS maps both CUA_API_KEY and CUA_HOST to CUA plugin", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_API_KEY).toBe("@elizaos/plugin-cua");
    expect(AUTH_PROVIDER_PLUGINS.CUA_HOST).toBe("@elizaos/plugin-cua");
  });
});
