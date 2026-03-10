import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearDesktopRuntimeManifestCache,
  getExcludedDesktopRuntimeCapabilityPacks,
  getExcludedDesktopRuntimePackages,
  isDesktopRuntimePackageExcluded,
  resolveDesktopRuntimeManifestPath,
} from "./desktop-runtime-manifest";

describe("desktop-runtime-manifest", () => {
  afterEach(() => {
    clearDesktopRuntimeManifestCache();
  });

  it("returns empty exclusions when no manifest is present", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-runtime-manifest-missing-"),
    );
    const fakeModuleUrl = pathToFileURL(
      path.join(tempRoot, "runtime", "eliza.js"),
    ).href;

    expect(
      getExcludedDesktopRuntimePackages({ moduleUrl: fakeModuleUrl }),
    ).toEqual(new Set());
    expect(
      getExcludedDesktopRuntimeCapabilityPacks({ moduleUrl: fakeModuleUrl }),
    ).toEqual(new Set());
  });

  it("resolves exclusions from a packaged dist-relative manifest", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-runtime-manifest-"),
    );
    const distRoot = path.join(tempRoot, "dist");
    const runtimeDir = path.join(distRoot, "runtime");
    await fs.mkdir(runtimeDir, { recursive: true });

    const moduleUrl = pathToFileURL(path.join(runtimeDir, "eliza.js")).href;
    const manifestPath = resolveDesktopRuntimeManifestPath(moduleUrl);
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          excludedCapabilityPacks: ["streaming"],
          excludedPackages: [
            "@milady/plugin-retake",
            "@milady/plugin-youtube-streaming",
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    expect(getExcludedDesktopRuntimeCapabilityPacks({ moduleUrl })).toEqual(
      new Set(["streaming"]),
    );
    expect(getExcludedDesktopRuntimePackages({ moduleUrl })).toEqual(
      new Set(["@milady/plugin-retake", "@milady/plugin-youtube-streaming"]),
    );
    expect(
      isDesktopRuntimePackageExcluded("@milady/plugin-retake", { moduleUrl }),
    ).toBe(true);
    expect(
      isDesktopRuntimePackageExcluded("@elizaos/plugin-shell", { moduleUrl }),
    ).toBe(false);
  });
});
