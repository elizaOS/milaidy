import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getMarket: vi.fn().mockResolvedValue({
      result: {
        id: 813,
        title: "Will CPI exceed 3.5%?",
        status: 2,
        childMarkets: [
          { tokenId: "tok-yes", outcomeName: "Yes", lastPrice: "0.62" },
          { tokenId: "tok-no", outcomeName: "No", lastPrice: "0.38" },
        ],
        endTime: "2026-04-01T00:00:00Z",
      },
    }),
    getOrderbook: vi.fn().mockResolvedValue({
      result: {
        bids: [{ price: "0.60", size: "100" }],
        asks: [{ price: "0.63", size: "50" }],
      },
    }),
  },
}));

import { getOpinionMarketAction } from "../actions/get-opinion-market.js";

describe("GET_OPINION_MARKET", () => {
  it("has correct name", () => {
    expect(getOpinionMarketAction.name).toBe("GET_OPINION_MARKET");
  });
  it("returns market detail with orderbook", async () => {
    const result = await getOpinionMarketAction.handler(
      {} as Partial<IAgentRuntime> as IAgentRuntime,
      {} as Partial<Memory> as Memory,
      {} as Partial<State> as State,
      { parameters: { marketId: 813 } } as Record<string, unknown>,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("0.60");
  });
  it("rejects missing marketId", async () => {
    const result = await getOpinionMarketAction.handler(
      {} as Partial<IAgentRuntime> as IAgentRuntime,
      {} as Partial<Memory> as Memory,
      {} as Partial<State> as State,
      { parameters: {} } as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
  });
});
