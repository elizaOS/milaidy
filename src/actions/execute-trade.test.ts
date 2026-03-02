/**
 * Unit tests for the EXECUTE_TRADE action.
 *
 * Verifies parameter validation, API call handling, response formatting,
 * and action metadata (name, similes, parameters).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerOptions } from "@elizaos/core";
import { executeTradeAction } from "./execute-trade";

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";

function callHandler(params: Record<string, unknown>) {
  return executeTradeAction.handler(
    {} as never,
    {} as never,
    {} as never,
    { parameters: params } as HandlerOptions,
  );
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("EXECUTE_TRADE action", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("has correct name", () => {
    expect(executeTradeAction.name).toBe("EXECUTE_TRADE");
  });

  it("has similes for natural language matching", () => {
    expect(executeTradeAction.similes).toBeDefined();
    expect(executeTradeAction.similes!.length).toBeGreaterThan(0);
    expect(executeTradeAction.similes).toContain("BUY_TOKEN");
    expect(executeTradeAction.similes).toContain("SELL_TOKEN");
    expect(executeTradeAction.similes).toContain("SWAP");
    expect(executeTradeAction.similes).toContain("TRADE");
    expect(executeTradeAction.similes).toContain("BUY");
    expect(executeTradeAction.similes).toContain("SELL");
  });

  it("has parameter definitions", () => {
    expect(executeTradeAction.parameters).toBeDefined();
    expect(executeTradeAction.parameters!.length).toBe(4);

    const names = executeTradeAction.parameters!.map((p) => p.name);
    expect(names).toContain("side");
    expect(names).toContain("tokenAddress");
    expect(names).toContain("amount");
    expect(names).toContain("slippageBps");

    // side, tokenAddress, amount are required; slippageBps is optional
    const slippage = executeTradeAction.parameters!.find(
      (p) => p.name === "slippageBps",
    );
    expect(slippage?.required).toBe(false);
  });

  it("validates successfully", async () => {
    const result = await executeTradeAction.validate(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(result).toBe(true);
  });

  // ── Parameter validation ─────────────────────────────────────────────────

  it("returns error when side is missing", async () => {
    const result = await callHandler({
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });
    expect(result).toBeDefined();
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("side");
  });

  it("returns error when side is invalid", async () => {
    const result = await callHandler({
      side: "hold",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("side");
  });

  it("returns error when tokenAddress is missing", async () => {
    const result = await callHandler({
      side: "buy",
      amount: "0.5",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("address");
  });

  it("returns error when tokenAddress is malformed", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: "not-an-address",
      amount: "0.5",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("address");
  });

  it("returns error when tokenAddress is too short", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: "0x1234",
      amount: "0.5",
    });
    expect((result as { success: boolean }).success).toBe(false);
  });

  it("returns error when amount is missing", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is zero", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is negative", async () => {
    const result = await callHandler({
      side: "sell",
      tokenAddress: VALID_TOKEN,
      amount: "-1",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is not a number", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "abc",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when slippageBps is negative", async () => {
    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
      slippageBps: -100,
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("slippageBps");
  });

  // ── Successful API calls ─────────────────────────────────────────────────

  it("calls API and returns success for local-key executed trade", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        side: "buy",
        mode: "local-key",
        quote: { price: "0.001" },
        executed: true,
        requiresUserSignature: false,
        unsignedTx: {},
        execution: {
          hash: "0xabc123",
          explorerUrl: "https://bscscan.com/tx/0xabc123",
          status: "success",
          blockNumber: 12345,
        },
      }),
    });

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect((result as { text: string }).text).toContain("executed successfully");
    expect((result as { text: string }).text).toContain("0xabc123");
    expect((result as { data: Record<string, unknown> }).data).toMatchObject({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
      mode: "local-key",
      txHash: "0xabc123",
      executed: true,
    });

    // Verify fetch was called with correct args
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:2138/api/wallet/trade/execute");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["X-Milady-Agent-Action"]).toBe("1");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body as string);
    expect(body.side).toBe("buy");
    expect(body.tokenAddress).toBe(VALID_TOKEN);
    expect(body.amount).toBe("0.5");
    expect(body.slippageBps).toBe(300);
    expect(body.confirm).toBe(true);
  });

  it("calls API and returns success for user-sign mode", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        side: "buy",
        mode: "user-sign",
        quote: { price: "0.001" },
        executed: false,
        requiresUserSignature: true,
        unsignedTx: { chainId: 56, to: "0xrouter", data: "0x..." },
      }),
    });

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect((result as { text: string }).text).toContain("user-sign");
    expect((result as { text: string }).text).toContain("signature is required");
    expect((result as { data: Record<string, unknown> }).data).toMatchObject({
      requiresUserSignature: true,
      executed: false,
    });
  });

  it("accepts numeric amount parameter", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        side: "sell",
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        execution: {
          hash: "0xdef456",
          explorerUrl: "https://bscscan.com/tx/0xdef456",
          status: "success",
          blockNumber: 99999,
        },
      }),
    });

    const result = await callHandler({
      side: "sell",
      tokenAddress: VALID_TOKEN,
      amount: 100,
    });

    expect((result as { success: boolean }).success).toBe(true);

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.amount).toBe("100");
    expect(body.side).toBe("sell");
  });

  it("passes custom slippageBps to the API", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        side: "buy",
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        execution: {
          hash: "0x111",
          explorerUrl: "https://bscscan.com/tx/0x111",
          status: "success",
          blockNumber: 1,
        },
      }),
    });

    await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "1",
      slippageBps: 500,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.slippageBps).toBe(500);
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("handles API error responses (non-ok HTTP)", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Trade not permitted" }),
    });

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("Trade not permitted");
  });

  it("handles API error with non-JSON body", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("HTTP 500");
  });

  it("handles API returning ok=false", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error: "Insufficient BNB balance",
      }),
    });

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "999",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("Insufficient BNB balance");
  });

  it("handles network/fetch errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await callHandler({
      side: "buy",
      tokenAddress: VALID_TOKEN,
      amount: "0.5",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("ECONNREFUSED");
  });

  it("handles missing parameters entirely", async () => {
    const result = await executeTradeAction.handler(
      {} as never,
      {} as never,
      {} as never,
      undefined,
    );
    expect((result as { success: boolean }).success).toBe(false);
  });

  // ── Side case-insensitivity ──────────────────────────────────────────────

  it("normalizes side to lowercase", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        side: "buy",
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        execution: {
          hash: "0x222",
          explorerUrl: "https://bscscan.com/tx/0x222",
          status: "success",
          blockNumber: 2,
        },
      }),
    });

    const result = await callHandler({
      side: "BUY",
      tokenAddress: VALID_TOKEN,
      amount: "0.1",
    });

    expect((result as { success: boolean }).success).toBe(true);

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.side).toBe("buy");
  });
});
