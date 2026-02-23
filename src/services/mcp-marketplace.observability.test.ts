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
});
