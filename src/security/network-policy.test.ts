/**
 * Unit tests for security/network-policy.ts — IP normalization, IPv6 mapping,
 * private/loopback detection, and SSRF blocking.
 *
 * These functions are used by the registry endpoint validator to prevent
 * Server-Side Request Forgery (SSRF) attacks.
 */

import { describe, expect, it } from "vitest";
import {
  decodeIpv6MappedHex,
  isBlockedPrivateOrLinkLocalIp,
  isLoopbackHost,
  normalizeHostLike,
  normalizeIpForPolicy,
} from "./network-policy";

// ═════════════════════════════════════════════════════════════════════════
describe("network-policy", () => {
  // ── normalizeHostLike ─────────────────────────────────────────────
  describe("normalizeHostLike", () => {
    it("trims whitespace", () => {
      expect(normalizeHostLike("  example.com  ")).toBe("example.com");
    });

    it("lowercases hostname", () => {
      expect(normalizeHostLike("Example.COM")).toBe("example.com");
    });

    it("strips IPv6 brackets", () => {
      expect(normalizeHostLike("[::1]")).toBe("::1");
    });

    it("handles empty string", () => {
      expect(normalizeHostLike("")).toBe("");
    });
  });

  // ── decodeIpv6MappedHex ──────────────────────────────────────────
  describe("decodeIpv6MappedHex", () => {
    it("decodes single hex part to IPv4", () => {
      // 0x7f01 => 127.1 => "0.0.127.1"
      expect(decodeIpv6MappedHex("7f01")).toBe("0.0.127.1");
    });

    it("decodes two-part hex to IPv4", () => {
      // 0xc0a8:0x0101 => 192.168.1.1
      expect(decodeIpv6MappedHex("c0a8:0101")).toBe("192.168.1.1");
    });

    it("returns null for too many parts", () => {
      expect(decodeIpv6MappedHex("aa:bb:cc")).toBeNull();
    });

    it("returns null for invalid hex", () => {
      expect(decodeIpv6MappedHex("zzzz")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(decodeIpv6MappedHex("")).toBeNull();
    });
  });

  // ── normalizeIpForPolicy ─────────────────────────────────────────
  describe("normalizeIpForPolicy", () => {
    it("normalizes regular IPv4", () => {
      expect(normalizeIpForPolicy("192.168.1.1")).toBe("192.168.1.1");
    });

    it("strips zone ID from IPv6", () => {
      expect(normalizeIpForPolicy("fe80::1%eth0")).toBe("fe80::1");
    });

    it("converts IPv4-mapped IPv6 to IPv4", () => {
      expect(normalizeIpForPolicy("::ffff:127.0.0.1")).toBe("127.0.0.1");
    });

    it("handles bracketed IPv6", () => {
      const result = normalizeIpForPolicy("[::1]");
      expect(result).toBe("::1");
    });

    it("lowercases and trims", () => {
      expect(normalizeIpForPolicy("  10.0.0.1  ")).toBe("10.0.0.1");
    });
  });

  // ── isBlockedPrivateOrLinkLocalIp ─────────────────────────────────
  describe("isBlockedPrivateOrLinkLocalIp", () => {
    // ── Should block ─────────────────────────────────────────
    it("blocks 127.0.0.1 (loopback)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("127.0.0.1")).toBe(true);
    });

    it("blocks 10.0.0.1 (RFC1918)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("10.0.0.1")).toBe(true);
    });

    it("blocks 172.16.0.1 (RFC1918)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("172.16.0.1")).toBe(true);
    });

    it("blocks 192.168.1.1 (RFC1918)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("192.168.1.1")).toBe(true);
    });

    it("blocks 169.254.169.254 (AWS metadata endpoint)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("169.254.169.254")).toBe(true);
    });

    it("blocks 0.0.0.0 (this network)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("0.0.0.0")).toBe(true);
    });

    it("blocks ::1 (IPv6 loopback)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("::1")).toBe(true);
    });

    it("blocks :: (unspecified)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("::")).toBe(true);
    });

    it("blocks fe80:: (IPv6 link-local)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("fe80::1")).toBe(true);
    });

    it("blocks fd00:: (IPv6 ULA)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("fd00::1")).toBe(true);
    });

    it("blocks IPv4-mapped IPv6 private address", () => {
      expect(isBlockedPrivateOrLinkLocalIp("::ffff:192.168.1.1")).toBe(true);
    });

    // ── Should allow ─────────────────────────────────────────
    it("allows public IPv4 (8.8.8.8)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("8.8.8.8")).toBe(false);
    });

    it("allows public IPv4 (1.1.1.1)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("1.1.1.1")).toBe(false);
    });

    it("allows 172.32.0.1 (outside RFC1918 range)", () => {
      expect(isBlockedPrivateOrLinkLocalIp("172.32.0.1")).toBe(false);
    });
  });

  // ── isLoopbackHost ───────────────────────────────────────────────
  describe("isLoopbackHost", () => {
    it("detects localhost", () => {
      expect(isLoopbackHost("localhost")).toBe(true);
    });

    it("detects 127.0.0.1", () => {
      expect(isLoopbackHost("127.0.0.1")).toBe(true);
    });

    it("detects 127.0.0.2 (127.x range)", () => {
      expect(isLoopbackHost("127.0.0.2")).toBe(true);
    });

    it("detects ::1 (IPv6 loopback)", () => {
      expect(isLoopbackHost("::1")).toBe(true);
    });

    it("rejects public IP", () => {
      expect(isLoopbackHost("8.8.8.8")).toBe(false);
    });

    it("rejects private IP (not loopback)", () => {
      expect(isLoopbackHost("192.168.1.1")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isLoopbackHost("")).toBe(false);
    });
  });
});
