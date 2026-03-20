import { describe, expect, it } from "vitest";
import { createMiladyPlugin } from "./milady-plugin";

describe("createMiladyPlugin", () => {
  it("registers wallet trading actions for onboarding/runtime use", () => {
    const plugin = createMiladyPlugin();
    const actionNames = (plugin.actions ?? []).map((action) => action.name);

    expect(actionNames).toContain("EXECUTE_TRADE");
    expect(actionNames).toContain("TRANSFER_TOKEN");
  });
});
