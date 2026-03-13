// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const directRpcBridgeLoaded = vi.fn();

vi.mock("../bridge/electrobun-direct-rpc", () => {
  directRpcBridgeLoaded();
  return {};
});

describe("electrobun preload entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    directRpcBridgeLoaded.mockClear();
  });

  it("loads the direct electrobun rpc bridge", async () => {
    await import("../bridge/electrobun-preload");

    expect(directRpcBridgeLoaded).toHaveBeenCalledTimes(1);
  });
});
