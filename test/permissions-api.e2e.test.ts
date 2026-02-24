/**
 * E2E tests for the Permissions API endpoints.
 *
 * Covers:
 * - GET /api/permissions - Get all permission states
 * - GET /api/permissions/:id - Get single permission state
 * - POST /api/permissions/refresh - Refresh permission states
 * - POST /api/permissions/:id/request - Request a permission
 * - POST /api/permissions/:id/open-settings - Open system settings
 * - PUT /api/permissions/shell - Toggle shell access
 * - PUT /api/permissions/state - Update permission states
 *
 * NO MOCKS - all tests spin up a real HTTP server.
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startApiServer } from "../src/api/server";

function saveEnv(...keys: string[]): { restore: () => void } {
  const prev = new Map<string, string | undefined>();
  for (const key of keys) prev.set(key, process.env[key]);
  return {
    restore: () => {
      for (const [key, value] of prev) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface ReqOptions {
  headers?: Record<string, string>;
}

function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  opts?: ReqOptions,
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
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
          ...(opts?.headers ?? {}),
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

function waitForWsMessage(
  ws: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
        const message = JSON.parse(text) as Record<string, unknown>;
        if (predicate(message)) {
          cleanup();
          resolve(message);
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Permissions API E2E", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // Start server without auth token for simpler testing
    const result = await startApiServer({ port: 0 });
    port = result.port;
    close = result.close;
  });

  afterAll(async () => {
    await close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/permissions
  // ─────────────────────────────────────────────────────────────────────────

  describe("GET /api/permissions", () => {
    it("returns permission states and platform info", async () => {
      const { status, data } = await req(port, "GET", "/api/permissions");
      expect(status).toBe(200);
      expect(data).toHaveProperty("permissions");
      expect(data).toHaveProperty("platform");
      expect(data).toHaveProperty("shellEnabled");
      expect(typeof data.platform).toBe("string");
      expect(typeof data.shellEnabled).toBe("boolean");
    });

    it("returns permissions as an object", async () => {
      const { data } = await req(port, "GET", "/api/permissions");
      expect(typeof data.permissions).toBe("object");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/permissions/definitions
  // ─────────────────────────────────────────────────────────────────────────

  describe("GET /api/permissions/definitions", () => {
    it("returns canonical definitions with platform applicability", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/definitions",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("platform");
      expect(data).toHaveProperty("permissions");
      const permissions = data.permissions as Array<Record<string, unknown>>;
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
      const shell = permissions.find((permission) => permission.id === "shell");
      expect(shell).toBeDefined();
      expect(shell).toMatchObject({
        requiredForFeatures: expect.arrayContaining(["shell"]),
      });
      expect(typeof shell?.applicable).toBe("boolean");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/permissions/:id
  // ─────────────────────────────────────────────────────────────────────────

  describe("GET /api/permissions/:id", () => {
    it("returns permission state for unknown permission ID (may be not-applicable)", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/invalid-permission",
      );
      // Server returns a state for any permission ID, even invalid ones
      // It will be marked as not-applicable or have some default state
      expect(status).toBe(200);
      expect(data).toHaveProperty("id", "invalid-permission");
    });

    it("returns permission state for valid ID: microphone", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/microphone",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("id", "microphone");
      expect(data).toHaveProperty("status");
      expect([
        "granted",
        "denied",
        "not-determined",
        "restricted",
        "not-applicable",
      ]).toContain(data.status);
    });

    it("returns permission state for valid ID: camera", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/camera",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("id", "camera");
      expect(data).toHaveProperty("status");
    });

    it("returns permission state for valid ID: shell", async () => {
      const { status, data } = await req(port, "GET", "/api/permissions/shell");
      expect(status).toBe(200);
      expect(data).toHaveProperty("enabled");
      expect(data).toHaveProperty("id", "shell");
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("permission");
      const permission = data.permission as Record<string, unknown>;
      expect(permission).toHaveProperty("id", "shell");
      expect(permission).toHaveProperty("status");
      if (data.enabled === true) expect(permission.status).toBe("granted");
      if (data.enabled === false) expect(permission.status).toBe("denied");
    });

    it("returns permission state for valid ID: accessibility", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/accessibility",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("id", "accessibility");
      expect(data).toHaveProperty("status");
    });

    it("returns permission state for valid ID: screen-recording", async () => {
      const { status, data } = await req(
        port,
        "GET",
        "/api/permissions/screen-recording",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("id", "screen-recording");
      expect(data).toHaveProperty("status");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/permissions/refresh
  // ─────────────────────────────────────────────────────────────────────────

  describe("POST /api/permissions/refresh", () => {
    it("returns success with IPC action indicator", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/refresh",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty("action", "ipc:permissions:refresh");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/permissions/:id/request
  // ─────────────────────────────────────────────────────────────────────────

  describe("POST /api/permissions/:id/request", () => {
    it("returns IPC action for microphone request", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/microphone/request",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty(
        "action",
        "ipc:permissions:request:microphone",
      );
      expect(data).toMatchObject({
        telemetry: {
          type: "permissions_telemetry",
          source: "api",
          action: "request",
          permissionId: "microphone",
          method: "POST",
          path: "/api/permissions/microphone/request",
        },
      });
      expect(
        typeof (data.telemetry as Record<string, unknown> | undefined)?.ts,
      ).toBe("number");
    });

    it("returns IPC action for camera request", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/camera/request",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("action", "ipc:permissions:request:camera");
    });

    it("returns IPC action for accessibility request", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/accessibility/request",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty(
        "action",
        "ipc:permissions:request:accessibility",
      );
    });

    it("returns 400 for unknown permission request IDs", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/not-a-real-permission/request",
      );
      expect(status).toBe(400);
      expect(data).toHaveProperty("error", "Unknown permission ID");
    });

    it("returns 400 for malformed permission request IDs", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/%2F/request",
      );
      expect(status).toBe(400);
      expect(data).toHaveProperty("error", "Invalid permission ID");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/permissions/:id/open-settings
  // ─────────────────────────────────────────────────────────────────────────

  describe("POST /api/permissions/:id/open-settings", () => {
    it("returns IPC action for opening microphone settings", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/microphone/open-settings",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("message");
      expect(data).toHaveProperty(
        "action",
        "ipc:permissions:openSettings:microphone",
      );
      expect(data).toMatchObject({
        telemetry: {
          type: "permissions_telemetry",
          source: "api",
          action: "open-settings",
          permissionId: "microphone",
          method: "POST",
          path: "/api/permissions/microphone/open-settings",
        },
      });
      expect(
        typeof (data.telemetry as Record<string, unknown> | undefined)?.ts,
      ).toBe("number");
    });

    it("returns IPC action for opening camera settings", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/camera/open-settings",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty(
        "action",
        "ipc:permissions:openSettings:camera",
      );
    });

    it("returns IPC action for opening accessibility settings", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/accessibility/open-settings",
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty(
        "action",
        "ipc:permissions:openSettings:accessibility",
      );
    });

    it("returns 400 for unknown permission open-settings IDs", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/permissions/not-a-real-permission/open-settings",
      );
      expect(status).toBe(400);
      expect(data).toHaveProperty("error", "Unknown permission ID");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/permissions/shell
  // ─────────────────────────────────────────────────────────────────────────

  describe("PUT /api/permissions/shell", () => {
    it("enables shell access", async () => {
      const { status, data } = await req(
        port,
        "PUT",
        "/api/permissions/shell",
        { enabled: true },
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("shellEnabled", true);
      expect(data).toMatchObject({
        telemetry: {
          type: "permissions_telemetry",
          source: "api",
          action: "shell-toggle",
          permissionId: "shell",
          enabled: true,
          previousEnabled: true,
        },
      });
    });

    it("disables shell access", async () => {
      const { status, data } = await req(
        port,
        "PUT",
        "/api/permissions/shell",
        { enabled: false },
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("shellEnabled", false);
      expect(data).toMatchObject({
        telemetry: {
          type: "permissions_telemetry",
          source: "api",
          action: "shell-toggle",
          permissionId: "shell",
          enabled: false,
          previousEnabled: true,
        },
      });
    });

    it("persists shell enabled state", async () => {
      // Disable
      await req(port, "PUT", "/api/permissions/shell", { enabled: false });

      // Check state persisted
      const { data: perms } = await req(port, "GET", "/api/permissions");
      expect(perms.shellEnabled).toBe(false);

      // Re-enable
      await req(port, "PUT", "/api/permissions/shell", { enabled: true });

      // Check state persisted
      const { data: perms2 } = await req(port, "GET", "/api/permissions");
      expect(perms2.shellEnabled).toBe(true);
    });

    it("returns 400 for missing body", async () => {
      const { status } = await req(port, "PUT", "/api/permissions/shell");
      expect(status).toBe(400);
    });

    it("blocks terminal execution when shell access is disabled", async () => {
      await req(port, "PUT", "/api/permissions/shell", { enabled: false });
      const { status, data } = await req(port, "POST", "/api/terminal/run", {
        command: "echo test",
      });
      expect(status).toBe(403);
      expect(data).toHaveProperty("error", "Shell access is disabled");
      await req(port, "PUT", "/api/permissions/shell", { enabled: true });
    });

    it("rejects multiline terminal commands", async () => {
      await req(port, "PUT", "/api/permissions/shell", { enabled: true });
      const { status, data } = await req(port, "POST", "/api/terminal/run", {
        command: "echo test\nwhoami",
      });
      expect(status).toBe(400);
      expect(data).toHaveProperty(
        "error",
        "Command must be a single line without control characters",
      );
    });

    it("rejects terminal commands containing null bytes", async () => {
      await req(port, "PUT", "/api/permissions/shell", { enabled: true });
      const { status, data } = await req(port, "POST", "/api/terminal/run", {
        command: "echo test\u0000",
      });
      expect(status).toBe(400);
      expect(data).toHaveProperty(
        "error",
        "Command must be a single line without control characters",
      );
    });
  });

  describe("Permission telemetry websocket stream", () => {
    it("broadcasts telemetry events for request/open-settings/shell-toggle", async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      try {
        await waitForWsMessage(ws, (message) => message.type === "status");

        const requestEventPromise = waitForWsMessage(
          ws,
          (message) =>
            message.type === "permissions_telemetry" &&
            message.action === "request",
        );
        await req(port, "POST", "/api/permissions/microphone/request");
        const requestEvent = await requestEventPromise;
        expect(requestEvent).toMatchObject({
          type: "permissions_telemetry",
          source: "api",
          action: "request",
          permissionId: "microphone",
          method: "POST",
          path: "/api/permissions/microphone/request",
        });

        const openSettingsEventPromise = waitForWsMessage(
          ws,
          (message) =>
            message.type === "permissions_telemetry" &&
            message.action === "open-settings",
        );
        await req(port, "POST", "/api/permissions/microphone/open-settings");
        const openSettingsEvent = await openSettingsEventPromise;
        expect(openSettingsEvent).toMatchObject({
          type: "permissions_telemetry",
          source: "api",
          action: "open-settings",
          permissionId: "microphone",
          method: "POST",
          path: "/api/permissions/microphone/open-settings",
        });

        const shellToggleEventPromise = waitForWsMessage(
          ws,
          (message) =>
            message.type === "permissions_telemetry" &&
            message.action === "shell-toggle" &&
            message.enabled === false,
        );
        await req(port, "PUT", "/api/permissions/shell", { enabled: false });
        const shellToggleEvent = await shellToggleEventPromise;
        expect(shellToggleEvent).toMatchObject({
          type: "permissions_telemetry",
          source: "api",
          action: "shell-toggle",
          permissionId: "shell",
          enabled: false,
          previousEnabled: true,
          method: "PUT",
          path: "/api/permissions/shell",
        });
      } finally {
        ws.close();
        await req(port, "PUT", "/api/permissions/shell", { enabled: true });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/permissions/state
  // ─────────────────────────────────────────────────────────────────────────

  describe("PUT /api/permissions/state", () => {
    it("updates permission states from Electron", async () => {
      const mockPermissions = {
        microphone: {
          id: "microphone",
          status: "granted",
          lastChecked: Date.now(),
          canRequest: false,
        },
        camera: {
          id: "camera",
          status: "denied",
          lastChecked: Date.now(),
          canRequest: true,
        },
      };

      const { status, data } = await req(
        port,
        "PUT",
        "/api/permissions/state",
        {
          permissions: mockPermissions,
        },
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty("updated", true);
      expect(data).toHaveProperty("permissions");
    });

    it("returns 400 for missing body", async () => {
      const { status } = await req(port, "PUT", "/api/permissions/state");
      expect(status).toBe(400);
    });

    it("allows empty permissions object", async () => {
      const { status, data } = await req(
        port,
        "PUT",
        "/api/permissions/state",
        {
          permissions: {},
        },
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("updated", true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge cases and error handling
  // ─────────────────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("handles malformed permission ID with special characters", async () => {
      const { status } = await req(
        port,
        "GET",
        "/api/permissions/../../etc/passwd",
      );
      // Should be rejected as invalid or not found
      expect([400, 404]).toContain(status);
    });

    it("handles empty permission ID", async () => {
      const { status } = await req(port, "GET", "/api/permissions/");
      // Trailing slash means empty ID
      expect([400, 404]).toContain(status);
    });

    it("handles permission ID with slash", async () => {
      const { status } = await req(
        port,
        "GET",
        "/api/permissions/screen/recording",
      );
      expect([400, 404]).toContain(status);
    });
  });
});

describe("Permissions API auth access", () => {
  const TEST_TOKEN = "permissions-auth-token";
  let port: number;
  let close: () => Promise<void>;
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv("MILADY_API_TOKEN");
    process.env.MILADY_API_TOKEN = TEST_TOKEN;
    const result = await startApiServer({ port: 0 });
    port = result.port;
    close = result.close;
  });

  afterAll(async () => {
    await close();
    envBackup.restore();
  });

  it("blocks unauthenticated access to permissions endpoints", async () => {
    const { status: s1 } = await req(port, "GET", "/api/permissions");
    const { status: s2 } = await req(
      port,
      "GET",
      "/api/permissions/definitions",
    );
    const { status: s3 } = await req(port, "POST", "/api/permissions/refresh");
    const { status: s4 } = await req(
      port,
      "POST",
      "/api/permissions/microphone/request",
    );
    expect(s1).toBe(401);
    expect(s2).toBe(401);
    expect(s3).toBe(401);
    expect(s4).toBe(401);
  });

  it("allows authenticated access to permissions endpoints", async () => {
    const auth = { headers: { Authorization: `Bearer ${TEST_TOKEN}` } };
    const { status: s1 } = await req(
      port,
      "GET",
      "/api/permissions",
      undefined,
      auth,
    );
    const { status: s2, data: definitions } = await req(
      port,
      "GET",
      "/api/permissions/definitions",
      undefined,
      auth,
    );
    const { status: s3 } = await req(
      port,
      "POST",
      "/api/permissions/refresh",
      undefined,
      auth,
    );
    const { status: s4, data } = await req(
      port,
      "POST",
      "/api/permissions/microphone/request",
      undefined,
      auth,
    );
    expect(s1).toBe(200);
    expect(s2).toBe(200);
    expect(s3).toBe(200);
    expect(s4).toBe(200);
    expect(definitions).toHaveProperty("permissions");
    expect(data).toHaveProperty("action", "ipc:permissions:request:microphone");
  });
});
