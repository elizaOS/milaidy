// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electroviewInstances = vi.fn();
const defineRpc = vi.fn();

vi.mock("electrobun/view", () => {
  const Electroview = vi.fn(function MockElectroview(options: unknown) {
    electroviewInstances(options);
  }) as {
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
    delete (window as typeof window & { electrobun?: unknown }).electrobun;
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

    await import("../bridge/electrobun-direct-rpc");

    expect(window.__MILADY_ELECTROBUN_RPC__.request).toBe(request);
    expect(typeof window.__MILADY_ELECTROBUN_RPC__.onMessage).toBe("function");
    expect(typeof window.__MILADY_ELECTROBUN_RPC__.offMessage).toBe("function");
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

    await import("../bridge/electrobun-direct-rpc");

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

  it("de-duplicates message listeners and keeps other listeners subscribed", async () => {
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

    await import("../bridge/electrobun-direct-rpc");

    const firstListener = vi.fn();
    const secondListener = vi.fn();

    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      firstListener,
    );
    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      firstListener,
    );
    window.__MILADY_ELECTROBUN_RPC__.onMessage(
      "shareTargetReceived",
      secondListener,
    );

    wildcardHandler?.("shareTargetReceived", { files: ["first.md"] });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(firstListener).toHaveBeenCalledWith({ files: ["first.md"] });
    expect(secondListener).toHaveBeenCalledTimes(1);

    window.__MILADY_ELECTROBUN_RPC__.offMessage(
      "shareTargetReceived",
      firstListener,
    );
    wildcardHandler?.("shareTargetReceived", { files: ["second.md"] });

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenLastCalledWith({ files: ["second.md"] });
  });
});
