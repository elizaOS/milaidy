/**
 * Unit tests for registry-client-endpoints.ts — URL parsing, SSRF protection,
 * and endpoint normalization.
 *
 * parseRegistryEndpointUrl is security-critical: it blocks localhost, private
 * IPs, and non-HTTPS protocols to prevent SSRF attacks via custom registry
 * endpoints.
 */

import { describe, expect, it, vi } from "vitest";
import {
  isDefaultEndpoint,
  normaliseEndpointUrl,
  parseRegistryEndpointUrl,
} from "./registry-client-endpoints.js";

// Suppress logger calls
vi.mock("@elizaos/core", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ═════════════════════════════════════════════════════════════════════════
describe("registry-client-endpoints", () => {
  // ── normaliseEndpointUrl ──────────────────────────────────────────
  describe("normaliseEndpointUrl", () => {
    it("strips trailing slashes", () => {
      expect(normaliseEndpointUrl("https://example.com/")).toBe(
        "https://example.com",
      );
    });

    it("strips multiple trailing slashes", () => {
      expect(normaliseEndpointUrl("https://example.com///")).toBe(
        "https://example.com",
      );
    });

    it("preserves URL without trailing slash", () => {
      expect(normaliseEndpointUrl("https://example.com")).toBe(
        "https://example.com",
      );
    });

    it("preserves path components", () => {
      expect(normaliseEndpointUrl("https://example.com/api/v1/")).toBe(
        "https://example.com/api/v1",
      );
    });
  });

  // ── isDefaultEndpoint ────────────────────────────────────────────
  describe("isDefaultEndpoint", () => {
    const defaultUrl =
      "https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json";

    it("returns true for exact match", () => {
      expect(isDefaultEndpoint(defaultUrl, defaultUrl)).toBe(true);
    });

    it("returns true with trailing slash variation", () => {
      expect(isDefaultEndpoint(`${defaultUrl}/`, defaultUrl)).toBe(true);
    });

    it("returns false for different URL", () => {
      expect(
        isDefaultEndpoint("https://custom.com/registry.json", defaultUrl),
      ).toBe(false);
    });
  });

  // ── parseRegistryEndpointUrl ─────────────────────────────────────
  describe("parseRegistryEndpointUrl", () => {
    // ── Valid URLs ────────────────────────────────────────────
    it("accepts valid HTTPS URL", () => {
      const url = parseRegistryEndpointUrl("https://registry.example.com/api");
      expect(url.hostname).toBe("registry.example.com");
    });

    it("returns a URL object", () => {
      const url = parseRegistryEndpointUrl("https://registry.example.com");
      expect(url).toBeInstanceOf(URL);
    });

    // ── Protocol enforcement ─────────────────────────────────
    it("rejects HTTP (non-HTTPS)", () => {
      expect(() =>
        parseRegistryEndpointUrl("http://registry.example.com"),
      ).toThrow("https://");
    });

    it("rejects FTP", () => {
      expect(() =>
        parseRegistryEndpointUrl("ftp://registry.example.com"),
      ).toThrow("https://");
    });

    it("rejects file:// protocol", () => {
      expect(() => parseRegistryEndpointUrl("file:///etc/passwd")).toThrow(
        "https://",
      );
    });

    // ── Invalid URLs ─────────────────────────────────────────
    it("rejects malformed URL", () => {
      expect(() => parseRegistryEndpointUrl("not a url")).toThrow(
        "valid absolute URL",
      );
    });

    // ── Localhost blocking ────────────────────────────────────
    it("blocks localhost", () => {
      expect(() => parseRegistryEndpointUrl("https://localhost/api")).toThrow(
        "blocked",
      );
    });

    it("blocks 127.0.0.1", () => {
      expect(() => parseRegistryEndpointUrl("https://127.0.0.1/api")).toThrow(
        "blocked",
      );
    });

    it("blocks ::1", () => {
      expect(() => parseRegistryEndpointUrl("https://[::1]/api")).toThrow(
        "blocked",
      );
    });

    it("blocks 0.0.0.0", () => {
      expect(() => parseRegistryEndpointUrl("https://0.0.0.0/api")).toThrow(
        "blocked",
      );
    });

    // ── AWS metadata endpoint (SSRF target) ──────────────────
    it("blocks AWS metadata IP 169.254.169.254", () => {
      expect(() =>
        parseRegistryEndpointUrl("https://169.254.169.254/latest"),
      ).toThrow("blocked");
    });

    // ── .localhost / .local domains ───────────────────────────
    it("blocks .localhost subdomain", () => {
      expect(() =>
        parseRegistryEndpointUrl("https://evil.localhost/api"),
      ).toThrow("blocked");
    });

    it("blocks .local domain", () => {
      expect(() =>
        parseRegistryEndpointUrl("https://printer.local/api"),
      ).toThrow("blocked");
    });
  });
});
