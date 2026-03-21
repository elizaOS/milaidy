import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  discoverAlwaysBundledPackages,
  extractBarePackageSpecifiers,
  isRuntimePluginPackage,
  normalizePackageName,
  shouldBundleDiscoveredPackage,
} from "./runtime-package-manifest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPackageJson = path.join(__dirname, "..", "package.json");

describe("runtime-package-manifest", () => {
  it("normalizes package roots from bare specifiers", () => {
    expect(normalizePackageName("@scope/pkg/subpath.js")).toBe("@scope/pkg");
    expect(normalizePackageName("unscoped-package/subpath")).toBe(
      "unscoped-package",
    );
    expect(normalizePackageName("@scope/pkg")).toBe("@scope/pkg");
  });

  it("ignores non-package specifiers", () => {
    expect(normalizePackageName("./relative.js")).toBeNull();
    expect(normalizePackageName("/absolute/path.js")).toBeNull();
    expect(normalizePackageName("node:fs")).toBeNull();
    expect(normalizePackageName("file:///tmp/app.js")).toBeNull();
  });

  it("extracts package names from static and dynamic imports", () => {
    const source = `
      import { logger } from "@elizaos/core";
      export { thing } from "@elizaos/plugin-retake";
      const chalk = require("chalk");
      await import("@scope/pkg/subpath.js");
      await import("./relative.js");
    `;

    expect(extractBarePackageSpecifiers(source)).toEqual([
      "@elizaos/core",
      "@elizaos/plugin-retake",
      "@scope/pkg",
      "chalk",
    ]);
  });

  it("recognizes scoped and unscoped runtime plugin packages", () => {
    expect(isRuntimePluginPackage("@elizaos/plugin-openai")).toBe(true);
    expect(isRuntimePluginPackage("@miladyai/plugin-custom-rtmp")).toBe(true);
    expect(isRuntimePluginPackage("@homunculuslabs/plugin-zai")).toBe(true);
    expect(isRuntimePluginPackage("plugin-local-only")).toBe(true);
    expect(isRuntimePluginPackage("@elizaos/core")).toBe(false);
    expect(isRuntimePluginPackage("chalk")).toBe(false);
  });

  it("discovers always-bundled plugin scopes from package.json", () => {
    const bundled = discoverAlwaysBundledPackages(repoPackageJson);

    expect(bundled).toEqual(
      expect.arrayContaining([
        "@elizaos/core",
        "@elizaos/plugin-agent-orchestrator",
        "@elizaos/plugin-openai",
        "@elizaos/plugin-ollama",
      ]),
    );
    expect(bundled).not.toContain("@elizaos/plugin-bnb-identity");
    expect(bundled).not.toContain("@elizaos/plugin-streaming-base");
  });

  it("resolves the manifest module through node tsx like desktop staging", () => {
    const repoRoot = path.join(__dirname, "..");
    const manifestModuleUrl = pathToFileURL(
      path.join(__dirname, "runtime-package-manifest.ts"),
    ).href;
    const script = `
      const { discoverAlwaysBundledPackages } = await import(${JSON.stringify(manifestModuleUrl)});
      console.log(JSON.stringify(discoverAlwaysBundledPackages(${JSON.stringify(repoPackageJson)})));
    `;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    if (result.status !== 0) {
      throw new Error(
        result.stderr || result.stdout || "node --import tsx failed",
      );
    }

    const bundled = JSON.parse(result.stdout.trim()) as string[];
    expect(bundled).toEqual(
      expect.arrayContaining([
        "@elizaos/core",
        "@elizaos/plugin-agent-orchestrator",
        "@elizaos/plugin-openai",
      ]),
    );
  });

  it("excludes discovered post-release plugin packages from the baseline bundle", () => {
    const alwaysBundled = new Set([
      "@elizaos/plugin-openai",
      "@elizaos/plugin-ollama",
    ]);

    expect(
      shouldBundleDiscoveredPackage("@elizaos/plugin-openai", alwaysBundled),
    ).toBe(true);
    expect(
      shouldBundleDiscoveredPackage(
        "@elizaos/plugin-twitch-streaming",
        alwaysBundled,
      ),
    ).toBe(false);
    expect(
      shouldBundleDiscoveredPackage(
        "@homunculuslabs/plugin-zai",
        alwaysBundled,
      ),
    ).toBe(false);
    expect(shouldBundleDiscoveredPackage("chalk", alwaysBundled)).toBe(true);
  });
});
