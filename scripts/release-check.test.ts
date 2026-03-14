import { describe, expect, it } from "vitest";

import {
  bundlesDependency,
  findLocalPackHotspots,
  hasLifecycleScriptReferencingMissingFile,
  isPackPathCoveredByFilesList,
  shouldSkipExactPackDryRun,
} from "./release-check";

describe("release-check local pack behavior", () => {
  it("detects configured local pack hotspots", () => {
    const hotspots = findLocalPackHotspots(
      ["dist/node_modules", "apps/app/dist/vrms", "apps/app/dist/animations"],
      (candidate) => candidate !== "apps/app/dist/animations",
    );

    expect(hotspots).toEqual(["dist/node_modules", "apps/app/dist/vrms"]);
  });

  it("skips exact pack dry-run only for local hotspot-heavy runs", () => {
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(true);
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "1",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(false);
    expect(
      shouldSkipExactPackDryRun(["dist/node_modules"], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "1",
      }),
    ).toBe(false);
    expect(
      shouldSkipExactPackDryRun([], {
        CI: "",
        GITHUB_ACTIONS: "",
        MILADY_FORCE_PACK_DRY_RUN: "",
      }),
    ).toBe(false);
  });
});

describe("release-check package guards", () => {
  it("treats parent directory file entries as covering required publish files", () => {
    expect(
      isPackPathCoveredByFilesList("dist/index.js", [
        "dist",
        "scripts/run-repo-setup.mjs",
      ]),
    ).toBe(true);
    expect(
      isPackPathCoveredByFilesList("scripts/lib/patch-bun-exports.mjs", [
        "dist",
        "scripts/run-repo-setup.mjs",
      ]),
    ).toBe(false);
  });

  it("accepts both bundleDependencies and bundledDependencies spellings", () => {
    expect(
      bundlesDependency(
        {
          bundleDependencies: ["@elizaos/plugin-agent-orchestrator"],
        },
        "@elizaos/plugin-agent-orchestrator",
      ),
    ).toBe(true);
    expect(
      bundlesDependency(
        {
          bundledDependencies: ["@elizaos/plugin-agent-orchestrator"],
        },
        "@elizaos/plugin-agent-orchestrator",
      ),
    ).toBe(true);
  });

  it("flags lifecycle hooks that reference missing files", () => {
    expect(
      hasLifecycleScriptReferencingMissingFile(
        {
          scripts: {
            postinstall: "node ./scripts/ensure-node-pty.mjs",
          },
        },
        "/tmp/plugin-agent-orchestrator",
        "postinstall",
        "./scripts/ensure-node-pty.mjs",
        () => false,
      ),
    ).toBe(true);

    expect(
      hasLifecycleScriptReferencingMissingFile(
        {
          scripts: {
            postinstall: "node ./scripts/ensure-node-pty.mjs",
          },
        },
        "/tmp/plugin-agent-orchestrator",
        "postinstall",
        "./scripts/ensure-node-pty.mjs",
        () => true,
      ),
    ).toBe(false);
  });
});
