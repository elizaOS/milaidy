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

  it("keeps runtime-to-auto-enable package mappings aligned (reverse)", () => {
    for (const [connectorId, pluginName] of Object.entries(
      CHANNEL_PLUGIN_MAP,
    )) {
      expect(CONNECTOR_PLUGINS[connectorId]).toBe(pluginName);
    }
  });

  it("has no duplicate IDs in the CONNECTOR_IDS schema array", () => {
    const unique = new Set(CONNECTOR_IDS);
    expect(unique.size).toBe(CONNECTOR_IDS.length);
  });

  it("has identical count across all three maps", () => {
    expect(CONNECTOR_IDS).toHaveLength(17);
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(17);
    expect(Object.keys(CHANNEL_PLUGIN_MAP)).toHaveLength(17);
  });

  it("uses valid package name prefixes for all plugin mappings", () => {
    const validPrefix = /^@(elizaos|milady)\//;
    for (const pkg of Object.values(CONNECTOR_PLUGINS)) {
      expect(pkg).toMatch(validPrefix);
    }
    for (const pkg of Object.values(CHANNEL_PLUGIN_MAP)) {
      expect(pkg).toMatch(validPrefix);
    }
  });
});
