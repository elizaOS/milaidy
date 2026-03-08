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

  // ── Multi-statement semicolon guard ──────────────────────────────────

  it("rejects multi-statement queries with mid-query semicolons", async () => {
    const { runtime, execute } = makeRuntime({ rows: [], fields: [] });
    // Both statements are pure SELECT — no mutation keywords — so only the
    // multi-statement semicolon guard can catch this.
    const req = createMockJsonRequest(
      { sql: "SELECT 1; SELECT 2" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain("multi-statement");
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows trailing semicolons (single-statement)", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ n: 1 }],
      fields: [{ name: "n" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT 1;" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // ── Comment-stripping bypass prevention ─────────────────────────────

  it("rejects mutation keyword hidden inside block comment removal", async () => {
    const { runtime, execute } = makeRuntime({ rows: [], fields: [] });
    // DE/* */LETE → after comment strip becomes DELETE (no space replacement)
    const req = createMockJsonRequest(
      { sql: "DE/* */LETE FROM users" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain('"DELETE"');
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows safe keyword inside block comment", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ n: 1 }],
      fields: [{ name: "n" }],
    });
    // DELETE is inside the comment, not in the actual query
    const req = createMockJsonRequest(
      { sql: "SELECT /* DELETE */ 1" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows safe keyword after line comment", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ n: 1 }],
      fields: [{ name: "n" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT 1 -- DELETE FROM users" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // ── Dollar-quoted and double-quoted string stripping ────────────────

  it("allows mutation keyword inside dollar-quoted string", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ s: "DELETE" }],
      fields: [{ name: "s" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT $$DELETE FROM users$$" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows mutation keyword inside tagged dollar-quoted string", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ s: "DROP TABLE" }],
      fields: [{ name: "s" }],
    });
    const req = createMockJsonRequest(
      { sql: "SELECT $tag$DROP TABLE users$tag$" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows mutation keyword inside double-quoted identifier", async () => {
    const { runtime, execute } = makeRuntime({
      rows: [{ delete: 1 }],
      fields: [{ name: "delete" }],
    });
    const req = createMockJsonRequest(
      { sql: 'SELECT "delete", "insert" FROM my_table' },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  // ── Additional mutation keywords (table-driven) ─────────────────────

  it.each([
    { sql: "INSERT INTO users VALUES (1)", keyword: "INSERT" },
    { sql: "DELETE FROM users WHERE id = 1", keyword: "DELETE" },
    { sql: "UPDATE users SET name = 'x'", keyword: "UPDATE" },
    { sql: "DROP TABLE users", keyword: "DROP" },
    { sql: "ALTER TABLE users ADD col TEXT", keyword: "ALTER" },
    { sql: "TRUNCATE users", keyword: "TRUNCATE" },
    { sql: "CREATE TABLE tmp (id INT)", keyword: "CREATE" },
    { sql: "GRANT ALL ON users TO public", keyword: "GRANT" },
    { sql: "REVOKE ALL ON users FROM public", keyword: "REVOKE" },
    { sql: "VACUUM users", keyword: "VACUUM" },
    { sql: "LISTEN my_channel", keyword: "LISTEN" },
    { sql: "UNLISTEN my_channel", keyword: "UNLISTEN" },
    { sql: "PREPARE stmt AS SELECT 1", keyword: "PREPARE" },
    { sql: "EXECUTE stmt", keyword: "EXECUTE" },
    { sql: "DEALLOCATE stmt", keyword: "DEALLOCATE" },
    { sql: "REINDEX TABLE users", keyword: "REINDEX" },
    {
      sql: "MERGE INTO tgt USING src ON true WHEN MATCHED THEN DELETE",
      keyword: "MERGE",
    },
    { sql: "CALL my_procedure()", keyword: "CALL" },
    { sql: "REFRESH MATERIALIZED VIEW mv", keyword: "REFRESH" },
    { sql: "DISCARD ALL", keyword: "DISCARD" },
  ])("rejects $keyword mutation keyword", async ({ sql, keyword }) => {
    const { runtime, execute } = makeRuntime({ rows: [], fields: [] });
    const req = createMockJsonRequest(
      { sql },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain(`"${keyword}"`);
    expect(execute).not.toHaveBeenCalled();
  });

  // ── Additional dangerous functions (table-driven) ───────────────────

  it.each([
    { sql: "SELECT lo_unlink(12345)", fn: "LO_UNLINK" },
    {
      sql: "SELECT pg_read_binary_file('/etc/passwd')",
      fn: "PG_READ_BINARY_FILE",
    },
    { sql: "SELECT pg_ls_dir('/tmp')", fn: "PG_LS_DIR" },
    { sql: "SELECT pg_cancel_backend(42)", fn: "PG_CANCEL_BACKEND" },
    { sql: "SELECT pg_reload_conf()", fn: "PG_RELOAD_CONF" },
    { sql: "SELECT pg_try_advisory_lock(1)", fn: "PG_TRY_ADVISORY_LOCK" },
    { sql: "SELECT pg_write_file('/tmp/x', 'data')", fn: "PG_WRITE_FILE" },
    { sql: "SELECT pg_stat_file('/etc/passwd')", fn: "PG_STAT_FILE" },
    { sql: "SELECT pg_rotate_logfile()", fn: "PG_ROTATE_LOGFILE" },
  ])("rejects dangerous function $fn", async ({ sql, fn }) => {
    const { runtime, execute } = makeRuntime({ rows: [], fields: [] });
    const req = createMockJsonRequest(
      { sql },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain(`"${fn}"`);
    expect(execute).not.toHaveBeenCalled();
  });

  // Functions whose name is a prefix of another entry (pg_sleep vs pg_sleep_for)
  // get reported under the shorter name in the error message. Verify they're
  // still blocked (status 400) without asserting the exact reported name.
  it.each([
    "SELECT pg_sleep_for('5 seconds')",
    "SELECT pg_sleep_until('2030-01-01')",
    "SELECT pg_advisory_lock_shared(1)",
    "SELECT pg_advisory_xact_lock(1)",
    "SELECT pg_advisory_unlock_all()",
    "SELECT lo_put(12345, 0, '\\x00')",
    "SELECT lo_from_bytea(0, '\\x00')",
    "SELECT pg_ls_logdir()",
    "SELECT pg_ls_waldir()",
    "SELECT pg_ls_tmpdir()",
    "SELECT pg_ls_archive_statusdir()",
  ])("rejects prefix-colliding dangerous function: %s", async (sql) => {
    const { runtime, execute } = makeRuntime({ rows: [], fields: [] });
    const req = createMockJsonRequest(
      { sql },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error?: string;
    }>();

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(400);
    expect(String(getJson()?.error ?? "")).toContain("dangerous function");
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
