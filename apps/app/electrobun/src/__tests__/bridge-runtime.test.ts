// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electroviewInstances = vi.fn();
const defineRpc = vi.fn();

vi.mock("electrobun/view", () => {
  const Electroview = vi.fn(function MockElectroview(options: unknown) {
    electroviewInstances(options);
  }) as unknown as {
    new (options: unknown): unknown;
    defineRPC: typeof defineRpc;
  };
  Electroview.defineRPC = defineRpc;
  return { Electroview };
});

describe("electrobun bridge runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    electroviewInstances.mockReset();
    defineRpc.mockReset();
    delete (window as typeof window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    delete (window as typeof window & { electron?: unknown }).electron;
    delete (window as typeof window & { __MILADY_API_BASE__?: unknown })
      .__MILADY_API_BASE__;
    delete (window as typeof window & { __MILADY_API_TOKEN__?: unknown })
      .__MILADY_API_TOKEN__;
    delete (window as typeof window & { __electrobun?: unknown }).__electrobun;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes only the direct Milady Electrobun RPC bridge", async () => {
    const request = {
      desktopGetVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
      desktopOpenExternal: vi.fn(),
    };
    defineRpc.mockReturnValue({ request });

    await import("../bridge/electrobun-bridge");

    expect(window.__MILADY_ELECTROBUN_RPC__).toEqual({
      request,
      onMessage: expect.any(Function),
      offMessage: expect.any(Function),
    });
    expect((window as typeof window & { electron?: unknown }).electron).toBe(
      undefined,
    );
    expect(electroviewInstances).toHaveBeenCalledTimes(1);
  });

  it("dispatches wildcard push messages to listeners and updates API globals", async () => {
    let wildcardHandler:
      | ((messageName: unknown, payload: unknown) => void)
      | undefined;
    defineRpc.mockImplementation(
      (config: {
        handlers: {
          messages: Record<
            string,
            (messageName: unknown, payload: unknown) => void
          >;
        };
      }) => {
        wildcardHandler = config.handlers.messages["*"];
        return {
          request: {
            desktopGetVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
          },
        };
      },
    );

    await import("../bridge/electrobun-bridge");

    const listener = vi.fn();
    window.__MILADY_ELECTROBUN_RPC__.onMessage("shareTargetReceived", listener);

    wildcardHandler?.("apiBaseUpdate", {
      base: "http://127.0.0.1:2138",
      token: "token-123",
    });
    expect(window.__MILADY_API_BASE__).toBe("http://127.0.0.1:2138");
    expect(window.__MILADY_API_TOKEN__).toBe("token-123");

    wildcardHandler?.("shareTargetReceived", { files: ["note.md"] });
    expect(listener).toHaveBeenCalledWith({ files: ["note.md"] });

    window.__MILADY_ELECTROBUN_RPC__.offMessage(
      "shareTargetReceived",
      listener,
    );
    wildcardHandler?.("shareTargetReceived", { files: ["other.md"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
