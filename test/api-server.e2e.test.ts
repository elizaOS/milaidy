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
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startApiServer } from "../src/api/server.js";
import { AGENT_NAME_POOL } from "../src/runtime/onboarding-names.js";

// ---------------------------------------------------------------------------
// HTTP helper (identical to the one in agent-runtime.e2e.test.ts)
// ---------------------------------------------------------------------------

function req(
  port: number, method: string, p: string, body?: Record<string, unknown>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      { hostname: "127.0.0.1", port, path: p, method,
        headers: { "Content-Type": "application/json", ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}) } },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = { _raw: raw }; }
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
      expect((await req(port, "GET", "/api/status")).data.state).toBe("running");
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
      expect((await req(port, "GET", "/api/status")).data.state).toBe("running");

      await req(port, "POST", "/api/agent/pause");
      expect((await req(port, "GET", "/api/status")).data.state).toBe("paused");

      await req(port, "POST", "/api/agent/resume");
      expect((await req(port, "GET", "/api/status")).data.state).toBe("running");

      await req(port, "POST", "/api/agent/stop");
      expect((await req(port, "GET", "/api/status")).data.state).toBe("stopped");
    });
  });

  // -- Chat rejection without runtime --

  describe("POST /api/chat (no runtime)", () => {
    it("rejects with 503 when no runtime", async () => {
      const { status, data } = await req(port, "POST", "/api/chat", { text: "hello" });
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
        expect(["ai-provider", "connector", "database", "feature"]).toContain(p.category);
        expect(Array.isArray(p.configKeys)).toBe(true);
      }
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
      const { status, data } = await req(port, "GET", "/api/onboarding/options");
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

      // Write new config
      await req(port, "PUT", "/api/config", { test: { roundTrip: true } });
      const { data } = await req(port, "GET", "/api/config");
      expect((data as Record<string, Record<string, boolean>>).test?.roundTrip).toBe(true);

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
      const { data } = await req(port, "POST", "/api/agent/autonomy", { enabled: false });
      expect(data.ok).toBe(true);
      expect(data.autonomy).toBe(true);
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
      expect((await req(port, "PUT", "/api/plugins/nonexistent-plugin", { enabled: true })).status).toBe(404);
    });
  });
});
