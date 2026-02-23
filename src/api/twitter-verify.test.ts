import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTweet } from "./twitter-verify";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_TWEET_URL = "https://x.com/miladyai/status/1234567890";

function mockFetchResponse(params: {
  ok: boolean;
  status: number;
  body?: unknown;
  jsonReject?: boolean;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: params.ok,
    status: params.status,
    json: params.jsonReject
      ? vi.fn().mockRejectedValue(new Error("invalid json"))
      : vi.fn().mockResolvedValue(params.body),
  } as unknown as Response);

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("twitter-verify", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    "https://example.com/not-twitter",
    "https://x.com/miladyai/post/123",
    "https://twitter.com/miladyai/status/not-a-number",
  ])("rejects invalid tweet URL format: %s", async (url) => {
    const result = await verifyTweet(url, WALLET);
    expect(result).toEqual({
      verified: false,
      error: "Invalid tweet URL. Use a twitter.com or x.com status URL.",
      handle: null,
    });
  });

  it("handles fetch failures with a user-facing retry message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network timeout")),
    );

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error: "Could not reach tweet verification service. Try again later.",
      handle: null,
    });
  });

  it("maps 404 responses to tweet-not-found guidance", async () => {
    mockFetchResponse({ ok: false, status: 404 });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error:
        "Tweet not found. Make sure the URL is correct and the tweet is public.",
      handle: null,
    });
  });

  it("maps other non-OK responses to status-aware error messages", async () => {
    mockFetchResponse({ ok: false, status: 503 });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error: "Tweet fetch failed (HTTP 503)",
      handle: null,
    });
  });

  it("handles invalid JSON from verification service", async () => {
    mockFetchResponse({ ok: true, status: 200, jsonReject: true });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error: "Invalid response from verification service",
      handle: null,
    });
  });

  it("fails verification when tweet content is missing", async () => {
    mockFetchResponse({
      ok: true,
      status: 200,
      body: { tweet: {} },
    });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error: "Could not read tweet content",
      handle: null,
    });
  });

  it("fails verification when tweet message is missing wallet evidence", async () => {
    mockFetchResponse({
      ok: true,
      status: 200,
      body: {
        tweet: {
          text: "Verifying my Milady agent #MiladyAgent",
          author: { screen_name: "miladyai" },
        },
      },
    });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error:
        "Tweet does not contain your wallet address. Make sure you copied the full verification message.",
      handle: "miladyai",
    });
  });

  it("fails verification when hashtag is missing", async () => {
    mockFetchResponse({
      ok: true,
      status: 200,
      body: {
        tweet: {
          text: `Verifying wallet 0x1234...5678 without hashtag`,
          author: { screen_name: "miladyai" },
        },
      },
    });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: false,
      error: "Tweet is missing #MiladyAgent hashtag.",
      handle: "miladyai",
    });
  });

  it("verifies tweets that include address evidence and hashtag", async () => {
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: {
        tweet: {
          text: `Verifying my Milady agent "Milady" | 0x1234...5678 #MiladyAgent`,
          author: { screen_name: "miladyai" },
        },
      },
    });

    const result = await verifyTweet(VALID_TWEET_URL, WALLET);

    expect(result).toEqual({
      verified: true,
      error: null,
      handle: "miladyai",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fxtwitter.com/miladyai/status/1234567890",
      expect.objectContaining({
        headers: { "User-Agent": "MiladyVerifier/1.0" },
      }),
    );
  });
});
