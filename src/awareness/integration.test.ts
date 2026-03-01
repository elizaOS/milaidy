import { describe, expect, it } from "vitest";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { AwarenessRegistry } from "./registry";
import { builtinContributors } from "./contributors";
import { createSelfStatusProvider } from "../providers/self-status";
import { getSelfStatusAction } from "../actions/get-self-status";
import { SUMMARY_TOTAL_CHAR_LIMIT } from "../contracts/awareness";
import { getGlobalAwarenessRegistry, setGlobalAwarenessRegistry } from "./registry";

function fakeRuntime(): IAgentRuntime {
  return {
    plugins: [{ name: "milady" }, { name: "test-plugin" }],
    character: { settings: { model: "claude-opus-4-6" } },
    getSetting: () => null,
    getService: () => null,
    clients: [],
  } as unknown as IAgentRuntime;
}

describe("self-awareness integration", () => {
  it("full pipeline: register → compose → inject → query", async () => {
    const registry = new AwarenessRegistry();
    for (const c of builtinContributors) {
      registry.register(c);
    }

    const runtime = fakeRuntime();

    // Layer 1: provider injects summary
    const provider = createSelfStatusProvider(registry);
    const providerResult = await provider.get(runtime, {} as Memory, {} as State);
    expect(providerResult.text).toContain("[Self Status v1]");
    expect(providerResult.text!.length).toBeLessThanOrEqual(SUMMARY_TOTAL_CHAR_LIMIT);

    // Layer 2: action returns detail (using global registry)
    setGlobalAwarenessRegistry(registry);
    const actionResult = await getSelfStatusAction.handler(
      runtime, {} as never, {} as never,
      { parameters: { module: "all", detailLevel: "brief" } },
    );
    expect(actionResult?.success).toBe(true);
    expect(actionResult?.text).toBeTruthy();
  });

  it("invalidation clears and refreshes cache", async () => {
    const registry = new AwarenessRegistry();
    let callCount = 0;
    registry.register({
      id: "test",
      position: 10,
      trusted: true,
      cacheTtl: 300_000,
      invalidateOn: ["permission-changed"],
      summary: async () => { callCount++; return "perm line"; },
    });

    const runtime = fakeRuntime();
    await registry.composeSummary(runtime);
    expect(callCount).toBe(1);

    await registry.composeSummary(runtime);
    expect(callCount).toBe(1); // cached

    registry.invalidate("permission-changed");
    await registry.composeSummary(runtime);
    expect(callCount).toBe(2); // refreshed
  });

  it("global registry accessor works", () => {
    const registry = new AwarenessRegistry();
    setGlobalAwarenessRegistry(registry);
    expect(getGlobalAwarenessRegistry()).toBe(registry);
  });
});
