import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";

import { OpinionWsService } from "../services/opinion-ws.js";

describe("OpinionWsService", () => {
  it("has correct serviceType", () => {
    expect(OpinionWsService.serviceType).toBe("opinion-ws");
  });

  it("does not connect without API key", async () => {
    const original = process.env.OPINION_API_KEY;
    delete process.env.OPINION_API_KEY;
    const service = new OpinionWsService();
    await service.initialize({
      logger: { warn: () => {} },
    } as unknown as IAgentRuntime);
    expect(service.isConnected).toBe(false);
    if (original) process.env.OPINION_API_KEY = original;
  });
});
