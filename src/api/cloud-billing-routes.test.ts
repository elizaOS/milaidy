import { EventEmitter } from "node:events";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElizaConfig } from "../config/config";
import type { CloudBillingRouteState } from "./cloud-billing-routes";
import { handleCloudBillingRoute } from "./cloud-billing-routes";

vi.mock("@elizaos/core", () => ({
  logger: { warn: vi.fn() },
}));

vi.mock("@elizaos/autonomous/cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@elizaos/autonomous/api/http-helpers", () => ({
  sendJson: vi.fn(),
  sendJsonError: vi.fn(),
}));

const { sendJson, sendJsonError } = await import(
  "@elizaos/autonomous/api/http-helpers"
);
const { validateCloudBaseUrl } = await import(
  "@elizaos/autonomous/cloud/validate-url"
);

function makeState(
  overrides?: Partial<ElizaConfig["cloud"]>,
): CloudBillingRouteState {
  return {
    config: {
      cloud: {
        apiKey: "test-api-key",
        baseUrl: "https://cloud.example.com",
        ...overrides,
      },
    } as ElizaConfig,
  };
}

function makeReq(opts: { url?: string; body?: string }): http.IncomingMessage {
  const emitter = new EventEmitter() as http.IncomingMessage;
  emitter.url = opts.url ?? "/api/cloud/billing/summary";

  if (opts.body) {
    const body = opts.body;
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(body));
      emitter.emit("end");
    });
  } else {
    process.nextTick(() => emitter.emit("end"));
  }

  return emitter;
}

function makeRes(): http.ServerResponse {
  return {} as http.ServerResponse;
}

