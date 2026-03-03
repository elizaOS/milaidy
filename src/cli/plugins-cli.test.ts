import { describe, expect, it } from "vitest";
import { normalizePluginName, parsePluginSpec } from "./plugins-cli";

describe("normalizePluginName", () => {
  it("passes through scoped packages unchanged", () => {
    expect(normalizePluginName("@elizaos/plugin-twitter")).toBe(
      "@elizaos/plugin-twitter",
    );
  });

  it("passes through custom scoped packages unchanged", () => {
    expect(normalizePluginName("@custom/plugin-x")).toBe("@custom/plugin-x");
  });

  it("passes through plugin- prefixed names unchanged", () => {
    expect(normalizePluginName("plugin-twitter")).toBe("plugin-twitter");
  });

  it("expands shorthand names to @elizaos/plugin- prefix", () => {
    expect(normalizePluginName("twitter")).toBe("@elizaos/plugin-twitter");
    expect(normalizePluginName("discord")).toBe("@elizaos/plugin-discord");
    expect(normalizePluginName("whatsapp")).toBe("@elizaos/plugin-whatsapp");
  });
});

describe("parsePluginSpec", () => {
  it("returns name only when no version provided", () => {
    expect(parsePluginSpec("twitter")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: undefined,
    });
  });

  it("parses shorthand name with version", () => {
    expect(parsePluginSpec("twitter@1.2.23-alpha.0")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: "1.2.23-alpha.0",
    });
  });

  it("parses fully qualified scoped name without version", () => {
    expect(parsePluginSpec("@elizaos/plugin-twitter")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: undefined,
    });
  });

  it("parses fully qualified scoped name with version", () => {
    expect(parsePluginSpec("@elizaos/plugin-twitter@1.2.23-alpha.0")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: "1.2.23-alpha.0",
    });
  });

  it("parses custom scoped package with version", () => {
    expect(parsePluginSpec("@custom/plugin-x@2.0.0")).toEqual({
      name: "@custom/plugin-x",
      version: "2.0.0",
    });
  });

  it("parses dist-tag as version", () => {
    expect(parsePluginSpec("discord@next")).toEqual({
      name: "@elizaos/plugin-discord",
      version: "next",
    });
  });

  it("parses plugin- prefixed name with version", () => {
    expect(parsePluginSpec("plugin-twitter@1.0.0")).toEqual({
      name: "plugin-twitter",
      version: "1.0.0",
    });
  });

  it("trims whitespace from version", () => {
    expect(parsePluginSpec("twitter@ 1.2.3 ")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: "1.2.3",
    });
  });

  it("normalizes empty version strings to undefined", () => {
    expect(parsePluginSpec("twitter@")).toEqual({
      name: "@elizaos/plugin-twitter",
      version: undefined,
    });
  });
});
