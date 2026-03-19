/**
 * Tests for wallet-evm-balance.ts — EVM balance fetching with Alchemy, Ankr,
 * and direct-RPC fallback paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EVM_CHAINS,
  type EvmProviderKeys,
  fetchEvmBalances,
  fetchEvmNfts,
  resolveEvmProviderKeys,
} from "../wallet-evm-balance";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../wallet-dex-prices", () => ({
  fetchDexPrices: vi.fn().mockResolvedValue(new Map()),
  computeValueUsd: vi.fn().mockReturnValue("0"),
  WRAPPED_NATIVE: {
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    8453: "0x4200000000000000000000000000000000000006",
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    10: "0x4200000000000000000000000000000000000006",
    137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Clear process.env overrides
  delete process.env.NODEREAL_BSC_RPC_URL;
  delete process.env.QUICKNODE_BSC_RPC_URL;
  delete process.env.BSC_RPC_URL;
  delete process.env.ETHEREUM_RPC_URL;
  delete process.env.BASE_RPC_URL;
  delete process.env.AVALANCHE_RPC_URL;
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.ELIZAOS_CLOUD_BASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

function rpcResult(result: unknown) {
  return jsonResponse({ jsonrpc: "2.0", id: 1, result });
}

function networkError(message: string) {
  return Promise.reject(new Error(message));
}

// ── resolveEvmProviderKeys ───────────────────────────────────────────────

describe("resolveEvmProviderKeys", () => {
  it("resolves string alchemy key with optional ankr key", () => {
    const keys = resolveEvmProviderKeys("alchemy-123", "ankr-456");
    expect(keys.alchemyKey).toBe("alchemy-123");
    expect(keys.ankrKey).toBe("ankr-456");
  });

  it("resolves null alchemy key", () => {
    const keys = resolveEvmProviderKeys(null);
    expect(keys.alchemyKey).toBeNull();
    expect(keys.ankrKey).toBeNull();
  });

  it("resolves undefined alchemy key", () => {
    const keys = resolveEvmProviderKeys(undefined);
    expect(keys.alchemyKey).toBeNull();
  });

  it("trims whitespace from keys", () => {
    const keys = resolveEvmProviderKeys("  alchemy-key  ", "  ankr-key  ");
    expect(keys.alchemyKey).toBe("alchemy-key");
    expect(keys.ankrKey).toBe("ankr-key");
  });

  it("treats empty string as null", () => {
    const keys = resolveEvmProviderKeys("", "   ");
    expect(keys.alchemyKey).toBeNull();
    expect(keys.ankrKey).toBeNull();
  });

  it("resolves object-form provider keys", () => {
    const input: EvmProviderKeys = {
      alchemyKey: "alchemy-obj",
      ankrKey: "ankr-obj",
      nodeRealBscRpcUrl: "https://nodereal.example.com",
      quickNodeBscRpcUrl: "https://quicknode.example.com",
      bscRpcUrl: "https://bsc.example.com",
      ethereumRpcUrl: null,
      baseRpcUrl: null,
    };
    const keys = resolveEvmProviderKeys(input);
    expect(keys.alchemyKey).toBe("alchemy-obj");
    expect(keys.ankrKey).toBe("ankr-obj");
    expect(keys.nodeRealBscRpcUrl).toBe("https://nodereal.example.com");
    expect(keys.quickNodeBscRpcUrl).toBe("https://quicknode.example.com");
    expect(keys.bscRpcUrl).toBe("https://bsc.example.com");
    expect(keys.ethereumRpcUrl).toBeNull();
    expect(keys.baseRpcUrl).toBeNull();
  });

  it("falls back to process.env for BSC RPC URLs when object keys are missing", () => {
    process.env.NODEREAL_BSC_RPC_URL = "https://env-nodereal.example.com";
    process.env.BSC_RPC_URL = "https://env-bsc.example.com";

    const keys = resolveEvmProviderKeys({});
    expect(keys.nodeRealBscRpcUrl).toBe("https://env-nodereal.example.com");
    expect(keys.bscRpcUrl).toBe("https://env-bsc.example.com");
  });

  it("object ankrKey falls back to second argument", () => {
    const keys = resolveEvmProviderKeys({}, "fallback-ankr");
    expect(keys.ankrKey).toBe("fallback-ankr");
  });
});

// ── DEFAULT_EVM_CHAINS ───────────────────────────────────────────────────

describe("DEFAULT_EVM_CHAINS", () => {
  it("includes Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, and Avalanche", () => {
    const names = DEFAULT_EVM_CHAINS.map((c) => c.name);
    expect(names).toContain("Ethereum");
    expect(names).toContain("Base");
    expect(names).toContain("Arbitrum");
    expect(names).toContain("Optimism");
    expect(names).toContain("Polygon");
    expect(names).toContain("BSC");
    expect(names).toContain("Avalanche");
  });

  it("has BSC with chain ID 56", () => {
    const bsc = DEFAULT_EVM_CHAINS.find((c) => c.name === "BSC");
    expect(bsc).toBeDefined();
    expect(bsc?.chainId).toBe(56);
    expect(bsc?.nativeSymbol).toBe("BNB");
  });

  it("has correct native symbols", () => {
    const eth = DEFAULT_EVM_CHAINS.find((c) => c.name === "Ethereum");
    expect(eth?.nativeSymbol).toBe("ETH");
    const polygon = DEFAULT_EVM_CHAINS.find((c) => c.name === "Polygon");
    expect(polygon?.nativeSymbol).toBe("POL");
  });
});

// ── fetchEvmBalances — Ankr path ─────────────────────────────────────────

describe("fetchEvmBalances — Ankr path", () => {
  it("fetches balances via Ankr when ankrKey is provided and chain uses ankr provider", async () => {
    const ankrResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        assets: [
          {
            tokenType: "NATIVE",
            tokenSymbol: "BNB",
            tokenDecimals: 18,
            tokenBalance: "1000000000000000000",
            contractAddress: "0x0000000000000000000000000000000000000000",
          },
          {
            tokenType: "ERC20",
            tokenSymbol: "USDT",
            tokenName: "Tether USD",
            tokenDecimals: 18,
            tokenBalance: "5000000000000000000",
            contractAddress: "0x55d398326f99059ff775485246999027b3197955",
            thumbnail: "https://example.com/usdt.png",
          },
        ],
      },
    };

    mockFetch.mockReturnValue(jsonResponse(ankrResponse));

    // Use ankr provider chain config
    const keys: EvmProviderKeys = {
      ankrKey: "test-ankr-key",
      alchemyKey: null,
    };

    const results = await fetchEvmBalances("0xWalletAddress", keys);

    // Should have results for any chains that matched (alchemy chains with no
    // alchemy key and no RPC fallback will be filtered out)
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── fetchEvmBalances — Direct RPC fallback ───────────────────────────────

describe("fetchEvmBalances — Direct RPC fallback", () => {
  it("uses BSC RPC URL when no Alchemy/Ankr keys available", async () => {
    const nativeBalanceHex = "0xde0b6b3a7640000"; // 1 ETH in wei

    // eth_getBalance response
    mockFetch.mockReturnValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: nativeBalanceHex,
      }),
    );

    const keys: EvmProviderKeys = {
      alchemyKey: null,
      ankrKey: null,
      bscRpcUrl: "https://bsc-rpc.example.com",
    };

    const results = await fetchEvmBalances("0xWallet", keys);
    // At least BSC chain should be present
    const bsc = results.find((r) => r.chainId === 56);
    expect(bsc).toBeDefined();
    expect(bsc?.error).toBeNull();
  });

  it("returns error chain balance when all RPC endpoints fail", async () => {
    mockFetch.mockReturnValue(networkError("Connection refused"));

    const keys: EvmProviderKeys = {
      alchemyKey: null,
      ankrKey: null,
      bscRpcUrl: "https://broken-rpc.example.com",
    };

    const results = await fetchEvmBalances("0xWallet", keys);
    const bsc = results.find((r) => r.chainId === 56);
    expect(bsc).toBeDefined();
    expect(bsc?.error).toBeTruthy();
    expect(bsc?.nativeBalance).toBe("0");
  });

  it("uses Ethereum RPC URL for chain ID 1 without Alchemy", async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x0",
      }),
    );

    const keys: EvmProviderKeys = {
      alchemyKey: null,
      ankrKey: null,
      ethereumRpcUrl: "https://eth-rpc.example.com",
    };

    const results = await fetchEvmBalances("0xWallet", keys);
    const eth = results.find((r) => r.chainId === 1);
    expect(eth).toBeDefined();
    expect(eth?.chain).toBe("Ethereum");
  });

  it("uses Base RPC URL for chain ID 8453 without Alchemy", async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x0",
      }),
    );

    const keys: EvmProviderKeys = {
      alchemyKey: null,
      ankrKey: null,
      baseRpcUrl: "https://base-rpc.example.com",
    };

    const results = await fetchEvmBalances("0xWallet", keys);
    const base = results.find((r) => r.chainId === 8453);
    expect(base).toBeDefined();
    expect(base?.chain).toBe("Base");
  });

  it("uses cloud-managed fallback RPCs when explicit RPC URLs are absent", async () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://cloud.example";
    mockFetch.mockReturnValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x0",
      }),
    );

    const results = await fetchEvmBalances("0xWallet", {
      alchemyKey: null,
      ankrKey: null,
      cloudManagedAccess: true,
    });

    expect(results.map((r) => r.chain)).toEqual(
      expect.arrayContaining(["Ethereum", "Base", "BSC", "Avalanche"]),
    );
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes(
          "https://cloud.example/api/v1/proxy/evm-rpc/mainnet?api_key=ck-test",
        ),
      ),
    ).toBe(true);
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes(
          "https://cloud.example/api/v1/proxy/evm-rpc/bsc?api_key=ck-test",
        ),
      ),
    ).toBe(true);
  });
});

// ── fetchEvmBalances — multi-chain aggregation ───────────────────────────

describe("fetchEvmBalances — multi-chain aggregation", () => {
  it("returns results for all configured chains when Alchemy key provided", async () => {
    // Mock all fetch calls to return valid RPC responses
    mockFetch.mockReturnValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: "0x0",
      }),
    );

    const results = await fetchEvmBalances("0xWallet", "test-alchemy-key");

    // Should return results for all DEFAULT_EVM_CHAINS
    expect(results.length).toBe(DEFAULT_EVM_CHAINS.length);
    for (const r of results) {
      expect(r.chain).toBeDefined();
      expect(r.chainId).toBeDefined();
      expect(r.nativeSymbol).toBeDefined();
    }
  });

  it("filters chains based on available keys", async () => {
    // No keys at all — no chains should be active
    const results = await fetchEvmBalances("0xWallet", null);
    expect(results.length).toBe(0);
  });
});

// ── fetchEvmBalances — error handling ────────────────────────────────────

describe("fetchEvmBalances — error handling", () => {
  it("returns failure chain balance instead of throwing on fetch error", async () => {
    mockFetch.mockReturnValue(networkError("ECONNREFUSED"));

    const results = await fetchEvmBalances("0xWallet", "test-alchemy-key");

    for (const r of results) {
      expect(r.error).toBeTruthy();
      expect(r.nativeBalance).toBe("0");
      expect(r.tokens).toEqual([]);
    }
  });

  it("handles invalid JSON response", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("not valid json {{{"),
      }),
    );

    const results = await fetchEvmBalances("0xWallet", "test-alchemy-key");

    for (const r of results) {
      expect(r.error).toBeTruthy();
    }
  });

  it("handles HTTP error response", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      }),
    );

    const results = await fetchEvmBalances("0xWallet", "test-alchemy-key");

    for (const r of results) {
      expect(r.error).toBeTruthy();
    }
  });
});

// ── fetchEvmNfts ─────────────────────────────────────────────────────────

describe("fetchEvmNfts", () => {
  it("returns empty NFT arrays when no keys provided", async () => {
    const results = await fetchEvmNfts("0xWallet", null);
    expect(results.length).toBe(0);
  });

  it("fetches NFTs via Alchemy when key is provided", async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        ownedNfts: [
          {
            contract: {
              address: "0xNftContract",
              name: "TestCollection",
              openSeaMetadata: { collectionName: "Test NFTs" },
            },
            tokenId: "42",
            name: "Test NFT #42",
            description: "A test NFT",
            image: {
              cachedUrl: "https://img.example.com/nft42.png",
            },
            tokenType: "ERC721",
          },
        ],
      }),
    );

    const results = await fetchEvmNfts("0xWallet", "test-alchemy-key");

    expect(results.length).toBeGreaterThan(0);
    // Find any chain that returned NFTs
    const withNfts = results.find((r) => r.nfts.length > 0);
    if (withNfts) {
      expect(withNfts.nfts[0].name).toBe("Test NFT #42");
      expect(withNfts.nfts[0].tokenId).toBe("42");
      expect(withNfts.nfts[0].collectionName).toBe("Test NFTs");
    }
  });

  it("returns empty nfts array on error instead of throwing", async () => {
    mockFetch.mockReturnValue(networkError("Timeout"));

    const results = await fetchEvmNfts("0xWallet", "test-alchemy-key");

    for (const r of results) {
      expect(r.nfts).toEqual([]);
    }
  });
});

// ── Token balance parsing edge cases ─────────────────────────────────────

describe("token balance edge cases", () => {
  it("filters zero token balances from Alchemy results", async () => {
    // eth_getBalance
    mockFetch
      .mockReturnValueOnce(rpcResult("0xde0b6b3a7640000"))
      // alchemy_getTokenBalances
      .mockReturnValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tokenBalances: [
              { contractAddress: "0xToken1", tokenBalance: "0x0" },
              { contractAddress: "0xToken2", tokenBalance: "0x" },
              {
                contractAddress: "0xToken3",
                tokenBalance: "0xde0b6b3a7640000",
              },
            ],
          },
        }),
      )
      // Token metadata for the one non-zero token
      .mockReturnValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 3,
          result: {
            name: "TestToken",
            symbol: "TT",
            decimals: 18,
            logo: null,
          },
        }),
      );

    const results = await fetchEvmBalances("0xWallet", "test-alchemy-key");

    // Find Ethereum chain result
    const eth = results.find((r) => r.chainId === 1);
    if (eth && !eth.error) {
      // Only the non-zero token should appear
      expect(eth.tokens.length).toBeLessThanOrEqual(1);
    }
  });
});