describe("cloud-billing-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCloudBaseUrl).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false for non-billing paths", async () => {
    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/status",
      "GET",
      makeState(),
    );

    expect(result).toBe(false);
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("returns 401 when no cloud API key is configured", async () => {
    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/summary",
      "GET",
      makeState({ apiKey: undefined }),
    );

    expect(result).toBe(true);
    expect(sendJsonError).toHaveBeenCalledWith(
      expect.anything(),
      "Not connected to Eliza Cloud. Please log in first.",
      401,
    );
  });

  it("returns 502 when base URL validation fails", async () => {
    vi.mocked(validateCloudBaseUrl).mockResolvedValue("invalid hostname");

    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/summary",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(sendJsonError).toHaveBeenCalledWith(
      expect.anything(),
      "invalid hostname",
      502,
    );
  });

  it("maps billing summary from cloud credits summary and crypto status", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            organization: {
              creditBalance: 1.25,
              hasPaymentMethod: true,
              autoTopUpEnabled: true,
              autoTopUpAmount: 25,
              autoTopUpThreshold: 5,
            },
            pricing: {
              minimumTopUp: 5,
              x402Enabled: false,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ enabled: true }), { status: 200 }),
      );

    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/summary",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://cloud.example.com/api/v1/credits/summary",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://cloud.example.com/api/crypto/status",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        balance: 1.25,
        currency: "USD",
        hostedCheckoutEnabled: true,
        embeddedCheckoutEnabled: false,
        cryptoEnabled: true,
        low: true,
        critical: false,
        hasPaymentMethod: true,
      }),
      200,
    );
  });

  it("synthesizes payment methods from cloud summary", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          organization: {
            hasPaymentMethod: true,
          },
        }),
        { status: 200 },
      ),
    );

    const result = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/payment-methods" }),
      makeRes(),
      "/api/cloud/billing/payment-methods",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/credits/summary",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      {
        success: true,
        data: [
          {
            id: "stripe-default",
            type: "card",
            label: "Saved payment method",
            brand: "Card",
            isDefault: true,
          },
        ],
      },
      200,
    );
  });

  it("maps billing history from credit transactions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          transactions: [
            {
              id: "txn-1",
              type: "topup",
              amount: 25,
              description: "Top up",
              created_at: "2026-03-15T00:00:00.000Z",
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    );

    const result = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/history?hours=24" }),
      makeRes(),
      "/api/cloud/billing/history",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/credits/transactions?hours=24",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      {
        success: true,
        data: [
          {
            id: "txn-1",
            kind: "topup",
            provider: undefined,
            status: "credited",
            amount: 25,
            currency: "USD",
            description: "Top up",
            createdAt: "2026-03-15T00:00:00.000Z",
          },
        ],
        total: 1,
        period: undefined,
      },
      200,
    );
  });

  it("translates checkout creation to cloud credits checkout", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://checkout.stripe.com/c/pay/cs_test",
          sessionId: "cs_test",
        }),
        { status: 200 },
      ),
    );

    const body = JSON.stringify({ amountUsd: 25, mode: "embedded" });
    const result = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/checkout", body }),
      makeRes(),
      "/api/cloud/billing/checkout",
      "POST",
      makeState({ serviceKey: "svc-key" } as Partial<ElizaConfig["cloud"]>),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/credits/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          credits: 25,
          success_url:
            "https://cloud.example.com/dashboard/billing/success?from=eliza",
          cancel_url:
            "https://cloud.example.com/dashboard/settings?from=eliza&tab=billing&canceled=1",
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "X-Service-Key": "svc-key",
        }),
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      {
        success: true,
        provider: "stripe",
        mode: "hosted",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
        sessionId: "cs_test",
      },
      200,
    );
  });

  it("translates crypto quote creation to cloud crypto payments", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          paymentId: "pay_123",
          trackId: "track_123",
          payLink: "https://pay.example.com/track_123",
          expiresAt: "2026-03-15T01:00:00.000Z",
          creditsToAdd: "25.000",
        }),
        { status: 200 },
      ),
    );

    const body = JSON.stringify({
      amountUsd: 25,
      currency: "USDC",
      network: "bsc",
    });
    const result = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/crypto/quote", body }),
      makeRes(),
      "/api/cloud/billing/crypto/quote",
      "POST",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/crypto/payments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          amount: 25,
          payCurrency: "USDC",
          network: "BEP20",
        }),
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      {
        success: true,
        provider: "oxapay",
        invoiceId: "pay_123",
        trackId: "track_123",
        network: "BEP20",
        currency: "USDC",
        amount: "25.000",
        amountUsd: 25,
        paymentLinkUrl: "https://pay.example.com/track_123",
        expiresAt: "2026-03-15T01:00:00.000Z",
      },
      200,
    );
  });

  it("falls back to generic /api/v1/billing proxy for unknown billing routes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, settings: {} }), {
        status: 200,
      }),
    );

    const result = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/settings?fresh=true" }),
      makeRes(),
      "/api/cloud/billing/settings",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/billing/settings?fresh=true",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("follows safe same-cloud redirects inside the proxy", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://cloud.example.com/api/v1/credits/summary?follow=1") {
        return new Response(
          JSON.stringify({
            success: true,
            organization: { creditBalance: 7.5 },
            pricing: { minimumTopUp: 5 },
          }),
          { status: 200 },
        );
      }
      if (url === "https://cloud.example.com/api/crypto/status") {
        return new Response(JSON.stringify({ enabled: true }), { status: 200 });
      }
      if (url === "https://cloud.example.com/api/v1/credits/summary") {
        return new Response(null, {
          status: 307,
          headers: {
            Location: "/api/v1/credits/summary?follow=1",
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/summary",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/credits/summary",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/credits/summary?follow=1",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        balance: 7.5,
        topUpUrl: "https://cloud.example.com/dashboard/settings?tab=billing",
      }),
      200,
    );
  });

  it("proxies remaining credits and crypto billing endpoints through the local billing namespace", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, settings: { foo: "bar" } }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ enabled: true }), { status: 200 }),
      );

    const creditsResult = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/credits/pricing" }),
      makeRes(),
      "/api/cloud/billing/credits/pricing",
      "GET",
      makeState(),
    );
    const cryptoResult = await handleCloudBillingRoute(
      makeReq({ url: "/api/cloud/billing/crypto/status" }),
      makeRes(),
      "/api/cloud/billing/crypto/status",
      "GET",
      makeState(),
    );

    expect(creditsResult).toBe(true);
    expect(cryptoResult).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://cloud.example.com/api/v1/credits/pricing",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://cloud.example.com/api/crypto/status",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("returns 502 on unsafe redirect responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example.com" },
      }),
    );

    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/summary",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(sendJsonError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("redirected"),
      502,
    );
  });

  it("returns 504 on timeout", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("Timed out", "AbortError"),
    );

    const result = await handleCloudBillingRoute(
      makeReq({}),
      makeRes(),
      "/api/cloud/billing/history",
      "GET",
      makeState(),
    );

    expect(result).toBe(true);
    expect(sendJsonError).toHaveBeenCalledWith(
      expect.anything(),
      "Eliza Cloud billing request timed out",
      504,
    );
  });
});
