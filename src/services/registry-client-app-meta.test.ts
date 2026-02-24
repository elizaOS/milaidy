/**
 * Unit tests for registry-client-app-meta.ts — sandbox token sanitization,
 * viewer normalization, app meta merging, and app override resolution.
 *
 * sanitizeSandbox is security-critical: it validates iframe sandbox tokens
 * to prevent XSS via allow-top-navigation or other dangerous directives.
 */

import { describe, expect, it, vi } from "vitest";
import type { RegistryAppMeta } from "./registry-client.js";
import {
  LOCAL_APP_DEFAULT_SANDBOX,
  mergeAppMeta,
  resolveAppOverride,
  sanitizeSandbox,
} from "./registry-client-app-meta.js";

// Suppress logger.warn from sanitizeSandbox
vi.mock("@elizaos/core", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ═════════════════════════════════════════════════════════════════════════
describe("registry-client-app-meta", () => {
  // ── LOCAL_APP_DEFAULT_SANDBOX ─────────────────────────────────────
  describe("LOCAL_APP_DEFAULT_SANDBOX", () => {
    it("contains allow-scripts, allow-same-origin, allow-popups", () => {
      expect(LOCAL_APP_DEFAULT_SANDBOX).toContain("allow-scripts");
      expect(LOCAL_APP_DEFAULT_SANDBOX).toContain("allow-same-origin");
      expect(LOCAL_APP_DEFAULT_SANDBOX).toContain("allow-popups");
    });
  });

  // ── sanitizeSandbox ──────────────────────────────────────────────
  describe("sanitizeSandbox", () => {
    it("returns default for undefined input", () => {
      expect(sanitizeSandbox(undefined)).toBe(LOCAL_APP_DEFAULT_SANDBOX);
    });

    it("returns default for empty string", () => {
      expect(sanitizeSandbox("")).toBe(LOCAL_APP_DEFAULT_SANDBOX);
    });

    it("returns default for whitespace-only", () => {
      expect(sanitizeSandbox("   ")).toBe(LOCAL_APP_DEFAULT_SANDBOX);
    });

    it("accepts valid sandbox tokens", () => {
      const valid = "allow-scripts allow-forms";
      expect(sanitizeSandbox(valid)).toBe(valid);
    });

    it("deduplicates tokens", () => {
      expect(sanitizeSandbox("allow-scripts allow-scripts")).toBe(
        "allow-scripts",
      );
    });

    it("rejects unknown tokens and falls back to default", () => {
      expect(sanitizeSandbox("allow-scripts allow-evil-token")).toBe(
        LOCAL_APP_DEFAULT_SANDBOX,
      );
    });

    it("rejects allow-top-navigation (dangerous)", () => {
      expect(sanitizeSandbox("allow-scripts allow-top-navigation")).toBe(
        LOCAL_APP_DEFAULT_SANDBOX,
      );
    });

    it("accepts all valid tokens from the allowlist", () => {
      const all = [
        "allow-downloads",
        "allow-forms",
        "allow-modals",
        "allow-orientation-lock",
        "allow-pointer-lock",
        "allow-popups",
        "allow-popups-to-escape-sandbox",
        "allow-presentation",
        "allow-same-origin",
        "allow-scripts",
        "allow-storage-access-by-user-activation",
        "allow-top-navigation-by-user-activation",
      ];
      const result = sanitizeSandbox(all.join(" "));
      for (const token of all) {
        expect(result).toContain(token);
      }
    });
  });

  // ── mergeAppMeta ─────────────────────────────────────────────────
  describe("mergeAppMeta", () => {
    const baseMeta: RegistryAppMeta = {
      displayName: "Base App",
      category: "game",
      launchType: "url",
      launchUrl: "http://localhost:3000",
      icon: "base-icon.png",
      capabilities: ["audio"],
      minPlayers: 1,
      maxPlayers: 4,
    };

    it("returns undefined when both are undefined", () => {
      expect(mergeAppMeta(undefined, undefined)).toBeUndefined();
    });

    it("returns patch when base is undefined", () => {
      expect(mergeAppMeta(undefined, baseMeta)).toBe(baseMeta);
    });

    it("returns base when patch is undefined", () => {
      expect(mergeAppMeta(baseMeta, undefined)).toBe(baseMeta);
    });

    it("merges patch over base", () => {
      const patch: RegistryAppMeta = {
        ...baseMeta,
        displayName: "Patched",
        capabilities: ["video"],
      };
      const result = mergeAppMeta(baseMeta, patch);
      expect(result?.displayName).toBe("Patched");
    });

    it("keeps base capabilities when patch has empty array", () => {
      const patch: RegistryAppMeta = {
        ...baseMeta,
        capabilities: [],
      };
      const result = mergeAppMeta(baseMeta, patch);
      expect(result?.capabilities).toEqual(["audio"]);
    });

    it("uses patch capabilities when non-empty", () => {
      const patch: RegistryAppMeta = {
        ...baseMeta,
        capabilities: ["video", "audio"],
      };
      const result = mergeAppMeta(baseMeta, patch);
      expect(result?.capabilities).toEqual(["video", "audio"]);
    });

    it("merges viewer embed params", () => {
      const base: RegistryAppMeta = {
        ...baseMeta,
        viewer: {
          url: "http://example.com",
          embedParams: { mode: "play" },
          sandbox: "allow-scripts",
        },
      };
      const patch: RegistryAppMeta = {
        ...baseMeta,
        viewer: {
          url: "http://patched.com",
          embedParams: { quality: "high" },
          sandbox: "allow-scripts",
        },
      };
      const result = mergeAppMeta(base, patch);
      expect(result?.viewer?.url).toBe("http://patched.com");
      expect(result?.viewer?.embedParams).toEqual({
        mode: "play",
        quality: "high",
      });
    });
  });

  // ── resolveAppOverride ───────────────────────────────────────────
  describe("resolveAppOverride", () => {
    it("returns appMeta unchanged for unknown packages", () => {
      const meta: RegistryAppMeta = {
        displayName: "My App",
        category: "tool",
        launchType: "url",
        launchUrl: null,
        icon: null,
        capabilities: [],
        minPlayers: null,
        maxPlayers: null,
      };
      expect(resolveAppOverride("@unknown/package", meta)).toBe(meta);
    });

    it("returns undefined for unknown package with no meta", () => {
      expect(resolveAppOverride("@unknown/package", undefined)).toBeUndefined();
    });

    it("applies override for known package @elizaos/app-babylon", () => {
      const result = resolveAppOverride("@elizaos/app-babylon", undefined);
      expect(result).toBeDefined();
      expect(result?.launchType).toBe("url");
      expect(result?.launchUrl).toBe("http://localhost:3000");
    });

    it("applies override for @elizaos/app-hyperscape (connect type)", () => {
      const result = resolveAppOverride("@elizaos/app-hyperscape", undefined);
      expect(result).toBeDefined();
      expect(result?.launchType).toBe("connect");
      expect(result?.viewer?.postMessageAuth).toBe(true);
    });

    it("merges override with existing metadata", () => {
      const existing: RegistryAppMeta = {
        displayName: "Custom Name",
        category: "tool",
        launchType: "iframe",
        launchUrl: "http://custom.com",
        icon: "custom-icon.png",
        capabilities: ["networking"],
        minPlayers: null,
        maxPlayers: null,
      };
      const result = resolveAppOverride("@elizaos/app-babylon", existing);
      // Override should override launchType
      expect(result?.launchType).toBe("url");
      // But display name from override or kept from existing
      expect(result?.icon).toBe("custom-icon.png");
    });
  });
});
