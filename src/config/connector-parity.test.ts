import { describe, expect, it } from "vitest";
import { CHANNEL_PLUGIN_MAP } from "../runtime/eliza";
import { CONNECTOR_PLUGINS } from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("connector map parity", () => {
  it("keeps connector IDs aligned across schema, runtime, and auto-enable", () => {
    const autoEnableIds = sorted(Object.keys(CONNECTOR_PLUGINS));
    const runtimeIds = sorted(Object.keys(CHANNEL_PLUGIN_MAP));
    const schemaIds = sorted(CONNECTOR_IDS);

    expect(runtimeIds).toEqual(autoEnableIds);
    expect(schemaIds).toEqual(autoEnableIds);
  });

  it("keeps runtime and auto-enable package mappings aligned", () => {
    for (const [connectorId, pluginName] of Object.entries(CONNECTOR_PLUGINS)) {
      expect(CHANNEL_PLUGIN_MAP[connectorId]).toBe(pluginName);
    }
  });
});
