import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    // ignore
  }
}

function req(
  port: number,
  method: string,
  requestPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path: requestPath, method, headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve({
            status: response.statusCode ?? 0,
            data: JSON.parse(raw) as Record<string, unknown>,
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

const RUNTIME_STUB = {
  character: { name: "Eliza" },
  plugins: [],
  getService: () => null,
  getRoomsByWorld: async () => [],
  getMemories: async () => [],
  getCache: async () => null,
  setCache: async () => {},
} as unknown as AgentRuntime;

const ENV_KEYS_TO_SAVE = [
  "ELIZA_STATE_DIR",
  "MILADY_STATE_DIR",
  "MILADY_CONFIG_PATH",
  "ELIZA_API_TOKEN",
  "MILADY_API_TOKEN",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
] as const;

describe("GET /api/wallet/keys", () => {
  const savedEnv = new Map<string, string | undefined>();
  let tempDir: string;

  beforeEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eliza-wallet-keys-"));
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
    await cleanupTempDir(tempDir);
  });

  it("returns 403 when onboarding is complete", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        meta: { onboardingComplete: true },
        logging: { level: "error" },
      }),
    );
    process.env.ELIZA_API_TOKEN = "onboarding-token";
    process.env.MILADY_API_TOKEN = "onboarding-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/wallet/keys",
        { "x-eliza-token": "onboarding-token" },
      );
      expect(status).toBe(403);
      expect(data.error).toBeTruthy();
    } finally {
      await server.close();
    }
  });

  it("returns 401 without a token when auth is required", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({ logging: { level: "error" } }),
    );
    process.env.ELIZA_API_TOKEN = "test-secret-token";
    process.env.MILADY_API_TOKEN = "test-secret-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status } = await req(server.port, "GET", "/api/wallet/keys");
      expect(status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("returns 403 when no API token is configured during active onboarding", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        meta: { onboardingComplete: false },
        logging: { level: "error" },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/wallet/keys",
      );
      expect(status).toBe(403);
      expect(data.error).toBe(
        "Sensitive endpoint requires API token authentication",
      );
    } finally {
      await server.close();
    }
  });

  it("returns 200 with a valid auth token during onboarding", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        meta: { onboardingComplete: false },
        logging: { level: "error" },
      }),
    );
    process.env.ELIZA_API_TOKEN = "valid-token";
    process.env.MILADY_API_TOKEN = "valid-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/wallet/keys",
        { "x-eliza-token": "valid-token" },
      );
      expect(status).toBe(200);
      expect(typeof data.evmPrivateKey).toBe("string");
    } finally {
      await server.close();
    }
  });
});

describe("POST /api/agent/reset", () => {
  const savedEnv = new Map<string, string | undefined>();
  let tempDir: string;

  beforeEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eliza-agent-reset-"));
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
    await cleanupTempDir(tempDir);
  });

  it("returns 401 when a configured token is missing from the request", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({ logging: { level: "error" } }),
    );
    process.env.ELIZA_API_TOKEN = "reset-token";
    process.env.MILADY_API_TOKEN = "reset-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status } = await req(server.port, "POST", "/api/agent/reset");
      expect(status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("clears onboarding, agent list, and cloud state when auth succeeds", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        meta: { onboardingComplete: true },
        agents: { list: [{ name: "Chen" }] },
        cloud: { enabled: true, apiKey: "cloud-key" },
        logging: { level: "error" },
      }),
    );
    process.env.ELIZA_API_TOKEN = "reset-token";
    process.env.MILADY_API_TOKEN = "reset-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status, data } = await req(
        server.port,
        "POST",
        "/api/agent/reset",
        {
          "x-eliza-token": "reset-token",
        },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ ok: true });

      const savedConfig = JSON.parse(
        await fs.readFile(path.join(tempDir, "eliza.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(savedConfig.meta).toEqual({});
      expect(savedConfig.agents).toEqual({ list: [] });
      expect(savedConfig.cloud).toEqual({});
    } finally {
      await server.close();
    }
  });

  it("still resets successfully when the config has no meta block", async () => {
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        agents: { list: [{ name: "Chen" }] },
        cloud: { enabled: true },
        logging: { level: "error" },
      }),
    );
    process.env.ELIZA_API_TOKEN = "reset-token";
    process.env.MILADY_API_TOKEN = "reset-token";

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status } = await req(server.port, "POST", "/api/agent/reset", {
        "x-eliza-token": "reset-token",
      });
      expect(status).toBe(200);

      const savedConfig = JSON.parse(
        await fs.readFile(path.join(tempDir, "eliza.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(savedConfig.meta).toBeUndefined();
      expect(savedConfig.agents).toEqual({ list: [] });
      expect(savedConfig.cloud).toEqual({});
    } finally {
      await server.close();
    }
  });
});
