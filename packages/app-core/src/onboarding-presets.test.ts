import { describe, expect, it } from "vitest";
import {
  CHARACTER_PRESET_META,
  getPresetNameMap,
  getStylePresets,
  STYLE_PRESETS,
} from "./onboarding-presets";

describe("getStylePresets", () => {
  it("returns the STYLE_PRESETS array", () => {
    expect(getStylePresets()).toBe(STYLE_PRESETS);
  });

  it("returns a non-empty array", () => {
    expect(getStylePresets().length).toBeGreaterThan(0);
  });
});

describe("getPresetNameMap", () => {
  it("returns a name→catchphrase mapping for every CHARACTER_PRESET_META entry", () => {
    const map = getPresetNameMap();
    const metaValues = Object.values(CHARACTER_PRESET_META);
    expect(Object.keys(map).length).toBe(metaValues.length);
    for (const entry of metaValues) {
      expect(map[entry.name]).toBe(entry.catchphrase);
    }
  });

  it("keys match CHARACTER_PRESET_META names exactly", () => {
    const map = getPresetNameMap();
    const expectedNames = Object.values(CHARACTER_PRESET_META).map(
      (e) => e.name,
    );
    expect(Object.keys(map).sort()).toEqual(expectedNames.sort());
  });
});
