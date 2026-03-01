import { describe, expect, it } from "vitest";
import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { createMiladyPlugin } from "./milady-plugin";

/**
 * Extract the uiCatalog provider from the Milady plugin.
 * This is an integration-level helper — we call createMiladyPlugin() and
 * pull the named provider out of the returned providers array.
 */
function getUiCatalogProvider(): Provider {
  const plugin = createMiladyPlugin();
  const provider = (plugin.providers ?? []).find((p) => p.name === "uiCatalog");
  if (!provider) throw new Error("uiCatalog provider not found in plugin");
  return provider;
}

/** Minimal mock runtime with optional plugins list. */
function mockRuntime(
  plugins?: Array<{ name: string }>,
): IAgentRuntime {
  return { plugins: plugins ?? [] } as unknown as IAgentRuntime;
}

/** Build a Memory with the simple flag set. */
function simpleMessage(): Memory {
  return { content: { simple: true } } as unknown as Memory;
}

/** Build a Memory with simple = false (explicit power mode). */
function powerMessage(): Memory {
  return { content: { simple: false } } as unknown as Memory;
}

/** Build a Memory with no mode flag at all (default). */
function defaultMessage(): Memory {
  return { content: {} } as unknown as Memory;
}

// Component catalog keywords that should only appear in power mode.
const CATALOG_KEYWORDS = ["Stack", "Grid", "BarGraph"];

describe("uiCatalog provider — conditional on interaction mode", () => {
  it("simple mode: returns text WITHOUT component catalog keywords", async () => {
    const provider = getUiCatalogProvider();
    const result = await provider.get(
      mockRuntime(),
      simpleMessage(),
      {} as State,
    );

    const text = result.text ?? "";
    for (const kw of CATALOG_KEYWORDS) {
      expect(text).not.toContain(`**${kw}**`);
    }
  });

  it("simple mode: returns text WITH plugin instruction header", async () => {
    const provider = getUiCatalogProvider();
    const result = await provider.get(
      mockRuntime([{ name: "@elizaos/plugin-knowledge" }]),
      simpleMessage(),
      {} as State,
    );

    const text = result.text ?? "";
    // The instruction block header is always present
    expect(text).toContain("## UI Response Instructions");
    // Plugin list should still appear
    expect(text).toContain("knowledge");
  });

  it("power mode: returns text WITH full component catalog", async () => {
    const provider = getUiCatalogProvider();
    const result = await provider.get(
      mockRuntime(),
      powerMessage(),
      {} as State,
    );

    const text = result.text ?? "";
    // Component catalog keywords present (rendered as **Name**: ...)
    for (const kw of CATALOG_KEYWORDS) {
      expect(text).toContain(`**${kw}**`);
    }
    // Instruction header also present
    expect(text).toContain("## UI Response Instructions");
  });

  it("default (no mode flag): treated as power mode — has catalog", async () => {
    const provider = getUiCatalogProvider();
    const result = await provider.get(
      mockRuntime(),
      defaultMessage(),
      {} as State,
    );

    const text = result.text ?? "";
    for (const kw of CATALOG_KEYWORDS) {
      expect(text).toContain(`**${kw}**`);
    }
  });

  it("catalog is cached across calls (same content reused)", async () => {
    // Use a single provider instance so the closure-level catalogCache is shared
    const provider = getUiCatalogProvider();
    const runtime = mockRuntime();

    const result1 = await provider.get(runtime, powerMessage(), {} as State);
    const result2 = await provider.get(runtime, powerMessage(), {} as State);

    // Content must be identical — proves the cached value was reused
    expect(result1.text).toBe(result2.text);
    // And it must actually contain catalog content (not empty)
    expect((result1.text ?? "").length).toBeGreaterThan(500);
  });
});
