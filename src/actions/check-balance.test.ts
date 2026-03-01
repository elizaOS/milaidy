/**
 * Unit tests for the CHECK_BALANCE action.
 *
 * Verifies API call handling, chain filtering, response formatting,
 * empty/null balances, error handling, and action metadata.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerOptions } from "@elizaos/core";
import { checkBalanceAction } from "./check-balance";

// ── Helpers ──────────────────────────────────────────────────────────────────

function callHandler(params: Record<string, unknown> = {}) {
  return checkBalanceAction.handler(
    {} as never,
    {} as never,
    {} as never,
    { parameters: params } as HandlerOptions,
  );
}

/** Full multi-chain mock response matching WalletBalancesResponse. */
function makeFullResponse() {
  return {
    evm: {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      chains: [
        {
          chain: "bsc",
          chainId: 56,
          nativeBalance: "1.5",
          nativeSymbol: "BNB",
          nativeValueUsd: "450.00",
          tokens: [
            {
              symbol: "USDT",
              name: "Tether USD",
              contractAddress: "0xusdt",
              balance: "100.0",
              decimals: 18,
              valueUsd: "100.00",
              logoUrl: "",
            },
            {
              symbol: "CAKE",
              name: "PancakeSwap",
              contractAddress: "0xcake",
              balance: "50.0",
              decimals: 18,
              valueUsd: "150.00",
              logoUrl: "",
            },
          ],
          error: null,
        },
        {
          chain: "ethereum",
          chainId: 1,
          nativeBalance: "0.5",
          nativeSymbol: "ETH",
          nativeValueUsd: "1500.00",
          tokens: [],
          error: null,
        },
        {
          chain: "base",
          chainId: 8453,
          nativeBalance: "0.1",
          nativeSymbol: "ETH",
          nativeValueUsd: "300.00",
          tokens: [],
          error: null,
        },
      ],
    },
    solana: {
      address: "ABC1defg2hijk3lmnop4qrstuv5wxyz6ABCDE7FGHIJ",
      solBalance: "10.0",
      solValueUsd: "1200.00",
      tokens: [
        {
          symbol: "BONK",
          name: "Bonk",
          mintAddress: "bonkmint",
          balance: "1000000",
          decimals: 5,
          valueUsd: "25.00",
          logoUrl: "",
        },
      ],
    },
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("CHECK_BALANCE action", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("has correct name", () => {
    expect(checkBalanceAction.name).toBe("CHECK_BALANCE");
  });

  it("has similes for natural language matching", () => {
    expect(checkBalanceAction.similes).toBeDefined();
    expect(checkBalanceAction.similes!.length).toBeGreaterThan(0);
    expect(checkBalanceAction.similes).toContain("GET_BALANCE");
    expect(checkBalanceAction.similes).toContain("WALLET_BALANCE");
    expect(checkBalanceAction.similes).toContain("CHECK_WALLET");
    expect(checkBalanceAction.similes).toContain("MY_BALANCE");
    expect(checkBalanceAction.similes).toContain("PORTFOLIO");
    expect(checkBalanceAction.similes).toContain("HOLDINGS");
  });

  it("has parameter definitions", () => {
    expect(checkBalanceAction.parameters).toBeDefined();
    expect(checkBalanceAction.parameters!.length).toBe(1);

    const chainParam = checkBalanceAction.parameters![0];
    expect(chainParam.name).toBe("chain");
    expect(chainParam.required).toBe(false);
  });

  it("validates successfully", async () => {
    const result = await checkBalanceAction.validate(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(result).toBe(true);
  });

  // ── Fetches from correct URL ─────────────────────────────────────────────

  it("fetches from the correct API URL", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    await callHandler();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:2138/api/wallet/balances");
  });

  // ── Multi-chain response formatting ──────────────────────────────────────

  it("returns formatted text for multi-chain response", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("Wallet Balances:");

    // BSC section
    expect(text).toContain("BSC");
    expect(text).toContain("0x1234...5678");
    expect(text).toContain("BNB: 1.5");
    expect(text).toContain("$450.00");
    expect(text).toContain("USDT: 100.0");
    expect(text).toContain("CAKE: 50.0");

    // Ethereum section
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("ETH: 0.5");
    expect(text).toContain("$1,500.00");

    // Base section
    expect(text).toContain("BASE");

    // Solana section
    expect(text).toContain("Solana");
    expect(text).toContain("SOL: 10.0");
    expect(text).toContain("$1,200.00");
    expect(text).toContain("BONK: 1000000");
  });

  // ── Chain filtering ──────────────────────────────────────────────────────

  it("filters by chain=bsc", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "bsc" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("BSC");
    expect(text).toContain("BNB: 1.5");
    // Should NOT contain other chains
    expect(text).not.toContain("ETHEREUM");
    expect(text).not.toContain("Solana");
    expect(text).not.toContain("BASE");
  });

  it("filters by chain=ethereum", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "ethereum" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("ETH: 0.5");
    expect(text).not.toContain("BSC");
    expect(text).not.toContain("Solana");
  });

  it("filters by chain=solana", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "solana" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("Solana");
    expect(text).toContain("SOL: 10.0");
    expect(text).not.toContain("BSC");
    expect(text).not.toContain("ETHEREUM");
  });

  it("filters by chain=base", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "base" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("BASE");
    expect(text).not.toContain("BSC");
    expect(text).not.toContain("Solana");
  });

  it("handles chain=all (default)", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "all" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("BSC");
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("BASE");
    expect(text).toContain("Solana");
  });

  it("defaults to all chains when no chain param is provided", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({});
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("BSC");
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("Solana");
  });

  it("defaults to all chains when chain param is invalid", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "polygon" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    // Should show all chains since "polygon" is not a valid filter
    expect(text).toContain("BSC");
    expect(text).toContain("ETHEREUM");
    expect(text).toContain("Solana");
  });

  it("normalizes chain parameter to lowercase", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await callHandler({ chain: "BSC" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("BSC");
    expect(text).not.toContain("ETHEREUM");
    expect(text).not.toContain("Solana");
  });

  // ── Empty/null balances ──────────────────────────────────────────────────

  it("handles null evm and null solana", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ evm: null, solana: null }),
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("No wallet balances available.");
  });

  it("handles evm with empty chains array", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        evm: { address: "0xabc", chains: [] },
        solana: null,
      }),
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("No wallet balances available.");
  });

  it("handles solana with empty token list", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        evm: null,
        solana: {
          address: "ABC123",
          solBalance: "0",
          solValueUsd: "0",
          tokens: [],
        },
      }),
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("Solana");
    expect(text).toContain("SOL: 0");
  });

  it("shows no data message when filtering to non-existent chain", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        evm: {
          address: "0xabc",
          chains: [
            {
              chain: "bsc",
              chainId: 56,
              nativeBalance: "1.0",
              nativeSymbol: "BNB",
              nativeValueUsd: "300.00",
              tokens: [],
              error: null,
            },
          ],
        },
        solana: null,
      }),
    });

    const result = await callHandler({ chain: "ethereum" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain('No balance data available for chain "ethereum"');
  });

  // ── Chain error field ────────────────────────────────────────────────────

  it("includes chain error in formatted output", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        evm: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chains: [
            {
              chain: "bsc",
              chainId: 56,
              nativeBalance: "0",
              nativeSymbol: "BNB",
              nativeValueUsd: "0",
              tokens: [],
              error: "RPC timeout",
            },
          ],
        },
        solana: null,
      }),
    });

    const result = await callHandler({ chain: "bsc" });
    const { text } = result as { text: string };

    expect(text).toContain("Error: RPC timeout");
  });

  // ── Token truncation ─────────────────────────────────────────────────────

  it("truncates tokens beyond MAX_TOKENS_PER_CHAIN", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const manyTokens = Array.from({ length: 15 }, (_, i) => ({
      symbol: `TOKEN${i}`,
      name: `Token ${i}`,
      contractAddress: `0x${i}`,
      balance: "1.0",
      decimals: 18,
      valueUsd: "1.00",
      logoUrl: "",
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        evm: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chains: [
            {
              chain: "bsc",
              chainId: 56,
              nativeBalance: "1.0",
              nativeSymbol: "BNB",
              nativeValueUsd: "300.00",
              tokens: manyTokens,
              error: null,
            },
          ],
        },
        solana: null,
      }),
    });

    const result = await callHandler({ chain: "bsc" });
    const { text } = result as { text: string };

    // First 10 tokens should be present
    expect(text).toContain("TOKEN0");
    expect(text).toContain("TOKEN9");
    // Token 10+ should NOT be listed individually
    expect(text).not.toContain("TOKEN10");
    expect(text).not.toContain("TOKEN14");
    // Should show overflow message
    expect(text).toContain("... and 5 more");
  });

  // ── API error handling ───────────────────────────────────────────────────

  it("handles API error responses (non-ok HTTP)", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("HTTP 500");
  });

  it("handles API 403 error", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("HTTP 403");
  });

  // ── Network errors ───────────────────────────────────────────────────────

  it("handles network/fetch errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("ECONNREFUSED");
  });

  it("handles timeout errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("The operation was aborted"));

    const result = await callHandler();
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("aborted");
  });

  // ── Missing parameters entirely ──────────────────────────────────────────

  it("handles missing options entirely", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFullResponse(),
    });

    const result = await checkBalanceAction.handler(
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
    const { success } = result as { success: boolean };

    // Should still succeed, defaulting to chain="all"
    expect(success).toBe(true);
  });

  // ── Data passthrough ─────────────────────────────────────────────────────

  it("returns raw data alongside formatted text", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const mockResponse = makeFullResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await callHandler({ chain: "bsc" });
    const { data } = result as { data: Record<string, unknown> };

    expect(data.chain).toBe("bsc");
    expect(data.evm).toBeDefined();
    expect(data.solana).toBeDefined();
  });
});
