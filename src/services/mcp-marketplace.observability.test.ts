import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSpanMock, spanSuccessMock, spanFailureMock } = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

import { getMcpServerDetails, searchMcpMarketplace } from "./mcp-marketplace";

describe("mcp marketplace observability", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  it("records success for MCP registry search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ servers: [] }),
      }),
    );

    await expect(searchMcpMarketplace("github")).resolves.toEqual({
      results: [],
    });

    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "mcp",
      operation: "search_registry_servers",
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records failure for MCP details fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    await expect(getMcpServerDetails("broken/server")).rejects.toThrow(
      /registry api error/i,
    );

    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "mcp",
      operation: "get_registry_server_details",
    });
    expect(spanFailureMock).toHaveBeenCalledWith({
      statusCode: 500,
      errorKind: "http_error",
    });
  });

  it("records success for MCP details fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          server: { name: "test/server", version: "1.0.0", description: "t" },
        }),
      }),
    );

    const result = await getMcpServerDetails("test/server");

    expect(result).toEqual({
      name: "test/server",
      version: "1.0.0",
      description: "t",
    });
    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "mcp",
      operation: "get_registry_server_details",
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records success for MCP details 404 (not found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );

    const result = await getMcpServerDetails("missing/server");

    expect(result).toBeNull();
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 404 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });
});
