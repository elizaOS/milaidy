import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Best-effort temp dir cleanup — retries once on ENOTEMPTY (file handle race). */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests
  }
}

import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

function req(
  port: number,
  method: string,
  requestPath: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
      },
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
  character: { name: "Milady" },
  plugins: [],
  getService: () => null,
  getRoomsByWorld: async () => [],
  getMemories: async () => [],
  getCache: async () => null,
  setCache: async () => {},
} as AgentRuntime;

describe("GET /api/onboarding/status", () => {
  const originalStateDir = process.env.ELIZA_STATE_DIR;

  afterEach(async () => {
    if (originalStateDir === undefined) {
      delete process.env.ELIZA_STATE_DIR;
      delete process.env.MILADY_STATE_DIR;
    } else {
      process.env.ELIZA_STATE_DIR = originalStateDir;
      process.env.MILADY_STATE_DIR = originalStateDir;
    }
  });

  it("returns incomplete for a fresh skeleton config even when a runtime exists", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        env: {
          EVM_PRIVATE_KEY: "0xabc123",
          SOLANA_PRIVATE_KEY: "solana-test-key",
        },
        plugins: {
          entries: {
            browser: { enabled: true },
            computeruse: { enabled: true },
            vision: { enabled: true },
            "coding-agent": { enabled: true },
          },
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(false);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns incomplete for partial cloud auth state before onboarding is finished", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          apiKey: "eliza_test_partial_cloud_auth",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(false);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns complete when a provider is configured via env-backed config", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        env: {
          OPENAI_API_KEY: "sk-test-openai",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns complete when cloud inference was explicitly configured", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          inferenceMode: "cloud",
          provider: "elizacloud",
          apiKey: "eliza_test_finished_cloud_setup",
        },
        models: {
          small: "openai/gpt-5-mini",
          large: "anthropic/claude-sonnet-4.5",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
