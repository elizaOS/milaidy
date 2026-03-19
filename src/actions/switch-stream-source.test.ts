/**
 * Unit tests for the SWITCH_STREAM_SOURCE action.
 *
 * Verifies parameter validation, API call handling, error handling,
 * and action metadata.
 */

import type { HandlerOptions } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { switchStreamSourceAction } from "./switch-stream-source";

// ── Helpers ───────────────────────────────────────────────────────────────────

function callHandler(params: Record<string, unknown> = {}) {
  return switchStreamSourceAction.handler({} as never, {} as never, undefined, {
    parameters: params,
  } as HandlerOptions);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("SWITCH_STREAM_SOURCE action", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Metadata ──────────────────────────────────────────────────────────────

  it("has correct name", () => {
    expect(switchStreamSourceAction.name).toBe("SWITCH_STREAM_SOURCE");
  });

  it("has similes for natural language matching", () => {
    expect(switchStreamSourceAction.similes).toBeDefined();
    expect(switchStreamSourceAction.similes?.length).toBeGreaterThan(0);
    expect(switchStreamSourceAction.similes).toContain("CHANGE_STREAM");
    expect(switchStreamSourceAction.similes).toContain("STREAM_GAME");
    expect(switchStreamSourceAction.similes).toContain("STREAM_URL");
    expect(switchStreamSourceAction.similes).toContain("SET_STREAM_SOURCE");
  });

  it("has parameter definitions", () => {
    expect(switchStreamSourceAction.parameters).toBeDefined();
    expect(switchStreamSourceAction.parameters?.length).toBe(2);

    const sourceTypeParam = switchStreamSourceAction.parameters?.[0];
    expect(sourceTypeParam.name).toBe("sourceType");
    expect(sourceTypeParam.required).toBe(true);

    const customUrlParam = switchStreamSourceAction.parameters?.[1];
    expect(customUrlParam.name).toBe("customUrl");
    expect(customUrlParam.required).toBe(false);
  });

  it("validates successfully", async () => {
    const result = await switchStreamSourceAction.validate({} as never);
    expect(result).toBe(true);
  });

  // ── Invalid sourceType ────────────────────────────────────────────────────

  it("returns error for invalid sourceType", async () => {
    const result = await callHandler({ sourceType: "screen-capture" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("Invalid sourceType");
    expect(text).toContain("screen-capture");
    expect(text).toContain("stream-tab");
    expect(text).toContain("game");
    expect(text).toContain("custom-url");
  });

  it("returns error for empty string sourceType that is not in valid set", async () => {
    const result = await callHandler({ sourceType: "unknown-type" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("Invalid sourceType");
  });

  // ── custom-url validation ────────────────────────────────────────────────

  it("returns error when sourceType is custom-url but customUrl is missing", async () => {
    const result = await callHandler({ sourceType: "custom-url" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("customUrl is required");
    expect(text).toContain("custom-url");
  });

  it("returns error when sourceType is custom-url and customUrl is empty string", async () => {
    const result = await callHandler({
      sourceType: "custom-url",
      customUrl: "",
    });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("customUrl is required");
  });

  // ── Successful POST ───────────────────────────────────────────────────────

  it("POSTs to the correct endpoint on success", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({ sourceType: "stream-tab" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:2138/api/stream/source");
    expect(init.method).toBe("POST");
  });

  it("sends sourceType in POST body", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({ sourceType: "game" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceType).toBe("game");
  });

  it("sends customUrl in POST body when sourceType is custom-url", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    await callHandler({
      sourceType: "custom-url",
      customUrl: "https://example.com/stream",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceType).toBe("custom-url");
    expect(body.customUrl).toBe("https://example.com/stream");
  });

  it("returns success with text and data on successful switch", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const mockResponseData = { status: "ok", source: "stream-tab" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    });

    const result = await callHandler({ sourceType: "stream-tab" });
    const { text, success } = result as {
      text: string;
      success: boolean;
    };

    expect(success).toBe(true);
    expect(text).toContain("Switched stream source to stream-tab");
  });

  it("includes customUrl in success message for custom-url sourceType", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await callHandler({
      sourceType: "custom-url",
      customUrl: "https://example.com/stream",
    });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("custom-url");
    expect(text).toContain("https://example.com/stream");
  });

  it("handles valid sourceType: game", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await callHandler({ sourceType: "game" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("game");
  });

  // ── API error responses ───────────────────────────────────────────────────

  it("handles non-ok HTTP responses", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await callHandler({ sourceType: "stream-tab" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("HTTP 500");
  });

  it("handles 404 error", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await callHandler({ sourceType: "game" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("HTTP 404");
  });

  // ── Network / fetch errors ───────────────────────────────────────────────

  it("handles fetch errors gracefully", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await callHandler({ sourceType: "stream-tab" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("Failed to switch stream source");
    expect(text).toContain("ECONNREFUSED");
  });

  it("handles timeout errors gracefully", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("The operation was aborted"));

    const result = await callHandler({ sourceType: "game" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("Failed to switch stream source");
    expect(text).toContain("aborted");
  });

  it("handles non-Error thrown values", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce("string error");

    const result = await callHandler({ sourceType: "stream-tab" });
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(false);
    expect(text).toContain("Failed to switch stream source");
    expect(text).toContain("string error");
  });

  // ── Default / missing parameters ─────────────────────────────────────────

  it("defaults sourceType to stream-tab when not provided", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await callHandler({});
    const { text, success } = result as { text: string; success: boolean };

    expect(success).toBe(true);
    expect(text).toContain("stream-tab");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sourceType).toBe("stream-tab");
  });

  it("handles missing options entirely", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const result = await switchStreamSourceAction.handler(
      {} as never,
      undefined,
    );
    const { success } = result as { success: boolean };

    expect(success).toBe(true);
  });
});
