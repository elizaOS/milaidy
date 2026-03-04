import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPositions = vi.fn();
const mockIsReady = { value: true };

vi.mock("../client.js", () => ({
  opinionClient: {
    get isReady() {
      return mockIsReady.value;
    },
    getPositions: (...args: unknown[]) => mockGetPositions(...args),
  },
}));

import { opinionContextProvider } from "../providers/opinion-context.js";
import { _resetPositionCache } from "../providers/opinion-context.js";

describe("opinionContextProvider", () => {
  beforeEach(() => {
    _resetPositionCache();
  });
  it("returns empty text when no positions", async () => {
    mockGetPositions.mockResolvedValue({ result: [] });
    const result = await opinionContextProvider.get(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
    );
    expect(result.text).toBe("Opinion: connected, no open positions");
  });

  it("returns position summary when positions exist", async () => {
    mockGetPositions.mockResolvedValue({
      result: [
        {
          marketTitle: "CPI > 3.5%",
          side: "yes",
          shares: "50",
          avgEntryPrice: "0.55",
          currentPrice: "0.62",
        },
      ],
    });
    const result = await opinionContextProvider.get(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
    );
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("Opinion:");
  });

  it("returns empty text when client not ready", async () => {
    mockIsReady.value = false;
    const result = await opinionContextProvider.get(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
    );
    expect(result.text).toBe("");
    mockIsReady.value = true;
  });

  it("has position between wallet and pluginHealth", () => {
    expect(opinionContextProvider.position).toBeGreaterThan(30);
    expect(opinionContextProvider.position).toBeLessThan(50);
  });
});
