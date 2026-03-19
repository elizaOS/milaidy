/**
 * Lens Protocol Connector Unit Tests — GitHub Issue #151
 *
 * Basic validation tests for the Lens Protocol connector plugin.
 * For comprehensive e2e tests, see test/lens-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveLensPluginImportSpecifier,
} from "../test-support/test-helpers";

const LENS_PLUGIN_IMPORT = resolveLensPluginImportSpecifier();
const LENS_PLUGIN_AVAILABLE = LENS_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = LENS_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadLensPluginModule = async () => {
  if (!LENS_PLUGIN_IMPORT) {
    throw new Error("Lens plugin is not resolvable");
  }
  return (await import(LENS_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Lens Connector - Basic Validation", () => {
  it("can import the Lens plugin package", async () => {
    const mod = await loadLensPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("lens");
  });

  it("plugin has a description", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { clients?: unknown[] } | null;

    expect(plugin?.clients).toBeDefined();
    expect(Array.isArray(plugin?.clients)).toBe(true);
    expect(plugin?.clients?.length).toBeGreaterThan(0);
  });
});

describe("Lens Connector - Protocol Constraints", () => {
  it("Lens profile handle format is valid", () => {
    const handlePattern = /^@lens\/[a-z0-9_]+$/;

    expect(handlePattern.test("@lens/stani")).toBe(true);
    expect(handlePattern.test("@lens/milady_agent")).toBe(true);
    expect(handlePattern.test("@lens/user123")).toBe(true);
    expect(handlePattern.test("stani")).toBe(false);
    expect(handlePattern.test("@farcaster/user")).toBe(false);
    expect(handlePattern.test("@lens/")).toBe(false);
    expect(handlePattern.test("@lens/User")).toBe(false);
  });

  it("Ethereum address format validation", () => {
    const addressPattern = /^0x[0-9a-fA-F]{40}$/;

    expect(
      addressPattern.test("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toBe(true);
    expect(
      addressPattern.test("0x0000000000000000000000000000000000000000"),
    ).toBe(true);
    expect(addressPattern.test("0xabc")).toBe(false);
    expect(addressPattern.test("not-an-address")).toBe(false);
    expect(
      addressPattern.test("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toBe(false);
  });

  it("private key format validation", () => {
    const pkPattern = /^0x[0-9a-fA-F]{64}$/;

    expect(
      pkPattern.test(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      ),
    ).toBe(true);
    expect(pkPattern.test("0xabc")).toBe(false);
    expect(pkPattern.test("not-a-key")).toBe(false);
    expect(pkPattern.test("0x")).toBe(false);
  });
});
