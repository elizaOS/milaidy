import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers";
import { handleDatabaseRoute } from "./database";

vi.mock("drizzle-orm", () => ({
  sql: {
    raw: (query: string) => ({ queryChunks: [{ sql: query }] }),
  },
}));

interface DbExecuteResult {
  rows: Array<Record<string, unknown>>;
  fields?: Array<{ name: string }>;
}

function makeRuntime(executeResult: DbExecuteResult) {
  const execute = vi.fn().mockResolvedValue(executeResult);
  const runtime = {
    adapter: {
      db: {
        execute,
      },
    },
  } as unknown as AgentRuntime;
  return { runtime, execute };
}

describe("database read-only query guard", () => {
  it("rejects COPY statements in read-only mode", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "table_name" }],
    });
    const req = createMockJsonRequest(
      {
        sql: "COPY users TO '/tmp/users.csv'",
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"COPY"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects DO blocks in read-only mode", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "table_name" }],
    });
    const req = createMockJsonRequest(
      {
        sql: "DO $$ BEGIN PERFORM pg_sleep(0); END $$;",
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"DO"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects SELECT INTO statements in read-only mode", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "table_name" }],
    });
    const req = createMockJsonRequest(
      {
        sql: "SELECT id INTO users_backup FROM users",
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"INTO"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects nextval() in read-only mode", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "value" }],
    });
    const req = createMockJsonRequest(
      {
        sql: "SELECT nextval('users_id_seq')",
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"NEXTVAL"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects setval() in read-only mode", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "value" }],
    });
    const req = createMockJsonRequest(
      {
        sql: "SELECT setval('users_id_seq', 42)",
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"SETVAL"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows COPY when readOnly is explicitly false", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [],
    });
    const req = createMockJsonRequest(
      {
        sql: "COPY users TO '/tmp/users.csv'",
        readOnly: false,
      },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      runtime,
      "/api/database/query",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
