import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSpanMock, spanSuccessMock, spanFailureMock } = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

import { fetchFromNetwork } from "./registry-client-network";

function baseDeps() {
  return {
    generatedRegistryUrl: "https://registry.example.com/generated.json",
    indexRegistryUrl: "https://registry.example.com/index.json",
    applyLocalWorkspaceApps: vi.fn(async () => {}),
    applyNodeModulePlugins: vi.fn(async () => {}),
    sanitizeSandbox: vi.fn((v?: string) => v ?? ""),
  };
}

describe("registry-client-network observability", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  it("records success for generated registry fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ registry: {} }),
      }),
    );

    await fetchFromNetwork(baseDeps());

    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "fetch_generated_registry",
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records failure then falls back to index registry on generated fetch error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromNetwork(baseDeps());

    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "fetch_generated_registry",
    });
    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "fetch_index_registry",
    });
    // First span fails, second succeeds
    expect(spanFailureMock).toHaveBeenCalledTimes(1);
    expect(spanSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("records failure when index registry fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("generated down"))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFromNetwork(baseDeps())).rejects.toThrow(/index\.json/);

    expect(spanFailureMock).toHaveBeenCalledTimes(2);
  });
});
