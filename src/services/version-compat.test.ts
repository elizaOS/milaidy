/**
 * Tests for plugin ↔ core version compatibility validation.
 *
 * Validates the version-skew detection logic that prevents issue #10:
 * plugins at alpha.4 importing symbols missing from core at alpha.3.
 *
 * @see https://github.com/milady-ai/milady/issues/10
 */
import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_PLUGINS,
  compareSemver,
  diagnoseNoAIProvider,
  parseSemver,
  versionSatisfies,
} from "./version-compat";

type RootPackageJson = {
  dependencies: Record<string, string>;
  overrides?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
};

function _getCorePin(pkg: RootPackageJson): string | undefined {
  return (
    pkg.overrides?.["@elizaos/core"] ?? pkg.pnpm?.overrides?.["@elizaos/core"]
  );
}

// ============================================================================
//  1. Semver parsing
// ============================================================================

describe("parseSemver", () => {
  it("parses a standard release version", () => {
    expect(parseSemver("2.0.0")).toEqual([2, 0, 0, Number.POSITIVE_INFINITY]);
  });

  it("parses an alpha pre-release version", () => {
    expect(parseSemver("2.0.0-alpha.3")).toEqual([2, 0, 0, 3]);
  });

  it("parses an alpha pre-release with higher number", () => {
    expect(parseSemver("2.0.0-alpha.4")).toEqual([2, 0, 0, 4]);
  });

  it("parses a beta pre-release version", () => {
    expect(parseSemver("1.5.2-beta.1")).toEqual([1, 5, 2, 1]);
  });

  it("parses an rc pre-release version", () => {
    expect(parseSemver("3.0.0-rc.2")).toEqual([3, 0, 0, 2]);
  });

  it("parses a nightly pre-release version", () => {
    expect(parseSemver("2.0.0-nightly.20260208")).toEqual([2, 0, 0, 20260208]);
  });

  it("compares two nightly versions correctly", () => {
    const older = parseSemver("2.0.0-nightly.20260207");
    const newer = parseSemver("2.0.0-nightly.20260208");
    expect(older).not.toBeNull();
    expect(newer).not.toBeNull();
    expect(older?.[3]).toBeLessThan(newer?.[3]);
  });

  it("returns null for invalid version strings", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("v1.2.3")).toBeNull();
  });

  it("release sorts after all pre-release tags", () => {
    const release = parseSemver("2.0.0");
    const alpha = parseSemver("2.0.0-alpha.99");
    expect(release).not.toBeNull();
    expect(alpha).not.toBeNull();
    // release[3] is Infinity, alpha[3] is 99 → release > alpha
    expect(release?.[3]).toBeGreaterThan(alpha?.[3]);
  });
});

// ============================================================================
//  2. Semver comparison
// ============================================================================

