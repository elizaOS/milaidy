/**
 * Route dispatcher and handler tests
 *
 * Covers path traversal validation, concurrency cap, CRUD endpoints,
 * workspace endpoints, route dispatch, body parsing, and service availability.
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import { EventEmitter } from "node:events";
import * as os from "node:os";
import * as path from "node:path";

import type { RouteContext } from "../api/routes.js";

const { handleCodingAgentRoutes } = await import("../api/routes.js");

// ---------------------------------------------------------------------------
// Mock request / response helpers
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
  // Simulate body — use setTimeout(0) so the data/end events fire after all
  // microtasks (awaits) in the route dispatcher have settled and parseBody
  // has attached its listeners.
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
    end: jest.fn(),
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
// Mock services
// ---------------------------------------------------------------------------

const createMockPTYService = () => ({
  checkAvailableAgents: jest.fn().mockResolvedValue([]),
  getAgentMetrics: jest.fn().mockReturnValue({}),
  listSessions: jest.fn().mockResolvedValue([]),
  spawnSession: jest.fn().mockResolvedValue({
    id: "s1",
    agentType: "claude",
    workdir: "/w",
    status: "starting",
  }),
  getSession: jest.fn(),
  sendToSession: jest.fn(),
  sendKeysToSession: jest.fn(),
  stopSession: jest.fn(),
  getSessionOutput: jest.fn().mockResolvedValue("output text"),
  getWorkspaceFiles: jest.fn().mockReturnValue([]),
  getMemoryFilePath: jest.fn().mockReturnValue("CLAUDE.md"),
  getApprovalConfig: jest.fn().mockReturnValue({}),
});

const createMockWorkspaceService = () => ({
  provisionWorkspace: jest.fn().mockResolvedValue({
    id: "w1",
    path: "/ws",
    branch: "main",
    isWorktree: false,
  }),
  getStatus: jest.fn().mockResolvedValue({
    branch: "main",
    clean: true,
    modified: [],
    staged: [],
    untracked: [],
  }),
  commit: jest.fn().mockResolvedValue("abc123"),
  push: jest.fn().mockResolvedValue(undefined),
  createPR: jest.fn().mockResolvedValue({
    number: 1,
    url: "https://github.com/owner/repo/pull/1",
  }),
  removeWorkspace: jest.fn().mockResolvedValue(undefined),
  listIssues: jest.fn().mockResolvedValue([]),
  createIssue: jest.fn().mockResolvedValue({
    number: 42,
    title: "test",
    url: "https://...",
  }),
  getIssue: jest.fn().mockResolvedValue({
    number: 42,
    title: "test",
    body: "",
    labels: [],
    url: "...",
  }),
  addComment: jest.fn().mockResolvedValue({ url: "https://..." }),
  closeIssue: jest.fn().mockResolvedValue({ number: 42, title: "test" }),
});

// biome-ignore lint/suspicious/noExplicitAny: test mock for IAgentRuntime
const createMockRuntime = (): any => ({
  getSetting: jest.fn(),
  getService: jest.fn().mockReturnValue(undefined),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    runtime: createMockRuntime(),
    // biome-ignore lint/suspicious/noExplicitAny: mock service
    ptyService: createMockPTYService() as any,
    // biome-ignore lint/suspicious/noExplicitAny: mock service
    workspaceService: createMockWorkspaceService() as any,
    ...overrides,
  };
}

/** Typed accessor for mock methods on service objects */
// biome-ignore lint/suspicious/noExplicitAny: accessing mock internals in tests
const asMock = (obj: unknown): any => obj;

