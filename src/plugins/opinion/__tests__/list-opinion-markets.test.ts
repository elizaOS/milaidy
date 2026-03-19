import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getMarkets: vi.fn().mockResolvedValue({
      result: {
        list: [
          {
            id: 813,
            title: "Will CPI exceed 3.5%?",
            status: 2,
            childMarkets: [
              { tokenId: "tok-yes", outcomeName: "Yes", lastPrice: "0.62" },
              { tokenId: "tok-no", outcomeName: "No", lastPrice: "0.38" },
            ],
            endTime: "2026-04-01T00:00:00Z",
          },
        ],
        total: 1,
      },
    }),
  },
}));

import { listOpinionMarketsAction } from "../actions/list-opinion-markets.js";

describe("LIST_OPINION_MARKETS", () => {
  it("has correct name and similes", () => {
    expect(listOpinionMarketsAction.name).toBe("LIST_OPINION_MARKETS");
    expect(listOpinionMarketsAction.similes).toContain("OPINION_MARKETS");
  });

  it("handler returns formatted market list", async () => {
    const result = await listOpinionMarketsAction.handler(
      {} as Partial<IAgentRuntime> as IAgentRuntime,
      {} as Partial<Memory> as Memory,
      {} as Partial<State> as State,
      { parameters: {} } as Record<string, unknown>,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("0.62");
  });

  it("validate returns true when client is ready", async () => {
    const valid = await listOpinionMarketsAction.validate?.(
      {} as Partial<IAgentRuntime> as IAgentRuntime,
      {} as Partial<Memory> as Memory,
    );
    expect(valid).toBe(true);
  });
});
