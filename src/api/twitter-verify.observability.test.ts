import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSpanMock, spanSuccessMock, spanFailureMock } = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

import { verifyTweet } from "./twitter-verify";

const VALID_TWEET_URL = "https://x.com/alice/status/123456789";
const WALLET = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";

describe("twitter-verify observability", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  it("records success when tweet verification succeeds", async () => {
    const shortAddr = `${WALLET.slice(0, 6)}...${WALLET.slice(-4)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tweet: {
            text: `Verifying my Milady agent "Test" | ${shortAddr} #MiladyAgent`,
            author: { screen_name: "alice" },
          },
        }),
      }),
    );

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result.verified).toBe(true);
    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "verify_tweet",
      timeoutMs: 15_000,
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records failure when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result.verified).toBe(false);
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(spanSuccessMock).not.toHaveBeenCalled();
  });

  it("records success for 404 (tweet not found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result.verified).toBe(false);
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 404 });
  });

  it("records failure for non-404 HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result.verified).toBe(false);
    expect(spanFailureMock).toHaveBeenCalledWith({
      statusCode: 503,
      errorKind: "http_error",
    });
  });

  it("does not create span for invalid tweet URL", async () => {
    const result = await verifyTweet("https://example.com/bad", WALLET);

    expect(result.verified).toBe(false);
    expect(createSpanMock).not.toHaveBeenCalled();
  });
});
