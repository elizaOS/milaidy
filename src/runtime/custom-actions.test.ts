import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomActionDef } from "../config/types.milaidy.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup as dnsLookup } from "node:dns/promises";
import { buildTestHandler } from "./custom-actions.js";

function makeHttpAction(url: string): CustomActionDef {
  return {
    id: "test-action",
    name: "TEST_HTTP_ACTION",
    description: "test",
    similes: [],
    parameters: [],
    handler: {
      type: "http",
      method: "GET",
      url,
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("custom action SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects hostname aliases resolving to link-local metadata IPs", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(
      makeHttpAction("http://169.254.169.254.nip.io/latest/meta-data"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects hostname aliases resolving to loopback", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(
      makeHttpAction("http://localhost.nip.io:2138/api/status"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects direct IPv6 link-local targets across fe80::/10", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(makeHttpAction("http://[fea0::1]/test"));

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(dnsLookup)).not.toHaveBeenCalled();
  });

  it("allows explicit localhost API target on the configured API port", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);

    const handler = buildTestHandler(
      makeHttpAction("http://localhost:2138/api/status"),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dnsLookup)).not.toHaveBeenCalled();
  });

  it("allows public hosts when DNS resolves to public IPs", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);

    const handler = buildTestHandler(
      makeHttpAction("https://example.com/test"),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks redirect responses and uses manual redirect mode", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: new Headers({ location: "http://169.254.169.254/latest" }),
      text: async () => "",
    } as Response);

    const handler = buildTestHandler(
      makeHttpAction("https://example.com/redirect"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("redirects are not allowed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/redirect",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
