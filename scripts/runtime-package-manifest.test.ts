import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildDesktopRuntimeInventory,
  classifyDesktopRuntimePackage,
  discoverAlwaysBundledPackages,
  extractBarePackageSpecifiers,
  normalizePackageName,
  shouldBundleDesktopRuntimePackage,
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
      export { thing } from "@milady/plugin-retake";
      const chalk = require("chalk");
      await import("@scope/pkg/subpath.js");
      await import("./relative.js");
    `;

    expect(extractBarePackageSpecifiers(source)).toEqual([
      "@elizaos/core",
      "@milady/plugin-retake",
      "@scope/pkg",
      "chalk",
    ]);
  });

  it("discovers always-bundled plugin scopes from package.json", () => {
    expect(discoverAlwaysBundledPackages(repoPackageJson)).toEqual(
      expect.arrayContaining([
        "@elizaos/core",
        "@elizaos/plugin-agent-orchestrator",
        "@milady/plugin-bnb-identity",
        "@milady/plugin-streaming-base",
      ]),
    );
  });

  it("classifies heavy and optional desktop packages into explicit buckets", () => {
    expect(classifyDesktopRuntimePackage("@elizaos/core")).toMatchObject({
      bucket: "base",
      capabilityPack: "core-runtime",
    });
    expect(classifyDesktopRuntimePackage("node-llama-cpp")).toMatchObject({
      bucket: "lazy-base",
      capabilityPack: "local-ai",
    });
    expect(
      classifyDesktopRuntimePackage("@elizaos/plugin-browser"),
    ).toMatchObject({
      bucket: "optional-pack",
      capabilityPack: "browser-automation",
    });
    expect(classifyDesktopRuntimePackage("whisper-node")).toMatchObject({
      bucket: "optional-pack",
      capabilityPack: "voice",
    });
    expect(
      classifyDesktopRuntimePackage("@milady/plugin-retake"),
    ).toMatchObject({
      bucket: "optional-pack",
      capabilityPack: "streaming",
    });
  });

  it("can exclude manifest-classified optional packs without affecting base packages", () => {
    expect(
      shouldBundleDesktopRuntimePackage(
        "@milady/plugin-streaming-base",
        new Set(["streaming" as const]),
      ),
    ).toBe(false);
    expect(
      shouldBundleDesktopRuntimePackage(
        "@elizaos/plugin-browser",
        new Set(["streaming" as const]),
      ),
    ).toBe(true);
    expect(
      shouldBundleDesktopRuntimePackage(
        "@elizaos/core",
        new Set(["streaming" as const]),
      ),
    ).toBe(true);
  });

  it("builds a desktop runtime inventory with explicit origins and summary counts", () => {
    const inventory = buildDesktopRuntimeInventory({
      alwaysBundledPackages: ["@elizaos/core", "@elizaos/plugin-browser"],
      bundledPackages: [
        "@elizaos/core",
        "@elizaos/plugin-browser",
        "chalk",
        "node-llama-cpp",
        "tslib",
      ],
      discoveredPackages: ["chalk", "node-llama-cpp"],
      generatedAt: "2026-03-10T00:00:00.000Z",
      missingPackages: ["@elizaos/plugin-vision"],
      scanDir: "/tmp/dist",
      targetDist: "/tmp/dist",
    });

    expect(inventory.summary).toEqual({
      baseBundledPackages: 3,
      bundledPackages: 5,
      explicitRequestedPackages: 4,
      excludedPackages: 0,
      lazyBaseBundledPackages: 1,
      missingPackages: 1,
      optionalPackBundledPackages: 1,
      transitiveBundledPackages: 1,
    });

    expect(
      inventory.packages.find((entry) => entry.name === "tslib"),
    ).toMatchObject({
      bucket: "base",
      bundled: true,
      requestedBy: ["transitive-runtime-dependency"],
    });
    expect(
      inventory.packages.find(
        (entry) => entry.name === "@elizaos/plugin-browser",
      ),
    ).toMatchObject({
      bucket: "optional-pack",
      requestedBy: ["always-bundled"],
    });
  });

  it("records excluded optional packs in the generated inventory", () => {
    const inventory = buildDesktopRuntimeInventory({
      alwaysBundledPackages: [
        "@elizaos/core",
        "@milady/plugin-retake",
        "@milady/plugin-streaming-base",
      ],
      bundledPackages: ["@elizaos/core"],
      discoveredPackages: [],
      excludedCapabilityPacks: ["streaming"],
      generatedAt: "2026-03-10T00:00:00.000Z",
      scanDir: "/tmp/dist",
      targetDist: "/tmp/dist",
    });

    expect(inventory.excludedCapabilityPacks).toEqual(["streaming"]);
    expect(inventory.excludedPackages).toEqual([
      "@milady/plugin-retake",
      "@milady/plugin-streaming-base",
    ]);
    expect(inventory.summary.excludedPackages).toBe(2);
    expect(
      inventory.packages.find(
        (entry) => entry.name === "@milady/plugin-streaming-base",
      ),
    ).toMatchObject({
      bucket: "optional-pack",
      bundled: false,
      excluded: true,
    });
    expect(
      inventory.packages.find(
        (entry) => entry.name === "@milady/plugin-retake",
      ),
    ).toMatchObject({
      bucket: "optional-pack",
      bundled: false,
      excluded: true,
    });
  });
});
