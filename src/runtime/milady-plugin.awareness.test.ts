import { describe, expect, it } from "vitest";
import { createMiladyPlugin } from "./milady-plugin";

describe("milady plugin self-awareness integration", () => {
  it("registers agentSelfStatus provider", () => {
    const plugin = createMiladyPlugin();
    const providerNames = (plugin.providers ?? []).map((p) => p.name);
    expect(providerNames).toContain("agentSelfStatus");
  });

  it("registers GET_SELF_STATUS action", () => {
    const plugin = createMiladyPlugin();
    const actionNames = (plugin.actions ?? []).map((a) => a.name);
    expect(actionNames).toContain("GET_SELF_STATUS");
  });
});
