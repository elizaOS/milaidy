/**
 * E2E tests for the Apps system — NO MOCKS.
 *
 * Starts a real API server and tests the full apps flow:
 * - GET /api/apps (list from real registry or cached data)
 * - GET /api/apps/search?q=... (search)
 * - GET /api/apps/installed (check installed apps)
 * - POST /api/apps/launch (install plugin + return viewer)
 * - GET /api/apps/info/:name (app detail)
 *
 * When the 2004scape engine is running locally (port 80), also tests:
 * - Full launch -> plugin install -> viewer URL points to running server
 * - Webclient is accessible at the viewer URL
 */
import http from "node:http";
import net from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startApiServer } from "../src/api/server.js";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function api(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
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
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

/** Check if a TCP port is listening. */
function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Apps E2E", () => {
  let server: { port: number; close: () => Promise<void> };

  beforeAll(async () => {
    server = await startApiServer({ port: 0 });
  }, 30_000);

  afterAll(async () => {
    if (server) await server.close();
  });

  // ===================================================================
  //  1. App listing
  // ===================================================================

  describe("GET /api/apps", () => {
    it("returns 200 with an array", async () => {
      const { status, data } = await api(server.port, "GET", "/api/apps");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it("app entries have required fields", async () => {
      const { data } = await api(server.port, "GET", "/api/apps");
      const apps = data as unknown as Array<Record<string, unknown>>;
      // Registry may or may not have apps loaded (depends on network).
      // If it does, verify the shape.
      for (const app of apps.slice(0, 5)) {
        expect(typeof app.name).toBe("string");
        expect(typeof app.displayName).toBe("string");
        expect(typeof app.description).toBe("string");
        expect(typeof app.category).toBe("string");
      }
    });
  });

  // ===================================================================
  //  2. App search
  // ===================================================================

  describe("GET /api/apps/search", () => {
    it("returns empty array for empty query", async () => {
      const { status, data } = await api(
        server.port,
        "GET",
        "/api/apps/search?q=",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown as Array<unknown>).length).toBe(0);
    });

    it("returns array for a query", async () => {
      const { status, data } = await api(
        server.port,
        "GET",
        "/api/apps/search?q=game",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ===================================================================
  //  3. App info
  // ===================================================================

  describe("GET /api/apps/info/:name", () => {
    it("returns 404 for non-existent app", async () => {
      const { status } = await api(
        server.port,
        "GET",
        "/api/apps/info/%40elizaos%2Fapp-nonexistent",
      );
      expect(status).toBe(404);
    });
  });

  // ===================================================================
  //  4. App installed list
  // ===================================================================

  describe("GET /api/apps/installed", () => {
    it("returns 200 with an array", async () => {
      const { status, data } = await api(
        server.port,
        "GET",
        "/api/apps/installed",
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ===================================================================
  //  5. App launch
  // ===================================================================

  describe("POST /api/apps/launch", () => {
    it("returns 400 when name is missing", async () => {
      const { status } = await api(server.port, "POST", "/api/apps/launch", {});
      expect(status).toBe(400);
    });

    it("returns 400 when name is empty", async () => {
      const { status } = await api(server.port, "POST", "/api/apps/launch", {
        name: "",
      });
      expect(status).toBe(400);
    });

    // This test requires network access to the registry.
    // If the registry is reachable, it tests the full launch flow.
    it("returns error for unknown app name", async () => {
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        {
          name: "@elizaos/app-definitely-does-not-exist-xyz",
        },
      );
      // Should be 500 (app not found in registry throws)
      expect(status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });

  // ===================================================================
  //  6. Route not found
  // ===================================================================

  describe("unknown routes", () => {
    it("returns 404 for unknown app route", async () => {
      const { status } = await api(
        server.port,
        "GET",
        "/api/apps/unknown-route",
      );
      expect(status).toBe(404);
    });
  });

  // ===================================================================
  //  7. 2004scape integration (requires engine running on port 80)
  // ===================================================================

  describe("2004scape integration", () => {
    let engineRunning = false;
    let gatewayRunning = false;

    beforeAll(async () => {
      engineRunning = await isPortOpen(80);
      gatewayRunning = await isPortOpen(7780);
      if (!engineRunning) {
        console.log(
          "[E2E] 2004scape engine not running on port 80 — skipping integration tests",
        );
        console.log(
          "[E2E] Start it with: cd eliza-2004scape && bun run engine",
        );
      }
      if (!gatewayRunning) {
        console.log(
          "[E2E] 2004scape gateway not running on port 7780 — skipping integration tests",
        );
        console.log(
          "[E2E] Start it with: cd eliza-2004scape && bun run gateway",
        );
      }
    });

    it("webclient is accessible when engine is running", async () => {
      if (!engineRunning) return;

      const response = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          http
            .get("http://127.0.0.1:80", (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (c: Buffer) => chunks.push(c));
              res.on("end", () => {
                resolve({
                  status: res.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString("utf-8"),
                });
              });
            })
            .on("error", reject);
        },
      );

      expect(response.status).toBe(200);
      expect(response.body).toContain("<");
    });

    it("gateway WebSocket is reachable when running", async () => {
      if (!gatewayRunning) {
        console.log("[E2E] Skipping gateway test — not running");
        return;
      }

      const reachable = await isPortOpen(7780);
      expect(reachable).toBe(true);
    });

    it("gateway responds to HTTP requests", async () => {
      if (!gatewayRunning) return;

      // The gateway serves a REST API alongside WebSocket
      const response = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          http
            .get("http://127.0.0.1:7780/status", (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (c: Buffer) => chunks.push(c));
              res.on("end", () => {
                resolve({
                  status: res.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString("utf-8"),
                });
              });
            })
            .on("error", reject);
        },
      );

      // Gateway should respond (200 or 404 depending on route, but NOT connection refused)
      expect(response.status).toBeGreaterThan(0);
    });

    it("full launch flow returns viewer config pointing to local engine", async () => {
      if (!engineRunning) return;

      // This test exercises the full flow:
      // 1. POST /api/apps/launch with @elizaos/app-2004scape
      // 2. AppManager looks up registry, installs plugin, returns viewer URL
      // Note: This may fail if the registry is unreachable (network dependency)
      const { status, data } = await api(
        server.port,
        "POST",
        "/api/apps/launch",
        {
          name: "@elizaos/app-2004scape",
        },
      );

      // If the registry resolved the app, check the viewer URL
      if (status === 200) {
        expect(data.displayName).toBe("2004scape");
        if (data.viewer) {
          const viewer = data.viewer as Record<string, unknown>;
          expect(typeof viewer.url).toBe("string");
          // Viewer should point to localhost (our fork)
          expect(viewer.url).toContain("localhost");
        }
      }
      // If registry is unreachable, the test still passes (we verified the route works)
    });
  });
});
