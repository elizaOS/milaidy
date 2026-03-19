/**
 * Unit tests for the TRANSFER_TOKEN action.
 *
 * Verifies parameter validation, API call handling, response formatting,
 * and action metadata (name, similes, parameters).
 */

import type { HandlerOptions } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transferTokenAction } from "./transfer-token";

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_TOKEN_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

function callHandler(params: Record<string, unknown>) {
  return transferTokenAction.handler({} as never, {} as never, undefined, {
    parameters: params,
  } as HandlerOptions);
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("TRANSFER_TOKEN action", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("has correct name", () => {
    expect(transferTokenAction.name).toBe("TRANSFER_TOKEN");
  });

  it("has similes for natural language matching", () => {
    expect(transferTokenAction.similes).toBeDefined();
    expect(transferTokenAction.similes?.length).toBeGreaterThan(0);
    expect(transferTokenAction.similes).toContain("SEND_TOKEN");
    expect(transferTokenAction.similes).toContain("TRANSFER");
    expect(transferTokenAction.similes).toContain("SEND");
    expect(transferTokenAction.similes).toContain("SEND_BNB");
    expect(transferTokenAction.similes).toContain("SEND_CRYPTO");
    expect(transferTokenAction.similes).toContain("PAY");
  });

  it("has parameter definitions", () => {
    expect(transferTokenAction.parameters).toBeDefined();
    expect(transferTokenAction.parameters?.length).toBe(4);

    const names = transferTokenAction.parameters?.map((p) => p.name);
    expect(names).toContain("toAddress");
    expect(names).toContain("amount");
    expect(names).toContain("assetSymbol");
    expect(names).toContain("tokenAddress");

    // toAddress, amount, assetSymbol are required; tokenAddress is optional
    const tokenAddr = transferTokenAction.parameters?.find(
      (p) => p.name === "tokenAddress",
    );
    expect(tokenAddr?.required).toBe(false);
  });

  it("validate returns true when EVM_PRIVATE_KEY is set", async () => {
    const mockRuntime = {
      getSetting: (key: string) =>
        key === "EVM_PRIVATE_KEY" ? "0xdeadbeef" : undefined,
    };
    const result = await transferTokenAction.validate(
      mockRuntime as never,
      {} as never,
    );
    expect(result).toBe(true);
  });

  it("validate returns true when PRIVY_APP_ID is set", async () => {
    const mockRuntime = {
      getSetting: (key: string) =>
        key === "PRIVY_APP_ID" ? "app-123" : undefined,
    };
    const result = await transferTokenAction.validate(
      mockRuntime as never,
      {} as never,
    );
    expect(result).toBe(true);
  });

  it("validate returns false when no wallet is configured", async () => {
    const mockRuntime = { getSetting: () => undefined };
    const result = await transferTokenAction.validate(
      mockRuntime as never,
      {} as never,
    );
    expect(result).toBe(false);
  });

  // ── Parameter validation: toAddress ────────────────────────────────────

  it("returns error when toAddress is missing", async () => {
    const result = await callHandler({
      amount: "1.5",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("address");
  });

  it("returns error when toAddress is malformed", async () => {
    const result = await callHandler({
      toAddress: "not-an-address",
      amount: "1.5",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("address");
  });

  it("returns error when toAddress is too short", async () => {
    const result = await callHandler({
      toAddress: "0x1234",
      amount: "1.5",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
  });

  it("returns error when toAddress is missing 0x prefix", async () => {
    const result = await callHandler({
      toAddress: "1234567890abcdef1234567890abcdef12345678",
      amount: "1.5",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
  });

  // ── Parameter validation: amount ───────────────────────────────────────

  it("returns error when amount is missing", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is zero", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "0",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is negative", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "-1",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  it("returns error when amount is not a number", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "abc",
      assetSymbol: "BNB",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("amount");
  });

  // ── Parameter validation: assetSymbol ──────────────────────────────────

  it("returns error when assetSymbol is missing", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("asset symbol");
  });

  it("returns error when assetSymbol is empty string", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "  ",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("asset symbol");
  });

  it("returns error when assetSymbol contains invalid characters", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "B N B!",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("Invalid asset symbol");
  });

  it("returns error when assetSymbol is too long", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "TOOLONGSYMBOL123456789",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("Invalid asset symbol");
  });

  // ── Parameter validation: tokenAddress (optional) ──────────────────

  it("returns error when tokenAddress is provided but not a valid EVM address", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "USDT",
      tokenAddress: "not-an-address",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain(
      "Invalid token address",
    );
  });

  it("returns error when tokenAddress is provided but too short", async () => {
    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "USDT",
      tokenAddress: "0x1234",
    });
    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain(
      "Invalid token address",
    );
  });

  // ── Successful API calls ─────────────────────────────────────────────

  it("calls API and returns success for local-key executed transfer", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress: VALID_ADDRESS,
        amount: "1.5",
        assetSymbol: "BNB",
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
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect((result as { text: string }).text).toContain(
      "executed successfully",
    );
    expect((result as { text: string }).text).toContain("1.5");
    expect((result as { text: string }).text).toContain("BNB");
    expect((result as { text: string }).text).toContain("0xabc123");
    expect((result as { data: Record<string, unknown> }).data).toMatchObject({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
      mode: "local-key",
      txHash: "0xabc123",
      executed: true,
    });

    // Verify fetch was called with correct args
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:2138/api/wallet/transfer/execute");
    expect(opts.method).toBe("POST");
    expect(
      (opts.headers as Record<string, string>)["X-Eliza-Agent-Action"],
    ).toBe("1");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );

    const body = JSON.parse(opts.body as string);
    expect(body.toAddress).toBe(VALID_ADDRESS);
    expect(body.amount).toBe("1.5");
    expect(body.assetSymbol).toBe("BNB");
    expect(body.confirm).toBe(true);
    expect(body.tokenAddress).toBeUndefined();
  });

  it("calls API and returns success for user-sign mode", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: "user-sign",
        executed: false,
        requiresUserSignature: true,
        toAddress: VALID_ADDRESS,
        amount: "1.5",
        assetSymbol: "BNB",
        unsignedTx: { chainId: 56, to: VALID_ADDRESS, data: "0x..." },
      }),
    });

    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect((result as { text: string }).text).toContain("user-sign");
    expect((result as { text: string }).text).toContain(
      "signature is required",
    );
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
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress: VALID_ADDRESS,
        amount: "100",
        assetSymbol: "USDT",
        execution: {
          hash: "0xdef456",
          explorerUrl: "https://bscscan.com/tx/0xdef456",
          status: "success",
          blockNumber: 99999,
        },
      }),
    });

    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: 100,
      assetSymbol: "USDT",
    });

    expect((result as { success: boolean }).success).toBe(true);

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.amount).toBe("100");
  });

  // ── Optional tokenAddress ──────────────────────────────────────────────

  it("passes tokenAddress to API when provided", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress: VALID_ADDRESS,
        amount: "50",
        assetSymbol: "USDT",
        execution: {
          hash: "0x789",
          explorerUrl: "https://bscscan.com/tx/0x789",
          status: "success",
          blockNumber: 1,
        },
      }),
    });

    await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "50",
      assetSymbol: "USDT",
      tokenAddress: VALID_TOKEN_CONTRACT,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.tokenAddress).toBe(VALID_TOKEN_CONTRACT);
  });

  it("omits tokenAddress from body when not provided", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress: VALID_ADDRESS,
        amount: "1",
        assetSymbol: "BNB",
        execution: {
          hash: "0xaaa",
          explorerUrl: "https://bscscan.com/tx/0xaaa",
          status: "success",
          blockNumber: 1,
        },
      }),
    });

    await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1",
      assetSymbol: "BNB",
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.tokenAddress).toBeUndefined();
  });

  it("omits tokenAddress from body when it is empty string", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        toAddress: VALID_ADDRESS,
        amount: "1",
        assetSymbol: "BNB",
        execution: {
          hash: "0xbbb",
          explorerUrl: "https://bscscan.com/tx/0xbbb",
          status: "success",
          blockNumber: 1,
        },
      }),
    });

    await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1",
      assetSymbol: "BNB",
      tokenAddress: "  ",
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.tokenAddress).toBeUndefined();
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("handles API error responses (non-ok HTTP)", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Transfer not permitted" }),
    });

    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain(
      "Transfer not permitted",
    );
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
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
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
      toAddress: VALID_ADDRESS,
      amount: "999",
      assetSymbol: "BNB",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain(
      "Insufficient BNB balance",
    );
  });

  it("handles network/fetch errors", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await callHandler({
      toAddress: VALID_ADDRESS,
      amount: "1.5",
      assetSymbol: "BNB",
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { text: string }).text).toContain("ECONNREFUSED");
  });

  it("handles missing parameters entirely", async () => {
    const result = await transferTokenAction.handler({} as never, undefined);
    expect((result as { success: boolean }).success).toBe(false);
  });
});
