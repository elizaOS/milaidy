// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWeb } from "../../plugins/agent/src/web";

describe("AgentWeb Electron API fallback", () => {
  const originalFetch = globalThis.fetch;
  const originalBase = (window as { __MILADY_API_BASE__?: string })
    .__MILADY_API_BASE__;
  const originalProtocol = window.location.protocol;

  beforeEach(() => {
    // Aggressively clear global state that might leak from other tests
    delete (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__;
    delete (window as { __MILADY_API_TOKEN__?: string }).__MILADY_API_TOKEN__;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
    if (originalBase !== undefined) {
      (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
        originalBase;
    } else {
      delete (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__;
    }

    // Restore protocol
    Object.defineProperty(window, "location", {
      value: { ...window.location, protocol: originalProtocol },
      writable: true,
    });
  });

  it("queries local API when running on capacitor-electron without injected base", async () => {
    (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ =
      undefined;

    // In JSDOM, window.location properties are frozen. We need to overwrite the whole location object.
    Object.defineProperty(window, "location", {
      value: { ...window.location, protocol: "capacitor-electron:" },
      writable: true,
    });

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