const WORKSPACE_BASE = path.join(os.homedir(), ".milaidy", "workspaces");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleCodingAgentRoutes", () => {
  let ctx: RouteContext;

  beforeEach(() => {
    ctx = makeCtx();
  });

  // =========================================================================
  // 1. Spawn — path traversal validation
  // =========================================================================
  describe("spawn - path traversal validation", () => {
    it("rejects workdir outside allowed paths with 403", async () => {
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: "/etc/passwd",
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(403);
      expect(res._getJson().error).toContain("workdir must be within");
    });

    it("accepts workdir inside workspace base directory with 201", async () => {
      const validDir = path.join(WORKSPACE_BASE, "my-project");
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: validDir,
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(201);
      expect(res._getJson().sessionId).toBe("s1");
    });

    it("rejects workdir that shares prefix but crosses boundary", async () => {
      // e.g. /home/user/.milaidy/workspaces-evil — same prefix string but not
      // an actual subdirectory because it lacks the path separator.
      const evilDir = path.join(
        os.homedir(),
        ".milaidy",
        "workspaces-evil",
        "foo",
      );
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: evilDir,
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(403);
      expect(res._getJson().error).toContain("workdir must be within");
    });

    it("accepts workdir equal to cwd", async () => {
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: process.cwd(),
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(201);
    });
  });

  // =========================================================================
  // 2. Spawn — concurrency cap
  // =========================================================================
  describe("spawn - concurrency cap", () => {
    it("returns 429 when session limit is reached", async () => {
      const pty = asMock(ctx.ptyService);
      pty.listSessions.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({ id: `s${i}` })),
      );

      const validDir = path.join(WORKSPACE_BASE, "proj");
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: validDir,
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(429);
      expect(res._getJson().error).toContain("Concurrent session limit");
    });

    it("returns 201 when no sessions are active", async () => {
      const validDir = path.join(WORKSPACE_BASE, "proj");
      const req = createMockReq("POST", "/api/coding-agents/spawn", {
        agentType: "claude",
        workdir: validDir,
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(201);
    });
  });

  // =========================================================================
  // 3. List / get / stop / output endpoints
  // =========================================================================
  describe("list / get / stop / output", () => {
    it("GET /api/coding-agents returns session list", async () => {
      const pty = asMock(ctx.ptyService);
      pty.listSessions.mockResolvedValue([{ id: "s1" }]);

      const req = createMockReq("GET", "/api/coding-agents");
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents", ctx);

      expect(pty.listSessions).toHaveBeenCalled();
      expect(res._getStatus()).toBe(200);
      expect(res._getJson()).toEqual([{ id: "s1" }]);
    });

    it("GET /api/coding-agents/:id returns session", async () => {
      const pty = asMock(ctx.ptyService);
      pty.getSession.mockReturnValue({ id: "s1", status: "ready" });

      const req = createMockReq("GET", "/api/coding-agents/s1");
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/s1", ctx);

      expect(pty.getSession).toHaveBeenCalledWith("s1");
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().id).toBe("s1");
    });

    it("POST /api/coding-agents/:id/stop calls stopSession", async () => {
      const pty = asMock(ctx.ptyService);
      const req = createMockReq("POST", "/api/coding-agents/s1/stop");
      const res = createMockRes();

      await handleCodingAgentRoutes(
        req,
        res,
        "/api/coding-agents/s1/stop",
        ctx,
      );

      expect(pty.stopSession).toHaveBeenCalledWith("s1");
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().success).toBe(true);
    });

    it("GET /api/coding-agents/:id/output returns output", async () => {
      const pty = asMock(ctx.ptyService);
      const req = createMockReq("GET", "/api/coding-agents/s1/output?lines=50");
      const res = createMockRes();

      await handleCodingAgentRoutes(
        req,
        res,
        "/api/coding-agents/s1/output",
        ctx,
      );

      expect(pty.getSessionOutput).toHaveBeenCalledWith("s1", 50);
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().output).toBe("output text");
    });
  });

  // =========================================================================
  // 4. Workspace endpoints
  // =========================================================================
  describe("workspace endpoints", () => {
    it("POST /api/workspace/provision calls provisionWorkspace", async () => {
      const ws = asMock(ctx.workspaceService);
      const req = createMockReq("POST", "/api/workspace/provision", {
        repo: "owner/repo",
        baseBranch: "main",
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/workspace/provision", ctx);

      expect(ws.provisionWorkspace).toHaveBeenCalled();
      expect(res._getStatus()).toBe(201);
      expect(res._getJson().id).toBe("w1");
    });

    it("GET /api/workspace/:id calls getStatus", async () => {
      const ws = asMock(ctx.workspaceService);
      const req = createMockReq("GET", "/api/workspace/w1");
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/workspace/w1", ctx);

      expect(ws.getStatus).toHaveBeenCalledWith("w1");
      expect(res._getStatus()).toBe(200);
      expect(res._getJson().branch).toBe("main");
    });
  });

  // =========================================================================
  // 5. Route dispatch — unmatched route
  // =========================================================================
  describe("route dispatch", () => {
    it("returns false for unmatched routes", async () => {
      const req = createMockReq("GET", "/api/unknown");
      const res = createMockRes();

      const handled = await handleCodingAgentRoutes(
        req,
        res,
        "/api/unknown",
        ctx,
      );

      expect(handled).toBe(false);
      expect(res.writeHead).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Body parsing — invalid JSON
  // =========================================================================
  describe("body parsing", () => {
    it("returns 500 for invalid JSON body", async () => {
      const req = new EventEmitter() as Record<string, unknown>;
      req.method = "POST";
      req.url = "/api/coding-agents/spawn";
      req.headers = { host: "localhost:2138" };
      setTimeout(() => {
        req.emit("data", "not-valid-json{{{");
        req.emit("end");
      }, 0);

      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents/spawn", ctx);

      expect(res._getStatus()).toBe(500);
      expect(res._getJson().error).toContain("Invalid JSON");
    });
  });

  // =========================================================================
  // 7. Service unavailable
  // =========================================================================
  describe("service unavailable", () => {
    it("returns 503 when PTY service is null for agent routes", async () => {
      const ctxNoPTY = makeCtx({ ptyService: null });
      const req = createMockReq("GET", "/api/coding-agents");
      const res = createMockRes();

      await handleCodingAgentRoutes(req, res, "/api/coding-agents", ctxNoPTY);

      expect(res._getStatus()).toBe(503);
      expect(res._getJson().error).toContain("PTY Service not available");
    });

    it("returns 503 when workspace service is null for workspace routes", async () => {
      const ctxNoWS = makeCtx({ workspaceService: null });
      const req = createMockReq("POST", "/api/workspace/provision", {
        repo: "owner/repo",
      });
      const res = createMockRes();

      await handleCodingAgentRoutes(
        req,
        res,
        "/api/workspace/provision",
        ctxNoWS,
      );

      expect(res._getStatus()).toBe(503);
      expect(res._getJson().error).toContain("Workspace Service not available");
    });
  });
});
