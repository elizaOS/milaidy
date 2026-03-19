import { describe, expect, it } from "vitest";

import {
  bundlesDependency,
  findLocalPackHotspots,
  hasLifecycleScriptReferencingMissingFile,
  isExactVersion,
  isExactVersionSpecifier,
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

  it("accepts exact pinned version specifiers", () => {
    expect(isExactVersion("0.3.14")).toBe(true);
    expect(isExactVersion("1.0.0")).toBe(true);
    expect(isExactVersion("2.0.0-alpha.87")).toBe(true);
    expect(isExactVersion("0.0.1-beta.1")).toBe(true);
    expect(isExactVersion("3.2.1-rc.0")).toBe(true);
  });

  it("accepts only strict semver specifiers for orchestrator release pins", () => {
    expect(isExactVersionSpecifier("0.3.14")).toBe(true);
    expect(isExactVersionSpecifier("2.0.0-alpha.1")).toBe(true);
    expect(isExactVersionSpecifier("1.2.3+build.4")).toBe(true);
    expect(isExactVersionSpecifier(undefined)).toBe(false);
    expect(isExactVersionSpecifier("next")).toBe(false);
    expect(isExactVersionSpecifier("latest")).toBe(false);
    expect(isExactVersionSpecifier("^0.3.14")).toBe(false);
    expect(isExactVersionSpecifier("~0.3.14")).toBe(false);
    expect(isExactVersionSpecifier("workspace:*")).toBe(false);
  });

  it("rejects floating tags and range specifiers", () => {
    expect(isExactVersion("next")).toBe(false);
    expect(isExactVersion("latest")).toBe(false);
    expect(isExactVersion("^0.3.14")).toBe(false);
    expect(isExactVersion("~1.0.0")).toBe(false);
    expect(isExactVersion(">=1.0.0")).toBe(false);
    expect(isExactVersion("*")).toBe(false);
    expect(isExactVersion("<2.0.0")).toBe(false);
    expect(isExactVersion("")).toBe(false);
  });

  it("rejects workspace, npm, and URL specifiers", () => {
    expect(isExactVersion("workspace:*")).toBe(false);
    expect(isExactVersion("npm:foo@1.0.0")).toBe(false);
    expect(isExactVersion("file:../local-pkg")).toBe(false);
    expect(isExactVersion("git+https://github.com/foo/bar")).toBe(false);
    expect(
      isExactVersion("https://registry.npmjs.org/foo/-/foo-1.0.0.tgz"),
    ).toBe(false);
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