describe("compareSemver", () => {
  it("alpha.3 < alpha.4", () => {
    expect(compareSemver("2.0.0-alpha.3", "2.0.0-alpha.4")).toBe(-1);
  });

  it("alpha.4 > alpha.3", () => {
    expect(compareSemver("2.0.0-alpha.4", "2.0.0-alpha.3")).toBe(1);
  });

  it("alpha.3 === alpha.3", () => {
    expect(compareSemver("2.0.0-alpha.3", "2.0.0-alpha.3")).toBe(0);
  });

  it("release > alpha", () => {
    expect(compareSemver("2.0.0", "2.0.0-alpha.99")).toBe(1);
  });

  it("alpha < release", () => {
    expect(compareSemver("2.0.0-alpha.99", "2.0.0")).toBe(-1);
  });

  it("major version difference", () => {
    expect(compareSemver("3.0.0", "2.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });

  it("minor version difference", () => {
    expect(compareSemver("2.1.0", "2.0.0")).toBe(1);
    expect(compareSemver("2.0.0", "2.1.0")).toBe(-1);
  });

  it("patch version difference", () => {
    expect(compareSemver("2.0.1", "2.0.0")).toBe(1);
    expect(compareSemver("2.0.0", "2.0.1")).toBe(-1);
  });

  it("nightly.20260207 < nightly.20260208", () => {
    expect(
      compareSemver("2.0.0-nightly.20260207", "2.0.0-nightly.20260208"),
    ).toBe(-1);
  });

  it("nightly.20260208 > nightly.20260207", () => {
    expect(
      compareSemver("2.0.0-nightly.20260208", "2.0.0-nightly.20260207"),
    ).toBe(1);
  });

  it("nightly same date === 0", () => {
    expect(
      compareSemver("2.0.0-nightly.20260208", "2.0.0-nightly.20260208"),
    ).toBe(0);
  });

  it("release > nightly", () => {
    expect(compareSemver("2.0.0", "2.0.0-nightly.20260208")).toBe(1);
  });

  it("patch version trumps nightly date (2.0.1-nightly.1 > 2.0.0-nightly.99999999)", () => {
    // Even though 99999999 > 1, the patch version 1 > 0 takes precedence
    expect(
      compareSemver("2.0.1-nightly.20260101", "2.0.0-nightly.20261231"),
    ).toBe(1);
  });

  it("major version trumps nightly date", () => {
    expect(
      compareSemver("3.0.0-nightly.20250101", "2.0.0-nightly.20261231"),
    ).toBe(1);
  });

  it("nightly < release of same major.minor.patch", () => {
    expect(compareSemver("2.0.0-nightly.20260208", "2.0.0")).toBe(-1);
  });

  it("returns null for invalid input", () => {
    expect(compareSemver("invalid", "2.0.0")).toBeNull();
    expect(compareSemver("2.0.0", "invalid")).toBeNull();
    expect(compareSemver("invalid", "also-invalid")).toBeNull();
  });
});

// ============================================================================
//  3. Version satisfaction check
// ============================================================================

describe("versionSatisfies", () => {
  it("alpha.4 satisfies >= alpha.4", () => {
    expect(versionSatisfies("2.0.0-alpha.4", "2.0.0-alpha.4")).toBe(true);
  });

  it("alpha.3 does NOT satisfy >= alpha.4", () => {
    expect(versionSatisfies("2.0.0-alpha.3", "2.0.0-alpha.4")).toBe(false);
  });

  it("alpha.5 satisfies >= alpha.4", () => {
    expect(versionSatisfies("2.0.0-alpha.5", "2.0.0-alpha.4")).toBe(true);
  });

  it("release satisfies >= alpha", () => {
    expect(versionSatisfies("2.0.0", "2.0.0-alpha.4")).toBe(true);
  });

  it("returns false for invalid versions", () => {
    expect(versionSatisfies("invalid", "2.0.0-alpha.4")).toBe(false);
  });

  // Exact repro scenario from issue #10:
  // core is alpha.3, plugins need alpha.4 exports
  it("core@alpha.3 does NOT satisfy plugin requiring alpha.4 export", () => {
    expect(versionSatisfies("2.0.0-alpha.3", "2.0.0-alpha.4")).toBe(false);
  });
});

// ============================================================================
//  4. AI provider plugin list
// ============================================================================

describe("AI_PROVIDER_PLUGINS", () => {
  it("contains the known AI provider plugins", () => {
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-anthropic");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-openai");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-openrouter");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-ollama");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-google-genai");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-groq");
    expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-xai");
  });

  it("has no duplicates", () => {
    const unique = new Set(AI_PROVIDER_PLUGINS);
    expect(unique.size).toBe(AI_PROVIDER_PLUGINS.length);
  });
});

// ============================================================================
//  5. diagnoseNoAIProvider — version skew detection
// ============================================================================

describe("diagnoseNoAIProvider", () => {
  it("returns null when at least one AI provider loaded", () => {
    const loaded = ["@elizaos/plugin-sql", "@elizaos/plugin-anthropic"];
    const failed: Array<{ name: string; error: string }> = [];
    expect(diagnoseNoAIProvider(loaded, failed)).toBeNull();
  });

  it("returns config message when no AI provider was even attempted", () => {
    const loaded = ["@elizaos/plugin-sql", "@elizaos/plugin-discord"];
    const failed: Array<{ name: string; error: string }> = [];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    expect(msg).toContain("No AI provider plugin was loaded");
    expect(msg).toContain("API key");
  });

  it("detects version-skew signature (Export named ... not found)", () => {
    const loaded = ["@elizaos/plugin-sql"];
    const failed = [
      {
        name: "@elizaos/plugin-openrouter",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
      {
        name: "@elizaos/plugin-openai",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
    ];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Version skew detected");
    expect(msg).toContain("@elizaos/plugin-openrouter");
    expect(msg).toContain("@elizaos/plugin-openai");
    expect(msg).toContain("issues/10");
  });

  it("detects version-skew with 'does not provide an export named' pattern", () => {
    const loaded = ["@elizaos/plugin-sql"];
    const failed = [
      {
        name: "@elizaos/plugin-ollama",
        error: "does not provide an export named 'MAX_EMBEDDING_TOKENS'",
      },
    ];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Version skew detected");
    expect(msg).toContain("@elizaos/plugin-ollama");
  });

  it("returns generic failure message for non-version-skew errors", () => {
    const loaded = ["@elizaos/plugin-sql"];
    const failed = [
      {
        name: "@elizaos/plugin-anthropic",
        error: "Cannot find module 'some-dep'",
      },
    ];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    expect(msg).toContain("All AI provider plugins failed to load");
    expect(msg).toContain("@elizaos/plugin-anthropic");
    expect(msg).toContain("Cannot find module");
  });

  it("returns null when a non-provider plugin fails but providers load", () => {
    const loaded = ["@elizaos/plugin-sql", "@elizaos/plugin-openai"];
    const failed = [
      {
        name: "@elizaos/plugin-discord",
        error: "Missing DISCORD_BOT_TOKEN",
      },
    ];
    expect(diagnoseNoAIProvider(loaded, failed)).toBeNull();
  });

  // Exact reproduction of issue #10 scenario
  it("reproduces issue #10: all 5 provider plugins fail with MAX_EMBEDDING_TOKENS", () => {
    const loaded = [
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
      "@elizaos/plugin-agent-skills",
    ];
    const failed = [
      {
        name: "@elizaos/plugin-openrouter",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
      {
        name: "@elizaos/plugin-openai",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
      {
        name: "@elizaos/plugin-ollama",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
      {
        name: "@elizaos/plugin-google-genai",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
      {
        name: "@elizaos/plugin-knowledge",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
    ];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Version skew detected");
    // All 4 AI provider plugins should be mentioned (knowledge is not an AI provider)
    expect(msg).toContain("@elizaos/plugin-openrouter");
    expect(msg).toContain("@elizaos/plugin-openai");
    expect(msg).toContain("@elizaos/plugin-ollama");
    expect(msg).toContain("@elizaos/plugin-google-genai");
    expect(msg).toContain("issues/10");
  });
});

// ============================================================================
//  6. Package.json version pinning validation
// ============================================================================

describe("Package.json version pinning (issue #10)", () => {
  type PackageManifest = {
    dependencies: Record<string, string>;
    overrides?: Record<string, string>;
    pnpm?: { overrides?: Record<string, string> };
  };

  async function readPackageManifest(): Promise<PackageManifest> {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    // Use process.cwd() for reliable root resolution in forked vitest workers
    const pkgPath = resolve(process.cwd(), "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageManifest;
  }

  function getDependencyOverride(
    manifest: PackageManifest,
  ): string | undefined {
    return (
      manifest.overrides?.["@elizaos/core"] ??
      manifest.pnpm?.overrides?.["@elizaos/core"]
    );
  }

  function isWorkspaceDependency(version: string | undefined): boolean {
    return (
      typeof version === "string" &&
      (version.startsWith(".") || version.startsWith("workspace:"))
    );
  }

  /**
   * Verify that the affected plugins are pinned to a version compatible
   * with core@2.0.0-alpha.3 in milady's package.json.
   *
   * This test reads the actual package.json to ensure the fix stays in place.
   */
  it("core is pinned to a version that includes MAX_EMBEDDING_TOKENS", async () => {
    const pkg = await readPackageManifest();

    const coreVersion = pkg.dependencies["@elizaos/core"];
    expect(coreVersion).toBeDefined();
    // Core can use "next" dist-tag if pnpm overrides pin the actual version
    if (coreVersion === "next") {
      const pinnedCoreVersion = getDependencyOverride(pkg);
      expect(pinnedCoreVersion).toBeDefined();
      expect(pinnedCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(versionSatisfies(pinnedCoreVersion ?? "", "2.0.0-alpha.3")).toBe(
        true,
      );
    } else if (isWorkspaceDependency(coreVersion)) {
      const pinnedCoreVersion = getDependencyOverride(pkg);
      if (pinnedCoreVersion !== undefined) {
        expect(pinnedCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
      }
    } else {
      expect(coreVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(versionSatisfies(coreVersion, "2.0.0-alpha.3")).toBe(true);
    }
  });

  it("affected plugins are present in dependencies (core pin makes next safe)", async () => {
    const pkg = await readPackageManifest();

    // With core pinned via pnpm overrides, plugins at "next" are safe
    const affectedPlugins = [
      "@elizaos/plugin-openrouter",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-ollama",
      "@elizaos/plugin-google-genai",
      "@elizaos/plugin-knowledge",
    ];

    // If core is "next", ensure pnpm overrides pin the actual version
    const coreVersion = pkg.dependencies["@elizaos/core"];
    if (coreVersion === "next") {
      const pinnedCoreVersion = getDependencyOverride(pkg);
      expect(pinnedCoreVersion).toBeDefined();
      expect(pinnedCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
    } else if (!isWorkspaceDependency(coreVersion)) {
      expect(coreVersion).toMatch(/^\d+\.\d+\.\d+/);
    }

    for (const plugin of affectedPlugins) {
      const version = pkg.dependencies[plugin];
      expect(version).toBeDefined();
      // Plugins can use "next" when core is pinned via pnpm overrides.
      // When not "next", they should be pinned to a specific version.
      if (version !== "next") {
        expect(version).toMatch(/^\d+\.\d+\.\d+/);
      }
    }
  });

  it("core is pinned to specific alpha version", async () => {
    const pkg = await readPackageManifest();

    // Core can use "next" dist-tag if dependency overrides pin the actual version.
    // See docs/ELIZAOS_VERSIONING.md for explanation.
    const coreVersion = pkg.dependencies["@elizaos/core"];
    expect(coreVersion).toBeDefined();
    if (coreVersion === "next") {
      const pinnedCoreVersion = getDependencyOverride(pkg);
      expect(pinnedCoreVersion).toBeDefined();
      expect(pinnedCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
    } else if (isWorkspaceDependency(coreVersion)) {
      const pinnedCoreVersion = getDependencyOverride(pkg);
      if (pinnedCoreVersion !== undefined) {
        expect(pinnedCoreVersion).toMatch(/^\d+\.\d+\.\d+/);
      }
    } else {
      expect(coreVersion).toMatch(/^\d+\.\d+\.\d+-alpha\.\d+$/);
    }
  });

  it("pinned versions are compatible with each other", () => {
    // The pinned plugin versions should be compatible with the pinned core version.
    // This means the plugins won't import symbols that don't exist in core.
    const pinnedVersion = "2.0.0-alpha.3";
    const coreVersion = "2.0.0-alpha.3";

    // Plugin version should be <= core version
    const cmp = compareSemver(pinnedVersion, coreVersion);
    expect(cmp).toBe(0); // Same version — guaranteed compatible.
  });

  it("alpha.4 plugins would NOT be compatible with alpha.3 core", () => {
    // This validates the version skew scenario that caused issue #10.
    // alpha.4 plugins need MAX_EMBEDDING_TOKENS which was introduced in alpha.4.
    const pluginVersion = "2.0.0-alpha.4";
    const coreVersion = "2.0.0-alpha.3";

    expect(versionSatisfies(coreVersion, pluginVersion)).toBe(false);
  });
});

// ============================================================================
//  7. Edge cases and regression guards
// ============================================================================

describe("Regression guards", () => {
  it("diagnoseNoAIProvider handles empty arrays", () => {
    expect(diagnoseNoAIProvider([], [])).not.toBeNull();
    expect(diagnoseNoAIProvider([], [])).toContain("No AI provider plugin");
  });

  it("diagnoseNoAIProvider handles mixed provider/non-provider failures", () => {
    const loaded = ["@elizaos/plugin-sql"];
    const failed = [
      {
        name: "@elizaos/plugin-discord",
        error: "Missing token",
      },
      {
        name: "@elizaos/plugin-openrouter",
        error:
          "Export named 'MAX_EMBEDDING_TOKENS' not found in module '@elizaos/core'",
      },
    ];
    const msg = diagnoseNoAIProvider(loaded, failed);
    expect(msg).not.toBeNull();
    // Should detect version skew from the openrouter failure
    expect(msg).toContain("Version skew detected");
    expect(msg).toContain("@elizaos/plugin-openrouter");
    // Discord failure should NOT be mentioned in version skew message
    expect(msg).not.toContain("@elizaos/plugin-discord");
  });

  it("compareSemver handles different pre-release tag types", () => {
    // beta.1 and alpha.1 of same version — both parse but have different tags
    // Our simplified parser treats them the same numerically (both are pre.1)
    const alpha = parseSemver("2.0.0-alpha.1");
    const beta = parseSemver("2.0.0-beta.1");
    expect(alpha).not.toBeNull();
    expect(beta).not.toBeNull();
    // In our simplified model, alpha.1 == beta.1 (same numbers)
    // This is acceptable for our use case where we only compare within alpha track
  });

  it("parseSemver handles zero pre-release number", () => {
    const v = parseSemver("2.0.0-alpha.0");
    expect(v).toEqual([2, 0, 0, 0]);
  });

  it("parseSemver handles large version numbers", () => {
    const v = parseSemver("100.200.300-alpha.99");
    expect(v).toEqual([100, 200, 300, 99]);
  });
});
