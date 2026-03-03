import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers";
import { handleDatabaseRoute } from "./database";

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

  // ── Dangerous functions (file I/O, DoS, backend control) ──────────────

  it("rejects lo_import() — arbitrary file read on DB server", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "oid" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT lo_import('/etc/passwd')" },
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
    expect(String(getJson()?.error ?? "")).toContain("LO_IMPORT");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects lo_export() — arbitrary file write on DB server", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "result" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT lo_export(12345, '/tmp/evil.so')" },
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
    expect(String(getJson()?.error ?? "")).toContain("LO_EXPORT");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects pg_read_file() — server file read (superuser)", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "content" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT pg_read_file('/etc/passwd')" },
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
    expect(String(getJson()?.error ?? "")).toContain("PG_READ_FILE");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects pg_sleep() — denial of service", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "pg_sleep" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT pg_sleep(999999)" },
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
    expect(String(getJson()?.error ?? "")).toContain("PG_SLEEP");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects pg_terminate_backend() — kill other connections", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "result" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT pg_terminate_backend(42)" },
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
    expect(String(getJson()?.error ?? "")).toContain("PG_TERMINATE_BACKEND");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects set_config() — SET equivalent as function form", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "set_config" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT set_config('role', 'superuser', false)" },
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
    expect(String(getJson()?.error ?? "")).toContain("SET_CONFIG");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects pg_advisory_lock() — can deadlock other connections", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [{ name: "pg_advisory_lock" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT pg_advisory_lock(1)" },
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
    expect(String(getJson()?.error ?? "")).toContain("PG_ADVISORY_LOCK");
    expect(execute).not.toHaveBeenCalled();
  });

  // ── Newly blocked keywords ────────────────────────────────────────────

  it("rejects SET ROLE — privilege escalation", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [],
    });
    const req = createMockJsonRequest(
      { sql: "SET ROLE superuser" },
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
    expect(String(getJson()?.error ?? "")).toContain('"SET"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects NOTIFY — async side-effect", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [],
    });
    const req = createMockJsonRequest(
      { sql: "NOTIFY mychannel, 'payload'" },
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
    expect(String(getJson()?.error ?? "")).toContain('"NOTIFY"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects LOCK — can deadlock tables", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [],
      fields: [],
    });
    const req = createMockJsonRequest(
      { sql: "LOCK TABLE users IN EXCLUSIVE MODE" },
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
    expect(String(getJson()?.error ?? "")).toContain('"LOCK"');
    expect(execute).not.toHaveBeenCalled();
  });
});
