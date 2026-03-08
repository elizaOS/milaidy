import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { AwarenessRegistry } from "../awareness/registry";
import { createSelfStatusProvider } from "./self-status";

describe("self-status provider", () => {
  it("has correct name and position", () => {
    const registry = new AwarenessRegistry();
    const provider = createSelfStatusProvider(registry);
    expect(provider.name).toBe("agentSelfStatus");
    expect(provider.position).toBe(12);
    expect(provider.alwaysRun).toBe(true);
  });

  it("returns composeSummary output as text", async () => {
    const registry = new AwarenessRegistry();
    registry.register({
      id: "test",
      position: 10,
      trusted: true,
      summary: async () => "Test: ok",
    });
    const provider = createSelfStatusProvider(registry);
    const result = await provider.get(
      {} as IAgentRuntime,
      {} as Memory,
      {} as State,
    );
    expect(result.text).toContain("[Self Status v1]");
    expect(result.text).toContain("Test: ok");
  });

  it("returns header when no contributors registered", async () => {
    const registry = new AwarenessRegistry();
    const provider = createSelfStatusProvider(registry);
    const result = await provider.get(
      {} as IAgentRuntime,
      {} as Memory,
      {} as State,
    );
    expect(result.text).toContain("[Self Status v1]");
  });
});
