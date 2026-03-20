import signalPlugin from "@elizaos/plugin-signal";
import { describe, expect, it } from "vitest";

describe("signal plugin actions (public contract)", () => {
  it("exposes signal actions through the root plugin export", () => {
    expect(signalPlugin.name).toBe("signal");
    expect(Array.isArray(signalPlugin.actions)).toBe(true);
    expect(signalPlugin.actions?.length).toBeGreaterThan(0);
  });

  it("contains the expected primary action names", () => {
    const actionNames = new Set(
      (signalPlugin.actions ?? []).map((action) => action.name),
    );

    expect(actionNames.has("SIGNAL_SEND_MESSAGE")).toBe(true);
    expect(actionNames.has("SIGNAL_SEND_REACTION")).toBe(true);
    expect(actionNames.has("SIGNAL_LIST_CONTACTS")).toBe(true);
    expect(actionNames.has("SIGNAL_LIST_GROUPS")).toBe(true);
  });

  it("ships action entries with core handler shape", () => {
    for (const action of signalPlugin.actions ?? []) {
      expect(typeof action.name).toBe("string");
      expect(action.name.length).toBeGreaterThan(0);
      expect(typeof action.description).toBe("string");
      expect(typeof action.handler).toBe("function");
    }
  });
});
