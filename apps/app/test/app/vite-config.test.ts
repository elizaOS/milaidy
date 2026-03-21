import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = path.resolve(TEST_DIR, "../..");
const CONFIG_PATH = path.join(APP_DIR, "vite.config.ts");

function getPluginNames(plugins: unknown[]): string[] {
  const names: string[] = [];

  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      names.push(...getPluginNames(plugin));
      continue;
    }

    if (
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      typeof plugin.name === "string"
    ) {
      names.push(plugin.name);
    }
  }

  return names;
}

describe("app vite config", () => {
  it("loads through Vite's bundled config loader", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "test" },
      CONFIG_PATH,
      APP_DIR,
    );

    expect(loaded).not.toBeNull();

    const pluginNames = getPluginNames(loaded?.config.plugins ?? []);
    expect(pluginNames).toContain("public-src");
    expect(pluginNames).toContain("desktop-cors");
  });
});
