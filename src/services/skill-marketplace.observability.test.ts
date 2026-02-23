import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSpanMock, spanSuccessMock, spanFailureMock } = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { searchSkillsMarketplace } from "./skill-marketplace";

describe("skills marketplace observability", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  it("records success for marketplace search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      }),
    );

    await expect(searchSkillsMarketplace("agent")).resolves.toEqual([]);

    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "search_skills_marketplace",
      timeoutMs: 30_000,
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records failure for non-OK marketplace responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    );

    await expect(searchSkillsMarketplace("agent")).rejects.toThrow(
      /request failed/i,
    );

    expect(spanFailureMock).toHaveBeenCalledWith({
      statusCode: 503,
      errorKind: "http_error",
    });
  });
});
