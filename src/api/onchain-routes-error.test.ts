/**
 * Route-level error propagation tests for on-chain endpoints (MW-02).
 *
 * Verifies that when registry/drop services ARE configured but throw
 * (timeout, nonce, contract errors), the global HTTP error handler maps
 * them to HTTP 500 responses with the error message.
 *
 * Strategy: mock the RegistryService/DropService constructors with classes
 * that throw domain-specific errors, and mock config to enable initialization.
 */

import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Error-throwing service mocks ────────────────────────────────────────────

class ThrowingRegistryService {
  static defaultCapabilitiesHash() {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  async getStatus(): Promise<never> {
    throw new Error("timeout: tx took too long");
  }
  async register(): Promise<never> {
    throw new Error("nonce has already been used");
  }
  async updateTokenURI(): Promise<never> {
    throw new Error("replacement transaction underpriced");
  }
  async syncProfile(): Promise<never> {
    throw new Error("timeout: tx took too long");
  }
  async getChainId(): Promise<number> {
    return 1;
  }
}

class ThrowingDropService {
  async getStatus(): Promise<never> {
    throw new Error("call revert exception");
  }
  async mint(): Promise<never> {
    throw new Error("insufficient funds");
  }
  async mintShiny(): Promise<never> {
    throw new Error("insufficient funds for shiny");
  }
  async mintWithWhitelist(): Promise<never> {
    throw new Error("invalid proof");
  }
}

// ── Module mocks (hoisted by vitest) ────────────────────────────────────────

vi.mock("./tx-service", () => ({
  TxService: class MockTxService {
    address = "0x1111111111111111111111111111111111111111";
    getContract() {
      return {};
    }
  },
}));

vi.mock("./registry-service", () => ({
  RegistryService: ThrowingRegistryService,
}));

vi.mock("./drop-service", () => ({
  DropService: ThrowingDropService,
}));

vi.mock("../config/config", () => ({
  loadMiladyConfig: () => ({
    registry: {
      registryAddress: "0x2222222222222222222222222222222222222222",
      mainnetRpc: "http://mock-rpc",
      collectionAddress: "0x3333333333333333333333333333333333333333",
    },
    features: { dropEnabled: true },
    env: {
      EVM_PRIVATE_KEY:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  }),
  saveMiladyConfig: () => {},
  configFileExists: () => true,
}));

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ── HTTP helper ─────────────────────────────────────────────────────────────

function req(
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
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
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

// ── Tests ───────────────────────────────────────────────────────────────────

const { startApiServer } = await import("./server");

describe("on-chain route error propagation (MW-02)", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
    // Allow async IIFE that initializes services to complete
    await new Promise((r) => setTimeout(r, 100));
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  // ── Registry error paths ──────────────────────────────────────────────

  it("GET /api/registry/status returns 500 on service timeout", async () => {
    const { status, data } = await req(port, "GET", "/api/registry/status");
    expect(status).toBe(500);
    expect(data.error).toMatch(/timeout/i);
  });

  it("POST /api/registry/register returns 500 on nonce error", async () => {
    const { status, data } = await req(port, "POST", "/api/registry/register", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/nonce/i);
  });

  it("POST /api/registry/update-uri returns 500 on tx underpriced", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/registry/update-uri",
      { tokenURI: "ipfs://test" },
    );
    expect(status).toBe(500);
    expect(data.error).toMatch(/underpriced/i);
  });

  it("POST /api/registry/sync returns 500 on timeout", async () => {
    const { status, data } = await req(port, "POST", "/api/registry/sync", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/timeout/i);
  });

  // ── Drop error paths ──────────────────────────────────────────────────

  it("GET /api/drop/status returns 500 on contract revert", async () => {
    const { status, data } = await req(port, "GET", "/api/drop/status");
    expect(status).toBe(500);
    expect(data.error).toMatch(/revert/i);
  });

  it("POST /api/drop/mint returns 500 on insufficient funds", async () => {
    const { status, data } = await req(port, "POST", "/api/drop/mint", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/insufficient funds/i);
  });
});
