import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    canTrade: true,
    getPositions: vi.fn().mockResolvedValue({
      result: [
        {
          marketId: 813,
          marketTitle: "CPI > 3.5%",
          side: "yes",
          shares: "50",
          avgEntryPrice: "0.55",
          currentPrice: "0.62",
        },
      ],
    }),
    getOrders: vi.fn().mockResolvedValue({
      result: { list: [{ orderId: "o1", status: "open" }] },
    }),
    cancelOrder: vi.fn().mockResolvedValue({ result: {} }),
    redeem: vi.fn().mockResolvedValue(["0xhash123", {}, {}]),
  },
}));

import { cancelOpinionOrderAction } from "../actions/cancel-opinion-order.js";
import { checkOpinionPositionsAction } from "../actions/check-opinion-positions.js";
import { redeemOpinionAction } from "../actions/redeem-opinion.js";

describe("CHECK_OPINION_POSITIONS", () => {
  it("returns formatted positions", async () => {
    const result = await checkOpinionPositionsAction.handler(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
      {} as unknown as Record<string, unknown>,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
  });
});

describe("CANCEL_OPINION_ORDER", () => {
  it("cancels by orderId", async () => {
    const result = await cancelOpinionOrderAction.handler(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
      { parameters: { orderId: "o1" } } as unknown as Record<string, unknown>,
    );
    expect(result.success).toBe(true);
  });
});

describe("REDEEM_OPINION", () => {
  it("redeems resolved market", async () => {
    const result = await redeemOpinionAction.handler(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
      { parameters: { marketId: 813 } } as unknown as Record<string, unknown>,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("0xhash123");
  });
  it("rejects missing marketId", async () => {
    const result = await redeemOpinionAction.handler(
      {} as unknown as IAgentRuntime,
      {} as unknown as Memory,
      {} as unknown as State,
      { parameters: {} } as unknown as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
  });
});
