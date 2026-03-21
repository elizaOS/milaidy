/**
 * Tests for wallet-dex-prices.ts — DEX price oracle with DexScreener primary
 * and DexPaprika fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeValueUsd,
  DEXPAPRIKA_CHAIN_MAP,
  DEXSCREENER_CHAIN_MAP,
  type DexScreenerPair,
  fetchDexPaprikaPrices,
  fetchDexPrices,
  fetchDexScreenerPrices,
  WRAPPED_NATIVE,
} from "../wallet-dex-prices";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function networkError(message: string) {
  return Promise.reject(new Error(message));
}

// ── Constants ────────────────────────────────────────────────────────────

describe("chain map constants", () => {
  it("maps BSC chain ID 56 correctly for both APIs", () => {
    expect(DEXSCREENER_CHAIN_MAP[56]).toBe("bsc");
    expect(DEXPAPRIKA_CHAIN_MAP[56]).toBe("bsc");
  });

  it("maps Ethereum chain ID 1 correctly", () => {
    expect(DEXSCREENER_CHAIN_MAP[1]).toBe("ethereum");
    expect(DEXPAPRIKA_CHAIN_MAP[1]).toBe("ethereum");
  });

  it("provides wrapped native addresses for supported chains", () => {
    expect(WRAPPED_NATIVE[1]).toBeDefined();
    expect(WRAPPED_NATIVE[56]).toBeDefined();
    expect(WRAPPED_NATIVE[8453]).toBeDefined();
  });
});

// ── fetchDexScreenerPrices ───────────────────────────────────────────────

describe("fetchDexScreenerPrices", () => {
  it("returns empty map for unknown chain ID", async () => {
    const result = await fetchDexScreenerPrices(999, ["0xabc"]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty map for empty address list", async () => {
    const result = await fetchDexScreenerPrices(56, []);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches prices from DexScreener and picks best pair by liquidity", async () => {
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xtoken1" },
        priceUsd: "1.50",
        liquidity: { usd: 100_000 },
        info: { imageUrl: "https://img.example.com/token1.png" },
      },
      {
        baseToken: { address: "0xtoken1" },
        priceUsd: "1.49",
        liquidity: { usd: 500_000 },
        info: { imageUrl: "https://img.example.com/token1-v2.png" },
      },
      {
        baseToken: { address: "0xtoken2" },
        priceUsd: "0.005",
        liquidity: { usd: 50_000 },
      },
    ];

    mockFetch.mockReturnValueOnce(jsonResponse(pairs));

    const result = await fetchDexScreenerPrices(56, ["0xtoken1", "0xtoken2"]);

    expect(result.size).toBe(2);
    // token1 should use pair with higher liquidity ($500k)
    expect(result.get("0xtoken1")?.price).toBe("1.49");
    expect(result.get("0xtoken1")?.logoUrl).toBe(
      "https://img.example.com/token1-v2.png",
    );
    expect(result.get("0xtoken2")?.price).toBe("0.005");
    expect(result.get("0xtoken2")?.logoUrl).toBeUndefined();
  });

  it("skips pairs with no priceUsd", async () => {
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xtoken1" },
        priceUsd: null,
        liquidity: { usd: 100_000 },
      },
      {
        baseToken: { address: "0xtoken2" },
        priceUsd: "2.00",
        liquidity: { usd: 50_000 },
      },
    ];

    mockFetch.mockReturnValueOnce(jsonResponse(pairs));

    const result = await fetchDexScreenerPrices(56, ["0xtoken1", "0xtoken2"]);
    expect(result.size).toBe(1);
    expect(result.has("0xtoken1")).toBe(false);
    expect(result.get("0xtoken2")?.price).toBe("2.00");
  });

  it("handles non-OK HTTP response gracefully", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 500));

    const result = await fetchDexScreenerPrices(56, ["0xtoken1"]);
    expect(result.size).toBe(0);
  });

  it("handles non-array response body gracefully", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ error: "rate limited" }));

    const result = await fetchDexScreenerPrices(56, ["0xtoken1"]);
    expect(result.size).toBe(0);
  });

  it("handles network error gracefully", async () => {
    mockFetch.mockReturnValueOnce(networkError("Network timeout"));

    const result = await fetchDexScreenerPrices(56, ["0xtoken1"]);
    expect(result.size).toBe(0);
  });

  it("batches addresses in groups of 30", async () => {
    const addresses = Array.from(
      { length: 35 },
      (_, i) => `0x${i.toString(16).padStart(40, "0")}`,
    );

    // Two batches: 30 + 5
    mockFetch
      .mockReturnValueOnce(jsonResponse([]))
      .mockReturnValueOnce(jsonResponse([]));

    await fetchDexScreenerPrices(1, addresses);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("lowercases base token address for map key", async () => {
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xAbCdEf" },
        priceUsd: "10.00",
        liquidity: { usd: 1_000 },
      },
    ];

    mockFetch.mockReturnValueOnce(jsonResponse(pairs));

    const result = await fetchDexScreenerPrices(1, ["0xabcdef"]);
    expect(result.get("0xabcdef")?.price).toBe("10.00");
  });
});

// ── fetchDexPaprikaPrices ────────────────────────────────────────────────

describe("fetchDexPaprikaPrices", () => {
  it("returns empty map for unknown chain ID", async () => {
    const result = await fetchDexPaprikaPrices(999, ["0xabc"]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty map for empty address list", async () => {
    const result = await fetchDexPaprikaPrices(56, []);
    expect(result.size).toBe(0);
  });

  it("fetches individual token prices from DexPaprika", async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse({ price_usd: 1.23 }))
      .mockReturnValueOnce(jsonResponse({ price_usd: 4.56 }));

    const result = await fetchDexPaprikaPrices(56, ["0xToken1", "0xToken2"]);

    expect(result.size).toBe(2);
    expect(result.get("0xtoken1")?.price).toBe("1.23");
    expect(result.get("0xtoken2")?.price).toBe("4.56");
  });

  it("ignores tokens with zero or negative price", async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse({ price_usd: 0 }))
      .mockReturnValueOnce(jsonResponse({ price_usd: -1 }));

    const result = await fetchDexPaprikaPrices(56, ["0xToken1", "0xToken2"]);
    expect(result.size).toBe(0);
  });

  it("handles non-OK HTTP response gracefully", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}, false, 404));

    const result = await fetchDexPaprikaPrices(56, ["0xToken1"]);
    expect(result.size).toBe(0);
  });

  it("handles network error gracefully", async () => {
    mockFetch.mockReturnValueOnce(networkError("DNS resolution failed"));

    const result = await fetchDexPaprikaPrices(56, ["0xToken1"]);
    expect(result.size).toBe(0);
  });

  it("limits to 20 addresses per request", async () => {
    const addresses = Array.from(
      { length: 25 },
      (_, i) => `0x${i.toString(16).padStart(40, "0")}`,
    );

    // Should only call fetch 20 times (sliced to 20)
    for (let i = 0; i < 20; i++) {
      mockFetch.mockReturnValueOnce(jsonResponse({ price_usd: 1.0 }));
    }

    const result = await fetchDexPaprikaPrices(56, addresses);
    expect(mockFetch).toHaveBeenCalledTimes(20);
    expect(result.size).toBe(20);
  });

  it("accepts price_usd as string", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ price_usd: "7.89" }));

    const result = await fetchDexPaprikaPrices(1, ["0xToken1"]);
    expect(result.get("0xtoken1")?.price).toBe("7.89");
  });

  it("ignores NaN price_usd", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ price_usd: "not-a-number" }));

    const result = await fetchDexPaprikaPrices(1, ["0xToken1"]);
    expect(result.size).toBe(0);
  });
});

// ── fetchDexPrices (combined) ────────────────────────────────────────────

describe("fetchDexPrices", () => {
  it("returns empty map for empty address list", async () => {
    const result = await fetchDexPrices(56, []);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns DexScreener results when all addresses priced", async () => {
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xtoken1" },
        priceUsd: "5.00",
        liquidity: { usd: 100_000 },
      },
    ];

    mockFetch.mockReturnValueOnce(jsonResponse(pairs));

    const result = await fetchDexPrices(56, ["0xToken1"]);
    expect(result.size).toBe(1);
    expect(result.get("0xtoken1")?.price).toBe("5.00");
    // Only DexScreener called, no DexPaprika fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to DexPaprika for tokens missing from DexScreener", async () => {
    // DexScreener returns price for token1 only
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xtoken1" },
        priceUsd: "5.00",
        liquidity: { usd: 100_000 },
      },
    ];

    mockFetch
      // DexScreener call
      .mockReturnValueOnce(jsonResponse(pairs))
      // DexPaprika fallback for token2
      .mockReturnValueOnce(jsonResponse({ price_usd: 2.5 }));

    const result = await fetchDexPrices(56, ["0xToken1", "0xToken2"]);
    expect(result.size).toBe(2);
    expect(result.get("0xtoken1")?.price).toBe("5.00");
    expect(result.get("0xtoken2")?.price).toBe("2.5");
  });

  it("returns partial results when both APIs fail for some tokens", async () => {
    // DexScreener returns nothing
    mockFetch
      .mockReturnValueOnce(jsonResponse([]))
      // DexPaprika also fails for token1
      .mockReturnValueOnce(jsonResponse({}, false, 500))
      // DexPaprika succeeds for token2
      .mockReturnValueOnce(jsonResponse({ price_usd: 3.33 }));

    const result = await fetchDexPrices(56, ["0xToken1", "0xToken2"]);
    expect(result.size).toBe(1);
    expect(result.get("0xtoken2")?.price).toBe("3.33");
  });

  it("lowercases all input addresses", async () => {
    const pairs: DexScreenerPair[] = [
      {
        baseToken: { address: "0xabcdef" },
        priceUsd: "1.00",
        liquidity: { usd: 10_000 },
      },
    ];
    mockFetch.mockReturnValueOnce(jsonResponse(pairs));

    const result = await fetchDexPrices(1, ["0xABCDEF"]);
    expect(result.get("0xabcdef")?.price).toBe("1.00");
  });
});

// ── computeValueUsd ──────────────────────────────────────────────────────

describe("computeValueUsd", () => {
  it("computes USD value from balance and price", () => {
    expect(computeValueUsd("10", "2.5")).toBe("25.00");
  });

  it("returns '0' for zero balance", () => {
    expect(computeValueUsd("0", "100")).toBe("0");
  });

  it("returns '0' for negative balance", () => {
    expect(computeValueUsd("-1", "100")).toBe("0");
  });

  it("returns '0' for zero price", () => {
    expect(computeValueUsd("10", "0")).toBe("0");
  });

  it("returns '0' for NaN balance", () => {
    expect(computeValueUsd("not-a-number", "100")).toBe("0");
  });

  it("returns '0' for NaN price", () => {
    expect(computeValueUsd("10", "xyz")).toBe("0");
  });

  it("handles very small balances", () => {
    expect(computeValueUsd("0.0001", "10000")).toBe("1.00");
  });

  it("handles large values correctly", () => {
    const result = computeValueUsd("1000000", "0.01");
    expect(result).toBe("10000.00");
  });
});
