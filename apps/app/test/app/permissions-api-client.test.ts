import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MiladyClient } from "../../src/api-client";

describe("MiladyClient permissions contract helpers", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.endsWith("/api/permissions") && method === "GET") {
          return new Response(
            JSON.stringify({
              permissions: {
                microphone: {
                  id: "microphone",
                  status: "granted",
                  lastChecked: 10,
                  canRequest: false,
                },
              },
              platform: "darwin",
              shellEnabled: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.endsWith("/api/permissions/microphone") && method === "GET") {
          return new Response(
            JSON.stringify({
              id: "microphone",
              status: "granted",
              lastChecked: 11,
              canRequest: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (
          url.endsWith("/api/permissions/microphone/request") &&
          method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              message: "Permission request for microphone",
              action: "ipc:permissions:request:microphone",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.endsWith("/api/permissions/refresh") && method === "POST") {
          return new Response(
            JSON.stringify({
              message: "Permission refresh requested",
              action: "ipc:permissions:refresh",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.endsWith("/api/permissions/shell") && method === "PUT") {
          return new Response(
            JSON.stringify({
              shellEnabled: false,
              permission: {
                id: "shell",
                status: "denied",
                lastChecked: 12,
                canRequest: false,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.endsWith("/api/permissions/definitions") && method === "GET") {
          return new Response(
            JSON.stringify({
              platform: "darwin",
              permissions: [
                {
                  id: "microphone",
                  name: "Microphone",
                  description:
                    "Voice input for talk mode and speech recognition",
                  icon: "mic",
                  platforms: ["darwin", "win32", "linux"],
                  requiredForFeatures: ["talkmode", "voice"],
                  applicable: true,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    );

    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("unwraps /api/permissions summary to permission map", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    const permissions = await client.getPermissions();
    expect(permissions).toHaveProperty("microphone");
    expect(permissions.microphone?.status).toBe("granted");
  });

  test("refreshPermissions triggers refresh action then reloads states", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    const permissions = await client.refreshPermissions();
    expect(permissions.microphone?.status).toBe("granted");

    const calls = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      method: ((call[1]?.method as string | undefined) ?? "GET").toUpperCase(),
    }));
    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/permissions/refresh",
      method: "POST",
    });
    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/permissions",
      method: "GET",
    });
  });

  test("requestPermission posts action and then fetches current permission state", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    const permission = await client.requestPermission("microphone");
    expect(permission).toMatchObject({
      id: "microphone",
      status: "granted",
    });

    const calls = fetchMock.mock.calls.map((call) => ({
      url: String(call[0]),
      method: ((call[1]?.method as string | undefined) ?? "GET").toUpperCase(),
    }));
    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/permissions/microphone/request",
      method: "POST",
    });
    expect(calls).toContainEqual({
      url: "http://localhost:2138/api/permissions/microphone",
      method: "GET",
    });
  });

  test("setShellEnabled returns normalized permission payload", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    const shell = await client.setShellEnabled(false);
    expect(shell).toMatchObject({
      id: "shell",
      status: "denied",
      canRequest: false,
    });
  });

  test("loads permission definitions", async () => {
    const client = new MiladyClient("http://localhost:2138", "token");
    const definitions = await client.getPermissionDefinitions();
    expect(definitions.platform).toBe("darwin");
    expect(definitions.permissions[0]).toMatchObject({
      id: "microphone",
      applicable: true,
    });
  });
});
