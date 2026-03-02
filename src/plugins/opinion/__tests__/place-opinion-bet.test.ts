import { describe, expect, it, vi } from "vitest";

const { mockPlaceBet } = vi.hoisted(() => ({
  mockPlaceBet: vi.fn().mockResolvedValue({ result: { orderId: "order-123" } }),
}));

vi.mock("../client.js", () => ({
  opinionClient: { isReady: true, canTrade: true, placeBet: mockPlaceBet },
}));
vi.mock("../../../config/config.js", () => ({
  loadMiladyConfig: vi.fn().mockReturnValue({}),
}));
vi.mock("../../../api/server.js", () => ({
  resolveTradePermissionMode: vi.fn().mockReturnValue("agent-auto"),
  canUseLocalTradeExecution: vi.fn().mockReturnValue(true),
}));

import { placeOpinionBetAction } from "../actions/place-opinion-bet.js";

describe("PLACE_OPINION_BET", () => {
  it("has correct name", () => { expect(placeOpinionBetAction.name).toBe("PLACE_OPINION_BET"); });
  it("rejects missing side", async () => {
    const result = await placeOpinionBetAction.handler({} as any, {} as any, {} as any, { parameters: { marketId: 1, tokenId: "abc", amount: "10" } } as any);
    expect(result.success).toBe(false);
  });
  it("rejects invalid amount", async () => {
    const result = await placeOpinionBetAction.handler({} as any, {} as any, {} as any, { parameters: { marketId: 1, tokenId: "abc", side: "buy", amount: "-5" } } as any);
    expect(result.success).toBe(false);
  });
  it("places bet successfully", async () => {
    const result = await placeOpinionBetAction.handler({} as any, {} as any, {} as any, { parameters: { marketId: 813, tokenId: "tok-yes", side: "buy", amount: "10", price: "0.55" } } as any);
    expect(result.success).toBe(true);
    expect(result.text).toContain("order-123");
    expect(mockPlaceBet).toHaveBeenCalledWith({ marketId: 813, tokenId: "tok-yes", side: "buy", amount: "10", price: "0.55" });
  });
});
