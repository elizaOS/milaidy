import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToken,
  cloudLogin,
  cloudLoginPoll,
  fetchWithAuth,
  getToken,
  isAuthenticated,
  setToken,
} from "../lib/auth";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("auth", () => {
  it("stores and retrieves token", () => {
    setToken("test-api-key");
    expect(getToken()).toBe("test-api-key");
  });

  it("clears token", () => {
    setToken("test-api-key");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("isAuthenticated returns false when no token", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("isAuthenticated returns true when token exists", () => {
    setToken("test-api-key");
    expect(isAuthenticated()).toBe(true);
  });

  it("cloudLogin and cloudLoginPoll are exported", async () => {
    const auth = await import("../lib/auth");
    expect(typeof auth.cloudLogin).toBe("function");
    expect(typeof auth.cloudLoginPoll).toBe("function");
  });
});

describe("fetchWithAuth", () => {
  it("attaches X-Api-Key header when token exists", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    setToken("test-key");
    await fetchWithAuth("http://example.com/test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.get("X-Api-Key")).toBe("test-key");
  });

  it("does not set header when no token", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    await fetchWithAuth("http://example.com/test");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it("clears token on 401 response", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal("fetch", mockFetch);
    setToken("will-be-cleared");
    await fetchWithAuth("http://example.com/test");
    expect(getToken()).toBeNull();
  });

  it("does not clear token on non-401 errors", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);
    setToken("keep-me");
    await fetchWithAuth("http://example.com/test");
    expect(getToken()).toBe("keep-me");
  });

  it("passes through additional request options", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    setToken("key");
    await fetchWithAuth("http://example.com/test", {
      method: "POST",
      body: JSON.stringify({ data: 1 }),
    });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify({ data: 1 }));
  });

  it("returns the response object", async () => {
    const mockResponse = { ok: true, status: 200 };
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    vi.stubGlobal("fetch", mockFetch);
    const result = await fetchWithAuth("http://example.com/test");
    expect(result).toBe(mockResponse);
  });
});

describe("cloudLogin", () => {
  it("creates session and returns browserUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({ sessionId: "test-session", status: "pending" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("crypto", { randomUUID: () => "mock-uuid" });
    const result = await cloudLogin();
    expect(result.sessionId).toBe("mock-uuid");
    expect(result.browserUrl).toContain(
      "elizacloud.ai/auth/cli-login?session=mock-uuid",
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/cli-session"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when server returns non-ok", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("crypto", { randomUUID: () => "mock-uuid" });
    await expect(cloudLogin()).rejects.toThrow("Failed to create auth session");
  });
});

describe("cloudLoginPoll", () => {
  it("returns authenticated status with apiKey", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ status: "authenticated", apiKey: "key-123" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const result = await cloudLoginPoll("test-session");
    expect(result.status).toBe("authenticated");
    expect(result.apiKey).toBe("key-123");
  });

  it("throws on 404 (session expired)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);
    await expect(cloudLoginPoll("expired-session")).rejects.toThrow("expired");
  });

  it("throws on other non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);
    await expect(cloudLoginPoll("test-session")).rejects.toThrow(
      "Poll failed: 500",
    );
  });

  it("calls correct URL with encoded session id", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "pending" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await cloudLoginPoll("session with spaces");
    expect(mockFetch.mock.calls[0][0]).toContain("session%20with%20spaces");
  });
});
