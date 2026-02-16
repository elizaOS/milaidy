/**
 * Unit tests for RetakeClient API semantics.
 *
 * Covers:
 * - auth headers and request payload shape
 * - query param generation
 * - timeout behavior and custom base URL
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetakeClient } from "./client.js";

type MockFetch = ReturnType<typeof vi.fn>;

const makeJsonResponse = <T>(body: T, status = 200) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(""),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
};

describe("RetakeClient", () => {
  let fetchMock: MockFetch;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("registers and stores access token without Authorization header", async () => {
    const creds = {
      access_token: "tok123",
      agent_id: "agent-1",
      userDbId: "user-1",
      wallet_address: "wallet",
      token_address: "token-addr",
      token_ticker: "TTK",
    };

    fetchMock.mockResolvedValue(makeJsonResponse(creds));

    const client = new RetakeClient({
      baseUrl: "https://retake.tv/",
      timeoutMs: 100,
    });

    const out = await client.register({
      agent_name: "Agent",
      agent_description: "A",
      wallet_address: "wallet",
    });

    expect(out).toEqual(creds);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe("https://retake.tv/agent/register");
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.headers).toEqual(
      expect.not.objectContaining({
        Authorization: expect.any(String),
      }),
    );
    expect(calledInit?.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" }),
    );

    const body = JSON.parse(String(calledInit?.body));
    expect(body).toEqual({
      agent_name: "Agent",
      agent_description: "A",
      wallet_address: "wallet",
    });
  });

  it("fetches chat history with expected query parameters", async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        comments: [
          {
            _id: "1",
            streamId: "s",
            text: "hello",
            timestamp: "2026-02-16T00:00:00Z",
            author: {
              walletAddress: "w1",
              fusername: "alice",
              fid: 1,
              favatar: "a",
            },
          },
        ],
      }),
    );

    const client = new RetakeClient({ timeoutMs: 100 });
    await client.getChatHistory("user db", {
      limit: 20,
      beforeId: "abc123",
    });

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/agent/stream/comments?");
    expect(calledUrl).toContain("userDbId=user+db");
    expect(calledUrl).toContain("limit=20");
    expect(calledUrl).toContain("beforeId=abc123");
  });

  it("sends Authorization header when auth token is configured", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ is_live: false, viewers: 0, uptime_seconds: 0, token_address: "", userDbId: "" }));

    const client = new RetakeClient({ accessToken: "abc" });
    await client.getStreamStatus();

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledInit?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer abc" }),
    );
  });

  it("throws a timeout error when requests exceed timeout", async () => {
    vi.useFakeTimers();

    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (init?.signal?.aborted) {
            onAbort();
          } else {
            init?.signal?.addEventListener("abort", onAbort, { once: true });
          }
        }),
    );

    const client = new RetakeClient({ timeoutMs: 10 });
    const promise = client.getRtmpCredentials();

    await vi.advanceTimersByTimeAsync(20);

    await expect(promise).rejects.toThrow("timed out (10ms)");
  });
});
