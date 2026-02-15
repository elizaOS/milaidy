import { afterEach, describe, expect, it, vi } from "vitest";

import { MilaidyClient } from "../../src/api-client";

describe("MilaidyClient Electron API fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = (window as { __MILAIDY_API_BASE__?: string })
    .__MILAIDY_API_BASE__;
  const originalProtocol = (window.location as { protocol?: string }).protocol;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    (window as { __MILAIDY_API_BASE__?: string }).__MILAIDY_API_BASE__ =
      originalBase;
    (window.location as { protocol?: string }).protocol = originalProtocol;
  });

  it("does not probe localhost on capacitor-electron protocol before API base is injected", async () => {
    (window as { __MILAIDY_API_BASE__?: string }).__MILAIDY_API_BASE__ =
      undefined;
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "starting",
        agentName: "Milaidy",
        model: undefined,
        uptime: undefined,
        startedAt: undefined,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MilaidyClient();
    expect(client.apiAvailable).toBe(false);
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers injected API base over fallback", async () => {
    (window as { __MILAIDY_API_BASE__?: string }).__MILAIDY_API_BASE__ =
      "http://localhost:9999";
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "running",
        agentName: "Milaidy",
        model: "test",
        uptime: 1,
        startedAt: Date.now(),
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MilaidyClient();
    await client.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9999/api/status",
      expect.any(Object),
    );
  });

  it("starts unavailable on capacitor-electron and switches to injected API base when injected later", async () => {
    (window as { __MILAIDY_API_BASE__?: string }).__MILAIDY_API_BASE__ =
      undefined;
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        state: "running",
        agentName: "Milaidy",
        model: "test",
        uptime: 1,
        startedAt: Date.now(),
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MilaidyClient();
    await expect(client.getStatus()).rejects.toThrow(
      "API not available (no HTTP origin)",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    (window as { __MILAIDY_API_BASE__?: string }).__MILAIDY_API_BASE__ =
      "http://127.0.0.1:4444";
    await client.getStatus();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:4444/api/status",
      expect.any(Object),
    );
  });
});
