/**
 * E2E tests for the wallet API routes.
 *
 * Tests every /api/wallet/* endpoint against the REAL server (no mocks).
 * Some tests require API keys (ALCHEMY_API_KEY, HELIUS_API_KEY) and are
 * skipped when those keys are not present.
 */
import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startApiServer } from "../src/api/server.js";

// ---------------------------------------------------------------------------
// HTTP helper
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

describe("Wallet API E2E", () => {
  let port: number;
  let close: () => Promise<void>;

  // Save and restore env vars
  const savedEnv: Record<string, string | undefined> = {};
  const keysToSave = [
    "EVM_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
    "ALCHEMY_API_KEY",
    "HELIUS_API_KEY",
    "BIRDEYE_API_KEY",
  ];

  beforeAll(async () => {
    // Save current env
    for (const key of keysToSave) {
      savedEnv[key] = process.env[key];
    }

    // Set test keys — use a known EVM key for deterministic address
    process.env.EVM_PRIVATE_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    process.env.SOLANA_PRIVATE_KEY =
      "4wBqpZM9xaSheZzJSMYGnGbUXDPSgWaC1LDUQ27gFdFtGm5qAshpcPMTgjLZ6Y7yDw3p6752kQhBEkZ1bPYoY8h";

    // Start real server
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    // Restore env
    for (const key of keysToSave) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  // ── GET /api/wallet/addresses ──────────────────────────────────────────

  describe("GET /api/wallet/addresses", () => {
    it("returns EVM and Solana addresses", async () => {
      const { status, data } = await req(port, "GET", "/api/wallet/addresses");
      expect(status).toBe(200);
      expect(data.evmAddress).toBeDefined();
      expect(typeof data.evmAddress).toBe("string");
      expect((data.evmAddress as string).startsWith("0x")).toBe(true);
      expect((data.evmAddress as string).length).toBe(42);
      expect(data.solanaAddress).toBeDefined();
      expect(typeof data.solanaAddress).toBe("string");
    });

    it("derives correct EVM address from known private key", async () => {
      // The Hardhat test account #0 private key maps to:
      // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
      const { data } = await req(port, "GET", "/api/wallet/addresses");
      expect((data.evmAddress as string).toLowerCase()).toBe(
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      );
    });
  });

  // ── GET /api/wallet/config ─────────────────────────────────────────────

  describe("GET /api/wallet/config", () => {
    it("returns config status with key indicators", async () => {
      const { status, data } = await req(port, "GET", "/api/wallet/config");
      expect(status).toBe(200);
      expect(typeof data.alchemyKeySet).toBe("boolean");
      expect(typeof data.heliusKeySet).toBe("boolean");
      expect(typeof data.birdeyeKeySet).toBe("boolean");
      expect(Array.isArray(data.evmChains)).toBe(true);
      expect(data.evmAddress).toBeDefined();
      expect(data.solanaAddress).toBeDefined();
    });

    it("reports correct chain list", async () => {
      const { data } = await req(port, "GET", "/api/wallet/config");
      const chains = data.evmChains as string[];
      expect(chains).toContain("Ethereum");
      expect(chains).toContain("Base");
      expect(chains).toContain("Arbitrum");
      expect(chains).toContain("Optimism");
      expect(chains).toContain("Polygon");
    });
  });

  // ── PUT /api/wallet/config ─────────────────────────────────────────────

  describe("PUT /api/wallet/config", () => {
    it("saves API keys and returns ok", async () => {
      const { status, data } = await req(port, "PUT", "/api/wallet/config", {
        ALCHEMY_API_KEY: "test-alchemy-key",
        HELIUS_API_KEY: "test-helius-key",
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify keys were set
      expect(process.env.ALCHEMY_API_KEY).toBe("test-alchemy-key");
      expect(process.env.HELIUS_API_KEY).toBe("test-helius-key");
    });

    it("reflects saved keys in GET /api/wallet/config", async () => {
      // Set keys
      await req(port, "PUT", "/api/wallet/config", {
        ALCHEMY_API_KEY: "test-alchemy-key-2",
      });

      const { data } = await req(port, "GET", "/api/wallet/config");
      expect(data.alchemyKeySet).toBe(true);
    });

    it("also sets SOLANA_RPC_URL when Helius key is provided", async () => {
      await req(port, "PUT", "/api/wallet/config", {
        HELIUS_API_KEY: "test-helius-rpc",
      });

      expect(process.env.SOLANA_RPC_URL).toContain("test-helius-rpc");
      expect(process.env.SOLANA_RPC_URL).toContain("helius-rpc.com");
    });

    it("ignores unknown keys", async () => {
      const { status, data } = await req(port, "PUT", "/api/wallet/config", {
        ALCHEMY_API_KEY: "valid-key",
        UNKNOWN_KEY: "should-be-ignored",
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(process.env.UNKNOWN_KEY).toBeUndefined();
    });
  });

  // ── POST /api/wallet/export ────────────────────────────────────────────

  describe("POST /api/wallet/export", () => {
    it("rejects export without confirm flag (empty body)", async () => {
      const { status } = await req(port, "POST", "/api/wallet/export", {});
      // Empty object has no `confirm` field, server returns 403
      expect(status).toBe(403);
    });

    it("rejects export with confirm: false", async () => {
      const { status } = await req(port, "POST", "/api/wallet/export", {
        confirm: false,
      });
      expect(status).toBe(403);
    });

    it("returns private keys and addresses with confirm: true", async () => {
      const { status, data } = await req(port, "POST", "/api/wallet/export", {
        confirm: true,
      });
      expect(status).toBe(200);

      const evm = data.evm as { privateKey: string; address: string | null } | null;
      const solana = data.solana as { privateKey: string; address: string | null } | null;

      expect(evm).not.toBeNull();
      expect(evm?.privateKey).toBeDefined();
      expect(evm?.privateKey.startsWith("0x")).toBe(true);
      expect(evm?.address).toBeDefined();

      expect(solana).not.toBeNull();
      expect(solana?.privateKey).toBeDefined();
      expect(solana?.address).toBeDefined();
    });

    it("returns the same key that was set in env", async () => {
      const { data } = await req(port, "POST", "/api/wallet/export", {
        confirm: true,
      });
      const evm = data.evm as { privateKey: string };
      expect(evm.privateKey).toBe(process.env.EVM_PRIVATE_KEY);
    });
  });

  // ── GET /api/wallet/balances (requires API keys) ───────────────────────

  describe("GET /api/wallet/balances", () => {
    it("returns balance structure (even if empty)", async () => {
      // This test works even without real API keys — server returns null for
      // chains that can't be fetched
      const { status, data } = await req(port, "GET", "/api/wallet/balances");
      expect(status).toBe(200);
      expect("evm" in data).toBe(true);
      expect("solana" in data).toBe(true);
    });

    it.skipIf(!process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY.startsWith("test"))(
      "fetches real EVM balances with Alchemy key",
      async () => {
        const { data } = await req(port, "GET", "/api/wallet/balances");
        const evm = data.evm as { address: string; chains: Array<{ chain: string; nativeBalance: string }> } | null;
        if (evm) {
          expect(evm.address).toBeDefined();
          expect(evm.chains.length).toBeGreaterThan(0);
          expect(evm.chains[0].chain).toBeDefined();
          expect(evm.chains[0].nativeBalance).toBeDefined();
        }
      },
      60_000,
    );

    it.skipIf(!process.env.HELIUS_API_KEY || process.env.HELIUS_API_KEY.startsWith("test"))(
      "fetches real Solana balances with Helius key",
      async () => {
        const { data } = await req(port, "GET", "/api/wallet/balances");
        const solana = data.solana as { address: string; solBalance: string } | null;
        if (solana) {
          expect(solana.address).toBeDefined();
          expect(solana.solBalance).toBeDefined();
        }
      },
      60_000,
    );
  });

  // ── GET /api/wallet/nfts (requires API keys) ──────────────────────────

  describe("GET /api/wallet/nfts", () => {
    it("returns NFT structure (even if empty)", async () => {
      const { status, data } = await req(port, "GET", "/api/wallet/nfts");
      expect(status).toBe(200);
      expect(Array.isArray(data.evm)).toBe(true);
      expect("solana" in data).toBe(true);
    });

    it.skipIf(!process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY.startsWith("test"))(
      "fetches real EVM NFTs with Alchemy key",
      async () => {
        const { data } = await req(port, "GET", "/api/wallet/nfts");
        const evm = data.evm as Array<{ chain: string; nfts: unknown[] }>;
        expect(evm.length).toBeGreaterThan(0);
        // Each chain entry should have the expected shape
        for (const chainData of evm) {
          expect(typeof chainData.chain).toBe("string");
          expect(Array.isArray(chainData.nfts)).toBe(true);
        }
      },
      60_000,
    );
  });

  // ── Onboarding key generation ──────────────────────────────────────────

  describe("Wallet key generation during onboarding", () => {
    it("generates keys when not present", async () => {
      // Remove keys temporarily
      const savedEvm = process.env.EVM_PRIVATE_KEY;
      const savedSol = process.env.SOLANA_PRIVATE_KEY;
      delete process.env.EVM_PRIVATE_KEY;
      delete process.env.SOLANA_PRIVATE_KEY;

      // Start a fresh server
      const freshServer = await startApiServer({ port: 0 });

      try {
        // Trigger onboarding which should generate keys
        await req(freshServer.port, "POST", "/api/onboarding", {
          name: "TestAgent",
          bio: ["A test agent"],
          systemPrompt: "You are a test agent.",
        });

        // After onboarding, keys should be set
        expect(process.env.EVM_PRIVATE_KEY).toBeDefined();
        expect(process.env.SOLANA_PRIVATE_KEY).toBeDefined();

        // Verify addresses are derivable
        const { data } = await req(
          freshServer.port,
          "GET",
          "/api/wallet/addresses",
        );
        expect(data.evmAddress).toBeDefined();
        expect(data.solanaAddress).toBeDefined();
      } finally {
        await freshServer.close();
        // Restore keys
        if (savedEvm) process.env.EVM_PRIVATE_KEY = savedEvm;
        else delete process.env.EVM_PRIVATE_KEY;
        if (savedSol) process.env.SOLANA_PRIVATE_KEY = savedSol;
        else delete process.env.SOLANA_PRIVATE_KEY;
      }
    }, 30_000);
  });
});

// ---------------------------------------------------------------------------
// Wallet module unit tests (address derivation)
// ---------------------------------------------------------------------------

describe("Wallet module — address derivation", () => {
  it("generates valid wallet keys", async () => {
    const { generateWalletKeys } = await import("../src/api/wallet.js");
    const keys = generateWalletKeys();

    // EVM
    expect(keys.evmPrivateKey.startsWith("0x")).toBe(true);
    expect(keys.evmPrivateKey.length).toBe(66); // 0x + 64 hex chars
    expect(keys.evmAddress.startsWith("0x")).toBe(true);
    expect(keys.evmAddress.length).toBe(42);

    // Solana
    expect(keys.solanaPrivateKey.length).toBeGreaterThan(0);
    expect(keys.solanaAddress.length).toBeGreaterThan(0);
  });

  it("derives deterministic EVM address", async () => {
    const { deriveEvmAddress } = await import("../src/api/wallet.js");

    // Hardhat test account #0
    const address = deriveEvmAddress(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    expect(address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });

  it("derives deterministic Solana address", async () => {
    const { generateWalletKeys, deriveSolanaAddress } = await import(
      "../src/api/wallet.js"
    );

    // Generate and then re-derive — should be consistent
    const keys = generateWalletKeys();
    const rederived = deriveSolanaAddress(keys.solanaPrivateKey);
    expect(rederived).toBe(keys.solanaAddress);
  });

  it("generates different keys on each call", async () => {
    const { generateWalletKeys } = await import("../src/api/wallet.js");
    const keys1 = generateWalletKeys();
    const keys2 = generateWalletKeys();

    expect(keys1.evmPrivateKey).not.toBe(keys2.evmPrivateKey);
    expect(keys1.solanaPrivateKey).not.toBe(keys2.solanaPrivateKey);
    expect(keys1.evmAddress).not.toBe(keys2.evmAddress);
    expect(keys1.solanaAddress).not.toBe(keys2.solanaAddress);
  });
});
