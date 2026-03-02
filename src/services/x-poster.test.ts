import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOAuth1AuthorizationHeader,
  postToX,
  readXPosterCredentialsFromEnv,
  signOAuth1,
  type XPosterCredentials,
} from "./x-poster.js";

describe("x-poster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates deterministic OAuth1 signatures and header", () => {
    const signature = signOAuth1(
      "POST&https%3A%2F%2Fapi.twitter.com%2F2%2Ftweets&oauth_consumer_key%3Dabc",
      "secret&token",
    );
    expect(signature).toBe("5sKtr1JWoth88qdk/ShLPPuAzb8=");

    const credentials: XPosterCredentials = {
      apiKey: "api-key",
      apiSecretKey: "api-secret",
      accessToken: "access-token",
      accessTokenSecret: "access-secret",
    };

    const header = buildOAuth1AuthorizationHeader({
      method: "POST",
      url: "https://api.twitter.com/2/tweets",
      credentials,
      nonce: "nonce123",
      timestamp: "1700000000",
    });

    expect(header).toBe(
      'OAuth oauth_consumer_key="api-key", oauth_nonce="nonce123", oauth_signature="WUFTfCR84J0%2BvqB2av6afRPx%2Fnw%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1700000000", oauth_token="access-token", oauth_version="1.0"',
    );
  });

  it("reads credentials from env only when all TWITTER vars are set", () => {
    expect(readXPosterCredentialsFromEnv({})).toBeNull();

    const credentials = readXPosterCredentialsFromEnv({
      TWITTER_API_KEY: "k ",
      TWITTER_API_SECRET_KEY: " s",
      TWITTER_ACCESS_TOKEN: "at",
      TWITTER_ACCESS_TOKEN_SECRET: "ats",
    });

    expect(credentials).toEqual({
      apiKey: "k",
      apiSecretKey: "s",
      accessToken: "at",
      accessTokenSecret: "ats",
    });
  });

  it("classifies successful post result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { id: "123" } }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postToX({
      text: "hello world",
      credentials: {
        apiKey: "k",
        apiSecretKey: "s",
        accessToken: "at",
        accessTokenSecret: "ats",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.category).toBe("success");
    expect(result.tweetId).toBe("123");
  });

  it("classifies auth and rate limit failures", async () => {
    const credentials: XPosterCredentials = {
      apiKey: "k",
      apiSecretKey: "s",
      accessToken: "at",
      accessTokenSecret: "ats",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Unauthorized" }), {
          status: 401,
        }),
      ),
    );
    const authResult = await postToX({ text: "hello", credentials });
    expect(authResult.ok).toBe(false);
    expect(authResult.category).toBe("auth");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Too many requests" }), {
          status: 429,
        }),
      ),
    );
    const rateResult = await postToX({ text: "hello", credentials });
    expect(rateResult.ok).toBe(false);
    expect(rateResult.category).toBe("rate_limit");
  });

  it("classifies network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket hang up")),
    );

    const result = await postToX({
      text: "hello",
      credentials: {
        apiKey: "k",
        apiSecretKey: "s",
        accessToken: "at",
        accessTokenSecret: "ats",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.category).toBe("network");
    expect(result.error).toContain("socket hang up");
  });
});
