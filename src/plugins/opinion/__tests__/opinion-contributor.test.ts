import { describe, expect, it, vi } from "vitest";
import { SUMMARY_CHAR_LIMIT } from "../../../contracts/awareness.js";

const mockGetPositions = vi.fn();
const mockIsReady = { value: true };

vi.mock("../client.js", () => ({
  opinionClient: {
    get isReady() { return mockIsReady.value; },
    get canTrade() { return true; },
    getPositions: (...args: any[]) => mockGetPositions(...args),
  },
}));

import { opinionContributor } from "../awareness/opinion-contributor.js";

describe("opinionContributor", () => {
  it("has correct id and position", () => {
    expect(opinionContributor.id).toBe("opinion");
    expect(opinionContributor.position).toBe(35);
  });

  it("is marked trusted", () => {
    expect(opinionContributor.trusted).toBe(true);
  });

  it("summary stays within char limit", async () => {
    mockGetPositions.mockResolvedValue({
      result: [
        { marketTitle: "CPI", side: "yes", shares: "50", currentPrice: "0.62", avgEntryPrice: "0.55" },
        { marketTitle: "Fed Rate", side: "no", shares: "30", currentPrice: "0.40", avgEntryPrice: "0.45" },
      ],
    });
    const summary = await opinionContributor.summary({} as any);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_CHAR_LIMIT);
  });

  it("summary returns not connected when client not ready", async () => {
    mockIsReady.value = false;
    const summary = await opinionContributor.summary({} as any);
    expect(summary).toBe("Opinion: not connected");
    mockIsReady.value = true;
  });

  it("has invalidateOn events", () => {
    expect(opinionContributor.invalidateOn).toContain("opinion-updated");
  });
});
