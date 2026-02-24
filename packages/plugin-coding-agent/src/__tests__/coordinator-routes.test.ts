/**
 * Coordinator route handler tests
 *
 * Tests SSE endpoint, status/task queries, pending confirmations,
 * supervision level control, and service availability.
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import { EventEmitter } from "node:events";
import { handleCoordinatorRoutes } from "../api/coordinator-routes.js";
import type { RouteContext } from "../api/routes.js";

// ---------------------------------------------------------------------------
// Mock request / response helpers (same pattern as routes.test.ts)
// ---------------------------------------------------------------------------

function createMockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: test mock for IncomingMessage
): any {
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter needs dynamic props for mock
  const req: any = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:2138" };
  if (body) {
    setTimeout(() => {
      req.emit("data", JSON.stringify(body));
      req.emit("end");
    }, 0);
  } else {
    setTimeout(() => req.emit("end"), 0);
  }
  return req;
}

// biome-ignore lint/suspicious/noExplicitAny: test mock for ServerResponse
function createMockRes(): any {
  const res = {
    writeHead: jest.fn(),
    write: jest.fn().mockReturnValue(true),
    end: jest.fn(),
    on: jest.fn(),
    writableEnded: false,
    _getJson: function () {
      if (this.end.mock.calls.length > 0) {
        return JSON.parse(this.end.mock.calls[0][0]);
      }
      return null;
    },
    _getStatus: function () {
      if (this.writeHead.mock.calls.length > 0) {
        return this.writeHead.mock.calls[0][0];
      }
      return null;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Mock coordinator
// ---------------------------------------------------------------------------

const createMockCoordinator = () => ({
  getAllTaskContexts: jest.fn().mockReturnValue([]),
  getTaskContext: jest.fn(),
  getSupervisionLevel: jest.fn().mockReturnValue("autonomous"),
  setSupervisionLevel: jest.fn(),
  getPendingConfirmations: jest.fn().mockReturnValue([]),
  confirmDecision: jest.fn().mockResolvedValue(undefined),
  addSseClient: jest.fn().mockReturnValue(() => {}),
});

// biome-ignore lint/suspicious/noExplicitAny: test mock
const createMockRuntime = (): any => ({
  getSetting: jest.fn(),
});

function makeCtx(
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  overrides: Partial<RouteContext & { coordinator?: any }> = {},
  // biome-ignore lint/suspicious/noExplicitAny: test mock
): RouteContext & { coordinator?: any } {
  return {
    runtime: createMockRuntime(),
    ptyService: null,
    workspaceService: null,
    coordinator: createMockCoordinator(),
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
const asMock = (obj: unknown): any => obj;

const PREFIX = "/api/coding-agents/coordinator";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coordinator routes", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  // =========================================================================
  // Service availability
  // =========================================================================
  describe("service availability", () => {
    it("returns 503 when coordinator is not available", async () => {
      const ctxNoCoord = makeCtx({ coordinator: undefined });
      const req = createMockReq("GET", `${PREFIX}/status`);
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/status`,
        ctxNoCoord,
      );

      expect(res._getStatus()).toBe(503);
      expect(res._getJson().error).toContain("Coordinator not available");
    });

    it("returns false for non-coordinator paths", async () => {
      const req = createMockReq("GET", "/api/coding-agents");
      const res = createMockRes();

      const handled = await handleCoordinatorRoutes(
        req,
        res,
        "/api/coding-agents",
        ctx,
      );

      expect(handled).toBe(false);
    });
  });

  // =========================================================================
  // SSE endpoint
  // =========================================================================
  describe("GET /coordinator/events", () => {
    it("sets SSE headers and registers client", async () => {
      const req = createMockReq("GET", `${PREFIX}/events`);
      const res = createMockRes();

      const handled = await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/events`,
        ctx,
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "Content-Type": "text/event-stream",
        }),
      );
      expect(asMock(ctx.coordinator).addSseClient).toHaveBeenCalledWith(res);
    });
  });

  // =========================================================================
  // Status endpoint
  // =========================================================================
  describe("GET /coordinator/status", () => {
    it("returns status with supervision level and tasks", async () => {
      asMock(ctx.coordinator).getAllTaskContexts.mockReturnValue([
        {
          sessionId: "s-1",
          agentType: "claude",
          label: "test",
          originalTask: "Fix bug",
          workdir: "/w",
          status: "active",
          decisions: [{ timestamp: 1 }],
          autoResolvedCount: 2,
        },
      ]);

      const req = createMockReq("GET", `${PREFIX}/status`);
      const res = createMockRes();

      await handleCoordinatorRoutes(req, res, `${PREFIX}/status`, ctx);

      expect(res._getStatus()).toBe(200);
      const json = res._getJson();
      expect(json.supervisionLevel).toBe("autonomous");
      expect(json.taskCount).toBe(1);
      expect(json.tasks[0].sessionId).toBe("s-1");
      expect(json.tasks[0].decisionCount).toBe(1);
    });
  });

  // =========================================================================
  // Task context endpoint
  // =========================================================================
  describe("GET /coordinator/tasks/:sessionId", () => {
    it("returns task context for a known session", async () => {
      const task = {
        sessionId: "s-1",
        agentType: "claude",
        label: "test",
        originalTask: "Fix bug",
        workdir: "/w",
        status: "active",
        decisions: [],
        autoResolvedCount: 0,
      };
      asMock(ctx.coordinator).getTaskContext.mockReturnValue(task);

      const req = createMockReq("GET", `${PREFIX}/tasks/s-1`);
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/tasks/s-1`,
        ctx,
      );

      expect(res._getStatus()).toBe(200);
      expect(res._getJson().sessionId).toBe("s-1");
    });

    it("returns 404 for unknown session", async () => {
      asMock(ctx.coordinator).getTaskContext.mockReturnValue(undefined);

      const req = createMockReq("GET", `${PREFIX}/tasks/s-unknown`);
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/tasks/s-unknown`,
        ctx,
      );

      expect(res._getStatus()).toBe(404);
    });
  });

  // =========================================================================
  // Pending confirmations
  // =========================================================================
  describe("GET /coordinator/pending", () => {
    it("returns pending confirmations list", async () => {
      asMock(ctx.coordinator).getPendingConfirmations.mockReturnValue([
        {
          sessionId: "s-1",
          promptText: "Allow write?",
          llmDecision: {
            action: "respond",
            response: "y",
            reasoning: "Safe",
          },
          taskContext: {
            agentType: "claude",
            label: "test",
          },
          createdAt: Date.now(),
        },
      ]);

      const req = createMockReq("GET", `${PREFIX}/pending`);
      const res = createMockRes();

      await handleCoordinatorRoutes(req, res, `${PREFIX}/pending`, ctx);

      expect(res._getStatus()).toBe(200);
      const json = res._getJson();
      expect(json.length).toBe(1);
      expect(json[0].sessionId).toBe("s-1");
      expect(json[0].suggestedAction).toBe("respond");
    });
  });

  // =========================================================================
  // Confirm/reject
  // =========================================================================
  describe("POST /coordinator/confirm/:sessionId", () => {
    it("approves a pending decision", async () => {
      const req = createMockReq("POST", `${PREFIX}/confirm/s-1`, {
        approved: true,
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/confirm/s-1`,
        ctx,
      );

      expect(asMock(ctx.coordinator).confirmDecision).toHaveBeenCalledWith(
        "s-1",
        true,
        undefined,
      );
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().approved).toBe(true);
    });

    it("rejects a pending decision", async () => {
      const req = createMockReq("POST", `${PREFIX}/confirm/s-1`, {
        approved: false,
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/confirm/s-1`,
        ctx,
      );

      expect(asMock(ctx.coordinator).confirmDecision).toHaveBeenCalledWith(
        "s-1",
        false,
        undefined,
      );
    });

    it("passes override to confirmDecision", async () => {
      const req = createMockReq("POST", `${PREFIX}/confirm/s-1`, {
        approved: true,
        override: { response: "n" },
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/confirm/s-1`,
        ctx,
      );

      expect(asMock(ctx.coordinator).confirmDecision).toHaveBeenCalledWith(
        "s-1",
        true,
        { response: "n" },
      );
    });

    it("returns 404 when no pending decision exists", async () => {
      asMock(ctx.coordinator).confirmDecision.mockImplementation(() => {
        throw new Error("No pending decision for session s-1");
      });

      const req = createMockReq("POST", `${PREFIX}/confirm/s-1`, {
        approved: true,
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/confirm/s-1`,
        ctx,
      );

      expect(res._getStatus()).toBe(404);
    });
  });

  // =========================================================================
  // Supervision level
  // =========================================================================
  describe("supervision level", () => {
    it("GET returns current level", async () => {
      const req = createMockReq("GET", `${PREFIX}/supervision`);
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/supervision`,
        ctx,
      );

      expect(res._getStatus()).toBe(200);
      expect(res._getJson().level).toBe("autonomous");
    });

    it("POST sets the supervision level", async () => {
      const req = createMockReq("POST", `${PREFIX}/supervision`, {
        level: "confirm",
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/supervision`,
        ctx,
      );

      expect(asMock(ctx.coordinator).setSupervisionLevel).toHaveBeenCalledWith(
        "confirm",
      );
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().level).toBe("confirm");
    });

    it("POST rejects invalid level", async () => {
      const req = createMockReq("POST", `${PREFIX}/supervision`, {
        level: "yolo",
      });
      const res = createMockRes();

      await handleCoordinatorRoutes(
        req,
        res,
        `${PREFIX}/supervision`,
        ctx,
      );

      expect(res._getStatus()).toBe(400);
      expect(res._getJson().error).toContain("Invalid supervision level");
    });
  });
});
