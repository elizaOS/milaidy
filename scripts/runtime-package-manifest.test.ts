import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  discoverAlwaysBundledPackages,
  extractBarePackageSpecifiers,
  normalizePackageName,
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
});
