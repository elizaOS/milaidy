import { afterEach, describe, expect, it, vi } from "vitest";
import { MilaidyClient } from "./api-client.js";

describe("MilaidyClient wallet disconnect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to /api/v2/wallet/disconnect when /api/wallet/disconnect is 404", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MilaidyClient("http://localhost:31337");
    const result = await client.disconnectWallet();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:31337/api/wallet/disconnect",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://localhost:31337/api/v2/wallet/disconnect",
    );
  });

  it("uses config-clear fallback when disconnect routes fail", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MilaidyClient("http://localhost:31337");
    const result = await client.disconnectWallet();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:31337/api/wallet/disconnect",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://localhost:31337/api/v2/wallet/disconnect",
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://localhost:31337/api/wallet/config",
    );
  });
});
