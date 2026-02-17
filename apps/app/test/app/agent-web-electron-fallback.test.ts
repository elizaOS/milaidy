import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentWeb } from "../../plugins/agent/src/web";

describe("AgentWeb Electron API fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = (window as { __MILADY_API_BASE__?: string })
    .__MILADY_API_BASE__;
  const originalProtocol = (window.location as { protocol?: string }).protocol;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      originalBase;
    (window.location as { protocol?: string }).protocol = originalProtocol;
  });

  it("queries local API when running on capacitor-electron without injected base", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      undefined;
    (window.location as { protocol?: string }).protocol = "capacitor-electron:";

    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        state: "starting",
        agentName: "Milady",
        port: 2138,
        startedAt: Date.now(),
        error: null,
      }),
    }));
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const agent = new AgentWeb();
    await agent.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2138/api/status",
      expect.any(Object),
    );
  });
});
