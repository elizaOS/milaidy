import dns from "node:dns";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDatabaseRoute } from "./database.js";

// Mock dependencies
vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({}),
  saveMilaidyConfig: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock dns.lookup
vi.mock("node:dns", () => ({
  default: {
    lookup: vi.fn(),
  },
  lookup: vi.fn(),
}));

// Mock pg
vi.mock("pg", () => ({
  default: {
    Pool: class {
      connect() {
        return { query: () => ({ rows: [] }), release: () => {} };
      }
      end() {}
    },
  },
  Pool: class {
    connect() {
      return { query: () => ({ rows: [] }), release: () => {} };
    }
    end() {}
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  sql: {
    raw: (s: string) => s,
  },
}));

function createMocks(method = "GET", url = "/", body: unknown = null) {
  const req = new EventEmitter() as unknown as IncomingMessage;
  req.headers = { host: "localhost:2138" };
  req.url = url;
  req.method = method;

  // Simulate body
  setTimeout(() => {
    if (body) {
      req.emit("data", Buffer.from(JSON.stringify(body)));
    }
    req.emit("end");
  }, 1);

  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  return { req, res };
}

describe("handleDatabaseRoute Security", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default DNS mock behavior: valid IP
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (hostname, options, callback) => {
        const cb = typeof options === "function" ? options : callback;
        if (hostname === "google.com") {
          cb(null, [{ address: "8.8.8.8", family: 4 }]);
        } else if (hostname === "metadata.internal") {
          cb(null, [{ address: "169.254.169.254", family: 4 }]);
        } else {
          // Default to resolving to itself if it looks like an IP, or 1.1.1.1
          cb(null, [
            {
              address: hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
                ? hostname
                : "1.1.1.1",
              family: 4,
            },
          ]);
        }
      },
    );
  });

  it("POST /api/database/test rejects blocked IP (169.254.x.x)", async () => {
    const { req, res } = createMocks("POST", "/api/database/test", {
      host: "169.254.169.254",
      port: 5432,
      user: "postgres",
    });

    await handleDatabaseRoute(req, res, null, "/api/database/test");

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("blocked"));
  });

  it("POST /api/database/test rejects hostname resolving to blocked IP", async () => {
    const { req, res } = createMocks("POST", "/api/database/test", {
      host: "metadata.internal",
      port: 5432,
      user: "postgres",
    });

    await handleDatabaseRoute(req, res, null, "/api/database/test");

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("blocked"));
  });

  it("POST /api/database/test allows valid external IP", async () => {
    const { req, res } = createMocks("POST", "/api/database/test", {
      host: "8.8.8.8",
      port: 5432,
      user: "postgres",
    });

    await handleDatabaseRoute(req, res, null, "/api/database/test");

    // Should proceed to connect (mocked pg)
    // If successful (since pg is mocked to succeed), result should be success: true
    // If fail, success: false. But NOT 400 blocked.

    expect(res.statusCode).toBe(200);
    expect(res.end).not.toHaveBeenCalledWith(
      expect.stringContaining("blocked"),
    );
  });

  it("POST /api/database/query rejects mutation keywords in read-only mode", async () => {
    const { req, res } = createMocks("POST", "/api/database/query", {
      sql: "DELETE FROM users",
    });

    await handleDatabaseRoute(
      req,
      res,
      { adapter: {} } as unknown as AgentRuntime,
      "/api/database/query",
    );

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining("mutation keyword"),
    );
  });

  it("POST /api/database/query allows SELECT in read-only mode", async () => {
    const { req, res } = createMocks("POST", "/api/database/query", {
      sql: "SELECT * FROM users",
    });

    const runtime = {
      adapter: {
        db: {
          execute: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
        },
      },
    } as unknown as AgentRuntime;

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(res.statusCode).toBe(200);
    expect(runtime.adapter.db.execute).toHaveBeenCalled();
  });
});
