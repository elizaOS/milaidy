import { describe, expect, it, vi } from "vitest";
import { CORE_PLUGINS } from "./core-plugins";

/**
 * Tests for the sequential core plugin pre-registration logic in eliza.ts.
 *
 * The actual registration logic is inlined in startEliza() / onRestart(), so
 * these tests replicate the pattern and verify its behavior with mocked
 * runtime.registerPlugin().
 */
describe("sequential core plugin pre-registration", () => {
  it("should register core plugins in CORE_PLUGINS array order", async () => {
    const registrationOrder: string[] = [];
    const mockRuntime = {
      registerPlugin: vi.fn(async (plugin: { name: string }) => {
        registrationOrder.push(plugin.name);
      }),
    };

    const resolvedPlugins = CORE_PLUGINS.map((name) => ({
      name,
      plugin: { name },
    }));

    const alreadyPreRegistered = new Set([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
    ]);

    for (const name of CORE_PLUGINS) {
      if (alreadyPreRegistered.has(name)) continue;
      const resolved = resolvedPlugins.find((p) => p.name === name);
      if (!resolved) continue;
      await mockRuntime.registerPlugin(resolved.plugin);
    }

    // Verify order matches CORE_PLUGINS (excluding sql + local-embedding)
    const expected = CORE_PLUGINS.filter((n) => !alreadyPreRegistered.has(n));
    expect(registrationOrder).toEqual(expected);
  });

  it("should skip plugin-sql and plugin-local-embedding (already pre-registered)", async () => {
    const registered: string[] = [];
    const mockRuntime = {
      registerPlugin: vi.fn(async (plugin: { name: string }) => {
        registered.push(plugin.name);
      }),
    };

    const resolvedPlugins = CORE_PLUGINS.map((name) => ({
      name,
      plugin: { name },
    }));

    const alreadyPreRegistered = new Set([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
    ]);

    for (const name of CORE_PLUGINS) {
      if (alreadyPreRegistered.has(name)) continue;
      const resolved = resolvedPlugins.find((p) => p.name === name);
      if (!resolved) continue;
      await mockRuntime.registerPlugin(resolved.plugin);
    }

    expect(registered).not.toContain("@elizaos/plugin-sql");
    expect(registered).not.toContain("@elizaos/plugin-local-embedding");
  });

  it("should isolate failures — subsequent plugins register even when one throws", async () => {
    const registered: string[] = [];
    const failingPlugin = "@elizaos/plugin-form";
    const mockRuntime = {
      registerPlugin: vi.fn(async (plugin: { name: string }) => {
        if (plugin.name === failingPlugin) {
          throw new Error("simulated init failure");
        }
        registered.push(plugin.name);
      }),
    };

    const resolvedPlugins = CORE_PLUGINS.map((name) => ({
      name,
      plugin: { name },
    }));

    const alreadyPreRegistered = new Set([
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
    ]);

    for (const name of CORE_PLUGINS) {
      if (alreadyPreRegistered.has(name)) continue;
      const resolved = resolvedPlugins.find((p) => p.name === name);
      if (!resolved) continue;
      try {
        await mockRuntime.registerPlugin(resolved.plugin);
      } catch {
        // logged as warning, non-fatal
      }
    }

    // The failing plugin is not in the registered list
    expect(registered).not.toContain(failingPlugin);
    // But plugins after it are still registered
    const expectedAfterFailure = CORE_PLUGINS.filter(
      (n) => !alreadyPreRegistered.has(n) && n !== failingPlugin,
    );
    expect(registered).toEqual(expectedAfterFailure);
    expect(registered.length).toBeGreaterThan(0);
  });

  it("should filter core plugins from otherPlugins (no double-registration)", () => {
    const PREREGISTER_PLUGINS = new Set(CORE_PLUGINS);

    const allResolvedPlugins = [
      ...CORE_PLUGINS.map((name) => ({ name, plugin: { name } })),
      {
        name: "@elizaos/plugin-discord",
        plugin: { name: "@elizaos/plugin-discord" },
      },
      { name: "custom-plugin", plugin: { name: "custom-plugin" } },
    ];

    const otherPlugins = allResolvedPlugins.filter(
      (p) => !PREREGISTER_PLUGINS.has(p.name),
    );

    // No core plugin should appear in otherPlugins
    for (const corePlugin of CORE_PLUGINS) {
      expect(otherPlugins.find((p) => p.name === corePlugin)).toBeUndefined();
    }

    // Non-core plugins should be present
    expect(otherPlugins.map((p) => p.name)).toEqual([
      "@elizaos/plugin-discord",
      "custom-plugin",
    ]);
  });
});
