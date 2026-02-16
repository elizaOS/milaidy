import { describe, expect, it } from "vitest";
import { getCorePluginNameForms, isCorePluginLoaded } from "./server";

describe("getCorePluginNameForms", () => {
  it("normalizes scoped and prefixed plugin names", () => {
    expect(getCorePluginNameForms("@elizaos/plugin-code")).toEqual(
      expect.arrayContaining(["@elizaos/plugin-code", "plugin-code", "code"]),
    );
  });

  it("adds historical aliases for known plugin variants", () => {
    expect(getCorePluginNameForms("@elizaos/plugin-code")).toEqual(
      expect.arrayContaining(["eliza-coder"]),
    );
    expect(getCorePluginNameForms("@elizaos/plugin-local-embedding")).toEqual(
      expect.arrayContaining(["local-ai"]),
    );
  });
});

describe("isCorePluginLoaded", () => {
  it("matches aliases and avoids false positives", () => {
    expect(isCorePluginLoaded(["eliza-coder"], "@elizaos/plugin-code")).toBe(
      true,
    );
    expect(isCorePluginLoaded(["eliza-coder"], "@elizaos/plugin-codec")).toBe(
      false,
    );
    expect(
      isCorePluginLoaded(
        ["plugin-local-embedding"],
        "@elizaos/plugin-local-embedding",
      ),
    ).toBe(true);
    expect(
      isCorePluginLoaded(
        ["plugin-local-embedding"],
        "@elizaos/plugin-local-embeddable",
      ),
    ).toBe(false);
  });

  it("matches loaded plugin names across variants", () => {
    expect(
      isCorePluginLoaded(
        ["local-ai", "some-other-plugin"],
        "@elizaos/plugin-local-embedding",
      ),
    ).toBe(true);
  });
});
