/**
 * E2E tests for the real API server — NO MOCKS, NO API KEYS NEEDED.
 *
 * Imports and starts the actual `startApiServer()` from src/api/server.ts.
 * Tests every endpoint that doesn't require a running AgentRuntime:
 * - Status reporting
 * - Plugin discovery (real filesystem scan)
 * - Skill discovery (real filesystem scan)
 * - Onboarding options and status
 * - Config endpoints
 * - Log buffer
 * - Lifecycle state transitions
 * - Chat rejection when no runtime
 * - 404 handling
 * - CORS preflight
 *
 * These tests exercise REAL production code, not mocks.
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";
import { AGENT_NAME_POOL } from "../src/runtime/onboarding-names.js";

// ---------------------------------------------------------------------------
// HTTP helper (identical to the one in agent-runtime.e2e.test.ts)
// ---------------------------------------------------------------------------

function req(
  port: number,
  method: string,
  p: string,
  body?: Record<string, unknown>,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  data: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
        },
      },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API Server E2E (no runtime)", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // Start the REAL server with no runtime (port 0 = auto-assign)
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  // -- Status --

  describe("GET /api/status", () => {
    it("returns not_started state (no runtime)", async () => {
      const { status, data } = await req(port, "GET", "/api/status");
      expect(status).toBe(200);
      expect(data.state).toBe("not_started");
      expect(typeof data.agentName).toBe("string");
    });

    it("has no uptime or startedAt when not started", async () => {
      const { data } = await req(port, "GET", "/api/status");
      expect(data.uptime).toBeUndefined();
      expect(data.startedAt).toBeUndefined();
    });
  });

  // -- Lifecycle state transitions --

  describe("lifecycle state transitions", () => {
    it("start → running", async () => {
      const { data } = await req(port, "POST", "/api/agent/start");
      expect(data.ok).toBe(true);
      const status = await req(port, "GET", "/api/status");
      expect(status.data.state).toBe("running");
      expect(typeof status.data.startedAt).toBe("number");
      expect(typeof status.data.uptime).toBe("number");
    });

    it("pause → paused", async () => {
      const { data } = await req(port, "POST", "/api/agent/pause");
      expect(data.ok).toBe(true);
      expect((await req(port, "GET", "/api/status")).data.state).toBe("paused");
    });

    it("resume → running", async () => {
      const { data } = await req(port, "POST", "/api/agent/resume");
      expect(data.ok).toBe(true);
      expect((await req(port, "GET", "/api/status")).data.state).toBe(
        "running",
      );
    });

    it("stop → stopped, clears model and timing", async () => {
      const { data } = await req(port, "POST", "/api/agent/stop");
      expect(data.ok).toBe(true);
      const status = await req(port, "GET", "/api/status");
      expect(status.data.state).toBe("stopped");
      expect(status.data.model).toBeUndefined();
      expect(status.data.startedAt).toBeUndefined();
    });

    it("full cycle: start → pause → resume → stop", async () => {
      await req(port, "POST", "/api/agent/start");
      expect((await req(port, "GET", "/api/status")).data.state).toBe(
        "running",
      );

      await req(port, "POST", "/api/agent/pause");
      expect((await req(port, "GET", "/api/status")).data.state).toBe("paused");

      await req(port, "POST", "/api/agent/resume");
      expect((await req(port, "GET", "/api/status")).data.state).toBe(
        "running",
      );

      await req(port, "POST", "/api/agent/stop");
      expect((await req(port, "GET", "/api/status")).data.state).toBe(
        "stopped",
      );
    });
  });

  // -- Chat rejection without runtime --

  describe("POST /api/chat (no runtime)", () => {
    it("rejects with 503 when no runtime", async () => {
      const { status, data } = await req(port, "POST", "/api/chat", {
        text: "hello",
      });
      expect(status).toBe(503);
      expect(data.error).toContain("not running");
    });

    it("rejects empty text with 400", async () => {
      const { status } = await req(port, "POST", "/api/chat", { text: "" });
      expect(status).toBe(400);
    });

    it("rejects missing text with 400", async () => {
      const { status } = await req(port, "POST", "/api/chat", {});
      expect(status).toBe(400);
    });
  });

  // -- Plugin discovery (real filesystem) --

  describe("GET /api/plugins", () => {
    it("returns a plugins array from real filesystem scan", async () => {
      const { status, data } = await req(port, "GET", "/api/plugins");
      expect(status).toBe(200);
      expect(Array.isArray(data.plugins)).toBe(true);
    });

    it("plugins have correct shape", async () => {
      const { data } = await req(port, "GET", "/api/plugins");
      const plugins = data.plugins as Array<Record<string, unknown>>;
      if (plugins.length > 0) {
        const p = plugins[0];
        expect(typeof p.id).toBe("string");
        expect(typeof p.name).toBe("string");
        expect(typeof p.description).toBe("string");
        expect(typeof p.enabled).toBe("boolean");
        expect(typeof p.configured).toBe("boolean");
        expect(["ai-provider", "connector", "database", "feature"]).toContain(
          p.category,
        );
        expect(Array.isArray(p.configKeys)).toBe(true);
      }
    });

    it("hides Vercel OIDC token key from plugin metadata", async () => {
      const { data } = await req(port, "GET", "/api/plugins");
      const plugins = data.plugins as Array<Record<string, unknown>>;
      const vercel = plugins.find((p) => p.id === "vercel-ai-gateway");
      if (!vercel) return;

      const configKeys = Array.isArray(vercel.configKeys)
        ? (vercel.configKeys as string[])
        : [];
      expect(configKeys).not.toContain("VERCEL_OIDC_TOKEN");

      const parameters = Array.isArray(vercel.parameters)
        ? (vercel.parameters as Array<Record<string, unknown>>)
        : [];
      const parameterKeys = parameters.map((param) => param.key);
      expect(parameterKeys).not.toContain("VERCEL_OIDC_TOKEN");
    });
  });

  // -- Skills discovery --

  describe("GET /api/skills", () => {
    it("returns a skills array", async () => {
      const { status, data } = await req(port, "GET", "/api/skills");
      expect(status).toBe(200);
      expect(Array.isArray(data.skills)).toBe(true);
    });
  });

  describe("skills marketplace endpoints", () => {
    it("GET /api/skills/marketplace/search requires query", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/skills/marketplace/search",
      );
      expect(status).toBe(400);
      expect(String(data.error)).toContain("Query");
    });

    it("GET /api/skills/marketplace/installed returns array", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/skills/marketplace/installed",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.skills)).toBe(true);
    });

    it("GET /api/skills/marketplace/search reports key-gated failure when key missing", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/skills/marketplace/search?q=agent",
      );
      expect(status).toBe(502);
      expect(String(data.error)).toContain("SKILLSMP_API_KEY");
    });

    it("POST /api/skills/marketplace/install validates source input", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/skills/marketplace/install",
        { name: "test" },
      );
      expect(status).toBe(400);
      expect(String(data.error)).toContain("githubUrl");
    });

    it("POST /api/skills/marketplace/uninstall validates id input", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/skills/marketplace/uninstall",
        {},
      );
      expect(status).toBe(400);
      expect(String(data.error)).toContain("id");
    });
  });

  // -- Logs --

  describe("GET /api/logs", () => {
    it("returns entries array with at least the startup log", async () => {
      const { status, data } = await req(port, "GET", "/api/logs");
      expect(status).toBe(200);
      expect(Array.isArray(data.entries)).toBe(true);
      const entries = data.entries as Array<Record<string, unknown>>;
      expect(entries.length).toBeGreaterThan(0);
      // Verify log entry shape
      expect(typeof entries[0].timestamp).toBe("number");
      expect(typeof entries[0].level).toBe("string");
      expect(typeof entries[0].message).toBe("string");
    });
  });

  // -- Onboarding --

  describe("onboarding endpoints", () => {
    it("GET /api/onboarding/status returns complete flag", async () => {
      const { status, data } = await req(port, "GET", "/api/onboarding/status");
      expect(status).toBe(200);
      expect(typeof data.complete).toBe("boolean");
    });

    it("GET /api/onboarding/options returns real presets", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/onboarding/options",
      );
      expect(status).toBe(200);
      const names = data.names as string[];
      const styles = data.styles as unknown[];
      const providers = data.providers as unknown[];

      expect(names.length).toBeGreaterThan(0);
      expect(styles.length).toBeGreaterThan(0);
      expect(providers.length).toBeGreaterThan(0);

      // Verify names come from the real preset pool (random subset)
      for (const name of names) {
        expect(AGENT_NAME_POOL).toContain(name);
      }
      // Ensure names are unique
      expect(new Set(names).size).toBe(names.length);
    });
  });

  // -- Config --

  describe("config endpoints", () => {
    it("GET /api/config returns config object", async () => {
      const { status, data } = await req(port, "GET", "/api/config");
      expect(status).toBe(200);
      expect(typeof data).toBe("object");
    });

    it("PUT /api/config → GET /api/config round-trips", async () => {
      const original = (await req(port, "GET", "/api/config")).data;

      // Write new config — use "features" (an allowed top-level key)
      await req(port, "PUT", "/api/config", {
        features: { roundTrip: { enabled: true } },
      });
      const { data } = await req(port, "GET", "/api/config");
      expect(
        (data as Record<string, Record<string, Record<string, boolean>>>)
          .features?.roundTrip?.enabled,
      ).toBe(true);

      // Restore
      await req(port, "PUT", "/api/config", original);
    });
  });

  // -- Autonomy --

  describe("autonomy endpoints", () => {
    it("GET /api/agent/autonomy always returns enabled: true", async () => {
      const { status, data } = await req(port, "GET", "/api/agent/autonomy");
      expect(status).toBe(200);
      expect(data.enabled).toBe(true);
    });

    it("POST /api/agent/autonomy always returns autonomy: true", async () => {
      const { data } = await req(port, "POST", "/api/agent/autonomy", {
        enabled: false,
      });
      expect(data.ok).toBe(true);
      expect(data.autonomy).toBe(true);
    });
  });

  // -- Workbench --

  describe("workbench endpoints", () => {
    it("GET /api/workbench/overview returns summary + arrays", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/workbench/overview",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.goals)).toBe(true);
      expect(Array.isArray(data.todos)).toBe(true);
      expect(typeof data.summary).toBe("object");
      expect(typeof data.autonomy).toBe("object");
    });

    it("PATCH /api/workbench/goals/:id returns 503 when runtime is absent", async () => {
      const { status } = await req(port, "PATCH", "/api/workbench/goals/fake", {
        isCompleted: true,
      });
      expect(status).toBe(503);
    });

    it("PATCH /api/workbench/todos/:id returns 503 when runtime is absent", async () => {
      const { status } = await req(port, "PATCH", "/api/workbench/todos/fake", {
        isCompleted: true,
      });
      expect(status).toBe(503);
    });

    it("POST /api/workbench/goals returns 503 when runtime is absent", async () => {
      const { status } = await req(port, "POST", "/api/workbench/goals", {
        name: "test goal",
      });
      expect(status).toBe(503);
    });

    it("POST /api/workbench/todos returns 503 when runtime is absent", async () => {
      const { status } = await req(port, "POST", "/api/workbench/todos", {
        name: "test todo",
      });
      expect(status).toBe(503);
    });
  });

  describe("share ingest endpoints", () => {
    it("POST /api/ingest/share accepts payload", async () => {
      const { status, data } = await req(port, "POST", "/api/ingest/share", {
        source: "e2e-test",
        title: "Shared article",
        url: "https://example.com/story",
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(typeof data.item).toBe("object");
      expect(
        typeof (data.item as Record<string, unknown>).suggestedPrompt,
      ).toBe("string");
    });

    it("GET /api/ingest/share?consume=1 drains queued items", async () => {
      await req(port, "POST", "/api/ingest/share", {
        source: "e2e-test",
        text: "something to analyze",
      });
      const first = await req(port, "GET", "/api/ingest/share?consume=1");
      expect(first.status).toBe(200);
      expect(Array.isArray(first.data.items)).toBe(true);
      expect((first.data.items as unknown[]).length).toBeGreaterThan(0);

      const second = await req(port, "GET", "/api/ingest/share?consume=1");
      expect(second.status).toBe(200);
      expect(Array.isArray(second.data.items)).toBe(true);
      expect((second.data.items as unknown[]).length).toBe(0);
    });
  });

  // -- CORS --

  describe("CORS", () => {
    it("OPTIONS returns 204", async () => {
      const { status } = await req(port, "OPTIONS", "/api/status");
      expect(status).toBe(204);
    });

    it("localhost origin echoed back in CORS header", async () => {
      const origin = `http://localhost:${port}`;
      const { status, headers } = await new Promise<{
        status: number;
        headers: http.IncomingHttpHeaders;
      }>((resolve, reject) => {
        const r = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/status",
            method: "GET",
            headers: { Origin: origin },
          },
          (res) => {
            res.resume();
            resolve({ status: res.statusCode ?? 0, headers: res.headers });
          },
        );
        r.on("error", reject);
        r.end();
      });
      expect(status).toBe(200);
      expect(headers["access-control-allow-origin"]).toBe(origin);
    });

    it("non-local origin is rejected", async () => {
      const { status } = await new Promise<{ status: number }>(
        (resolve, reject) => {
          const r = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/api/status",
              method: "GET",
              headers: { Origin: "https://evil.example.com" },
            },
            (res) => {
              res.resume();
              resolve({ status: res.statusCode ?? 0 });
            },
          );
          r.on("error", reject);
          r.end();
        },
      );
      expect(status).toBe(403);
    });
  });

  // -- Error handling --

  describe("error handling", () => {
    it("non-JSON POST body → 400", async () => {
      const { status } = await new Promise<{ status: number }>(
        (resolve, reject) => {
          const r = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/api/chat",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": 11,
              },
            },
            (res) => {
              res.resume();
              resolve({ status: res.statusCode ?? 0 });
            },
          );
          r.on("error", reject);
          r.write("not-json!!!");
          r.end();
        },
      );
      expect(status).toBe(400);
    });

    it("unknown route → 404", async () => {
      expect((await req(port, "GET", "/api/does-not-exist")).status).toBe(404);
    });

    it("PUT /api/plugins/nonexistent → 404", async () => {
      expect(
        (
          await req(port, "PUT", "/api/plugins/nonexistent-plugin", {
            enabled: true,
          })
        ).status,
      ).toBe(404);
    });
  });

  // -- MCP Marketplace & Config --

  describe("MCP marketplace endpoints", () => {
    it("GET /api/mcp/marketplace/search returns results array", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/mcp/marketplace/search?q=test&limit=5",
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.results)).toBe(true);
    });

    it("GET /api/mcp/marketplace/search works with empty query", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/mcp/marketplace/search",
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.results)).toBe(true);
    });

    it("GET /api/mcp/marketplace/details/:name returns 404 for nonexistent server", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/mcp/marketplace/details/nonexistent-server-xyz-123",
      );
      expect(status).toBe(404);
      expect(typeof data.error).toBe("string");
    });

    it("GET /api/mcp/marketplace/details requires name parameter", async () => {
      const { status } = await req(
        port,
        "GET",
        "/api/mcp/marketplace/details/",
      );
      expect(status).toBe(400);
    });

    it("GET /api/mcp/marketplace/details/:name returns 400 for malformed encoding", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/mcp/marketplace/details/%E0%A4%A",
      );
      expect(status).toBe(400);
      expect(data.error).toBe("Invalid server name: malformed URL encoding");
    });
  });

  describe("MCP config endpoints", () => {
    it("GET /api/mcp/config returns servers object", async () => {
      const { status, data } = await req(port, "GET", "/api/mcp/config");
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(typeof data.servers).toBe("object");
    });

    it("POST /api/mcp/config/server adds a server and returns requiresRestart", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/mcp/config/server",
        {
          name: "test-server",
          config: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@test/mcp-server"],
          },
        },
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.name).toBe("test-server");
      expect(data.requiresRestart).toBe(true);

      // Verify it persisted
      const { data: configData } = await req(port, "GET", "/api/mcp/config");
      const servers = configData.servers as Record<
        string,
        Record<string, unknown>
      >;
      expect(servers["test-server"]).toBeDefined();
      expect(servers["test-server"].type).toBe("stdio");
      expect(servers["test-server"].command).toBe("npx");
    });

    it("POST /api/mcp/config/server validates name", async () => {
      const { status } = await req(port, "POST", "/api/mcp/config/server", {
        name: "",
        config: { type: "stdio", command: "npx" },
      });
      expect(status).toBe(400);
    });

    it("POST /api/mcp/config/server validates config type", async () => {
      const { status } = await req(port, "POST", "/api/mcp/config/server", {
        name: "bad-type",
        config: { type: "invalid" },
      });
      expect(status).toBe(400);
    });

    it("POST /api/mcp/config/server validates command for stdio", async () => {
      const { status } = await req(port, "POST", "/api/mcp/config/server", {
        name: "no-cmd",
        config: { type: "stdio" },
      });
      expect(status).toBe(400);
    });

    it("POST /api/mcp/config/server validates url for remote servers", async () => {
      const { status } = await req(port, "POST", "/api/mcp/config/server", {
        name: "no-url",
        config: { type: "streamable-http" },
      });
      expect(status).toBe(400);
    });

    it("POST /api/mcp/config/server adds remote server with url", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/mcp/config/server",
        {
          name: "test-remote",
          config: {
            type: "streamable-http",
            url: "https://mcp.example.com/api",
          },
        },
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.requiresRestart).toBe(true);
    });

    it("DELETE /api/mcp/config/server/:name removes and returns requiresRestart", async () => {
      // First add
      await req(port, "POST", "/api/mcp/config/server", {
        name: "to-delete",
        config: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@test/mcp-server"],
        },
      });

      // Then remove
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/mcp/config/server/to-delete",
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.requiresRestart).toBe(true);

      // Verify removed
      const { data: configData } = await req(port, "GET", "/api/mcp/config");
      const servers = configData.servers as Record<string, unknown>;
      expect(servers["to-delete"]).toBeUndefined();
    });

    it("DELETE /api/mcp/config/server/:name is idempotent for nonexistent", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/mcp/config/server/does-not-exist",
      );
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it("DELETE /api/mcp/config/server/:name returns 400 for malformed encoding", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/mcp/config/server/%E0%A4%A",
      );
      expect(status).toBe(400);
      expect(data.error).toBe("Invalid server name: malformed URL encoding");
    });

    it("PUT /api/mcp/config replaces entire config", async () => {
      const newServers = {
        "bulk-a": { type: "stdio", command: "npx", args: ["-y", "@test/a"] },
        "bulk-b": { type: "streamable-http", url: "https://example.com/mcp" },
      };

      const { status, data } = await req(port, "PUT", "/api/mcp/config", {
        servers: newServers,
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);

      const { data: configData } = await req(port, "GET", "/api/mcp/config");
      const servers = configData.servers as Record<string, unknown>;
      expect(servers["bulk-a"]).toBeDefined();
      expect(servers["bulk-b"]).toBeDefined();
    });
  });

  describe("MCP status endpoint", () => {
    it("GET /api/mcp/status returns servers array (empty without runtime MCP service)", async () => {
      const { status, data } = await req(port, "GET", "/api/mcp/status");
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.servers)).toBe(true);
    });

    it("GET /api/mcp/status server entries have correct shape when present", async () => {
      const { data } = await req(port, "GET", "/api/mcp/status");
      const servers = data.servers as Array<Record<string, unknown>>;
      // With no runtime, it returns empty — but shape is valid
      for (const server of servers) {
        expect(typeof server.name).toBe("string");
        expect(typeof server.status).toBe("string");
        expect(typeof server.toolCount).toBe("number");
        expect(typeof server.resourceCount).toBe("number");
      }
    });
  });
});
