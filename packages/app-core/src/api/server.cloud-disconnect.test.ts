import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

function request(
  port: number,
  method: string,
  requestPath: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            data: JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<
              string,
              unknown
            >,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("server cloud disconnect", () => {
  const ENV_KEYS_TO_SAVE = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "MILADY_CONFIG_PATH",
  ] as const;

  const savedEnv = new Map<string, string | undefined>();
  for (const key of ENV_KEYS_TO_SAVE) {
    savedEnv.set(key, process.env[key]);
  }

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("uses the unified cloud disconnect path for the running API server", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-cloud-disconnect-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          apiKey: "ck-live",
        },
      }),
    );

    let authenticated = true;
    const logoutMock = vi.fn(() => {
      authenticated = false;
    });
    const updateAgentMock = vi.fn(async () => undefined);
    const setSettingMock = vi.fn();

    const runtime = {
      agentId: "00000000-0000-0000-0000-000000000001",
      character: {
        name: "Eliza",
        settings: {
          ELIZA_CLOUD_AUTH_TOKEN: "auth-token",
        },
        secrets: {
          ELIZAOS_CLOUD_API_KEY: "ck-live",
          ELIZAOS_CLOUD_ENABLED: "true",
          ELIZA_CLOUD_AUTH_TOKEN: "auth-token",
        },
      },
      plugins: [],
      getService: (name: string) =>
        name === "CLOUD_AUTH"
          ? {
              isAuthenticated: () => authenticated,
              getUserId: () => "user-1",
              logout: logoutMock,
            }
          : null,
      setSetting: setSettingMock,
      updateAgent: updateAgentMock,
      getRoomsByWorld: async () => [],
      getMemories: async () => [],
      getCache: async () => null,
      setCache: async () => {},
    } as unknown as AgentRuntime;

    const server = await startApiServer({ port: 0, runtime });

    try {
      const before = await request(server.port, "GET", "/api/cloud/status");
      expect(before.status).toBe(200);
      expect(before.data).toEqual({
        connected: true,
        enabled: true,
        hasApiKey: true,
        userId: "user-1",
        organizationId: undefined,
        topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
        reason: undefined,
      });

      const disconnect = await request(
        server.port,
        "POST",
        "/api/cloud/disconnect",
      );
      expect(disconnect.status).toBe(200);
      expect(disconnect.data).toEqual({ ok: true, status: "disconnected" });
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(updateAgentMock).toHaveBeenCalledTimes(1);
      expect(setSettingMock).toHaveBeenCalledWith(
        "ELIZA_CLOUD_AUTH_TOKEN",
        null,
      );

      const after = await request(server.port, "GET", "/api/cloud/status");
      expect(after.status).toBe(200);
      expect(after.data).toEqual({
        connected: false,
        enabled: false,
        hasApiKey: false,
        reason: "not_authenticated",
      });
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
