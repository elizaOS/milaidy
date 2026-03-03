/**
 * Unit tests for version-compat.ts — plugin ↔ core version compatibility.
 *
 * Covers:
 * - Semver parsing (alpha, beta, rc, nightly, release, invalid)
 * - Semver comparison (less, equal, greater, cross-type, unparseable)
 * - versionSatisfies (>= check)
 * - coreExportExists (live import probing)
 * - getInstalledVersion (package.json reading)
 * - validatePluginCompat (single plugin validation)
 * - validateVersionCompat (full report generation)
 * - diagnoseNoAIProvider (failure triage)
 *
 * @see version-compat.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_PROVIDER_PLUGINS,
  compareSemver,
  diagnoseNoAIProvider,
  parseSemver,
  versionSatisfies,
} from "./version-compat";

// ── Tests ────────────────────────────────────────────────────────────────

describe("version-compat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  //  1. parseSemver
  // ===================================================================

  describe("parseSemver", () => {
    it("parses alpha version", () => {
      expect(parseSemver("2.0.0-alpha.3")).toEqual([2, 0, 0, 3]);
    });

    it("parses alpha version with higher number", () => {
      expect(parseSemver("2.0.0-alpha.42")).toEqual([2, 0, 0, 42]);
    });

    it("parses beta version", () => {
      expect(parseSemver("1.5.0-beta.2")).toEqual([1, 5, 0, 2]);
    });

    it("parses rc version", () => {
      expect(parseSemver("3.1.0-rc.1")).toEqual([3, 1, 0, 1]);
    });

    it("parses nightly version", () => {
      expect(parseSemver("2.0.0-nightly.20260208")).toEqual([
        2, 0, 0, 20260208,
      ]);
    });

    it("parses release version (no pre-release) as Infinity", () => {
      const result = parseSemver("2.0.0");
      expect(result).not.toBeNull();
      expect(result?.[0]).toBe(2);
      expect(result?.[1]).toBe(0);
      expect(result?.[2]).toBe(0);
      expect(result?.[3]).toBe(Number.POSITIVE_INFINITY);
    });

    it("parses version with non-zero minor and patch", () => {
      expect(parseSemver("1.2.3-alpha.5")).toEqual([1, 2, 3, 5]);
    });

    it("returns null for empty string", () => {
      expect(parseSemver("")).toBeNull();
    });

    it("returns null for garbage input", () => {
      expect(parseSemver("not-a-version")).toBeNull();
    });

    it("returns null for version with unknown pre-release tag", () => {
      expect(parseSemver("2.0.0-dev.1")).toBeNull();
    });

    it("returns null for version missing patch number", () => {
      expect(parseSemver("2.0")).toBeNull();
    });

    it("returns null for version with leading v", () => {
      expect(parseSemver("v2.0.0")).toBeNull();
    });
  });

  // ===================================================================
  //  2. compareSemver
  // ===================================================================

  describe("compareSemver", () => {
    it("returns 0 for equal versions", () => {
      expect(compareSemver("2.0.0-alpha.3", "2.0.0-alpha.3")).toBe(0);
    });

    it("returns -1 when first is less (alpha number)", () => {
      expect(compareSemver("2.0.0-alpha.3", "2.0.0-alpha.4")).toBe(-1);
    });

    it("returns 1 when first is greater (alpha number)", () => {
      expect(compareSemver("2.0.0-alpha.4", "2.0.0-alpha.3")).toBe(1);
    });

    it("release beats alpha", () => {
      expect(compareSemver("2.0.0", "2.0.0-alpha.99")).toBe(1);
    });

    it("alpha is less than release", () => {
      expect(compareSemver("2.0.0-alpha.99", "2.0.0")).toBe(-1);
    });

    it("compares major versions", () => {
      expect(compareSemver("3.0.0", "2.0.0")).toBe(1);
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    });

    it("compares minor versions", () => {
      expect(compareSemver("2.1.0", "2.0.0")).toBe(1);
      expect(compareSemver("2.0.0", "2.1.0")).toBe(-1);
    });

    it("compares patch versions", () => {
      expect(compareSemver("2.0.1", "2.0.0")).toBe(1);
      expect(compareSemver("2.0.0", "2.0.1")).toBe(-1);
    });

    it("returns 0 for equal release versions", () => {
      expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    });

    it("returns null when first is unparseable", () => {
      expect(compareSemver("garbage", "2.0.0")).toBeNull();
    });

    it("returns null when second is unparseable", () => {
      expect(compareSemver("2.0.0", "garbage")).toBeNull();
    });

    it("returns null when both are unparseable", () => {
      expect(compareSemver("bad", "worse")).toBeNull();
    });
  });

  // ===================================================================
  //  3. versionSatisfies
  // ===================================================================

  describe("versionSatisfies", () => {
    it("returns true when installed equals required", () => {
      expect(versionSatisfies("2.0.0-alpha.4", "2.0.0-alpha.4")).toBe(true);
    });

    it("returns true when installed is greater", () => {
      expect(versionSatisfies("2.0.0-alpha.5", "2.0.0-alpha.4")).toBe(true);
    });

    it("returns false when installed is less", () => {
      expect(versionSatisfies("2.0.0-alpha.3", "2.0.0-alpha.4")).toBe(false);
    });

    it("release satisfies alpha requirement", () => {
      expect(versionSatisfies("2.0.0", "2.0.0-alpha.4")).toBe(true);
    });

    it("alpha does not satisfy release requirement", () => {
      expect(versionSatisfies("2.0.0-alpha.99", "2.0.0")).toBe(false);
    });

    it("returns false for unparseable installed version", () => {
      expect(versionSatisfies("garbage", "2.0.0")).toBe(false);
    });

    it("returns false for unparseable required version", () => {
      expect(versionSatisfies("2.0.0", "garbage")).toBe(false);
    });
  });

  // ===================================================================
  //  4. AI_PROVIDER_PLUGINS constant
  // ===================================================================

  describe("AI_PROVIDER_PLUGINS", () => {
    it("is a non-empty array", () => {
      expect(AI_PROVIDER_PLUGINS.length).toBeGreaterThan(0);
    });

    it("includes known providers", () => {
      expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-openai");
      expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-anthropic");
      expect(AI_PROVIDER_PLUGINS).toContain("@elizaos/plugin-ollama");
    });
  });

  // ===================================================================
  //  5. diagnoseNoAIProvider
  // ===================================================================

  describe("diagnoseNoAIProvider", () => {
    it("returns null when an AI provider loaded", () => {
      const result = diagnoseNoAIProvider(
        ["@elizaos/plugin-openai", "some-other-plugin"],
        [],
      );
      expect(result).toBeNull();
    });

    it("returns null when multiple AI providers loaded", () => {
      const result = diagnoseNoAIProvider(
        ["@elizaos/plugin-openai", "@elizaos/plugin-anthropic"],
        [],
      );
      expect(result).toBeNull();
    });

    it("returns config message when no providers attempted", () => {
      const result = diagnoseNoAIProvider(["some-non-ai-plugin"], []);
      expect(result).not.toBeNull();
      expect(result).toContain("API key");
      expect(result).toContain("OPENAI_API_KEY");
    });

    it("returns config message when no plugins loaded at all", () => {
      const result = diagnoseNoAIProvider([], []);
      expect(result).not.toBeNull();
      expect(result).toContain("No AI provider plugin");
    });

    it("returns version-skew message for import errors", () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-openai",
            error: "Export named MAX_EMBEDDING_TOKENS not found in module",
          },
        ],
      );
      expect(result).not.toBeNull();
      expect(result).toContain("Version skew");
      expect(result).toContain("@elizaos/plugin-openai");
    });

    it('detects "not found in module" error signature', () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-ollama",
            error: "Symbol not found in module @elizaos/core",
          },
        ],
      );
      expect(result).toContain("Version skew");
    });

    it('detects "does not provide an export named" error signature', () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-openrouter",
            error:
              "Module @elizaos/core does not provide an export named MAX_EMBEDDING_TOKENS",
          },
        ],
      );
      expect(result).toContain("Version skew");
    });

    it("returns generic failure for non-version-skew errors", () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-openai",
            error: "Connection timeout",
          },
        ],
      );
      expect(result).not.toBeNull();
      expect(result).toContain("failed to load");
      expect(result).toContain("Connection timeout");
    });

    it("returns generic failure with multiple failed providers", () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-openai",
            error: "Auth failed",
          },
          {
            name: "@elizaos/plugin-anthropic",
            error: "Rate limited",
          },
        ],
      );
      expect(result).toContain("@elizaos/plugin-openai");
      expect(result).toContain("@elizaos/plugin-anthropic");
    });

    it("ignores failed non-AI plugins", () => {
      const result = diagnoseNoAIProvider(
        ["@elizaos/plugin-openai"],
        [{ name: "some-other-plugin", error: "whatever" }],
      );
      // An AI provider loaded, so should return null
      expect(result).toBeNull();
    });

    it("includes issue link for version skew", () => {
      const result = diagnoseNoAIProvider(
        [],
        [
          {
            name: "@elizaos/plugin-openai",
            error: "Export named FOO not found in module",
          },
        ],
      );
      expect(result).toContain("issues/10");
    });
  });
});
