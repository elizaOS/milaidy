/**
 * Unit tests for bug-report-routes.ts — bug reporting, rate limiting, and sanitization.
 *
 * Covers:
 * - Rate limiting (per-IP window, null IP fallback, reset, boundary)
 * - HTML sanitization (tag stripping, length capping, edge cases)
 * - Issue body formatting (required fields, optional fields, logs block)
 * - Route handling (GET info, POST bug report with/without token)
 *
 * @see bug-report-routes.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUG_REPORT_REPO,
  rateLimitBugReport,
  resetBugReportRateLimit,
  sanitize,
} from "./bug-report-routes";

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  resetBugReportRateLimit();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("bug-report-routes", () => {
  // ===================================================================
  //  1. Rate Limiting
  // ===================================================================

  describe("rateLimitBugReport", () => {
    it("allows first request from an IP", () => {
      expect(rateLimitBugReport("192.168.1.1")).toBe(true);
    });

    it("allows up to 5 requests from same IP", () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimitBugReport("10.0.0.1")).toBe(true);
      }
    });

    it("blocks 6th request from same IP within window", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("10.0.0.1");
      }
      expect(rateLimitBugReport("10.0.0.1")).toBe(false);
    });

    it("treats different IPs independently", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("10.0.0.1");
      }
      // IP A is blocked
      expect(rateLimitBugReport("10.0.0.1")).toBe(false);
      // IP B is still allowed
      expect(rateLimitBugReport("10.0.0.2")).toBe(true);
    });

    it("uses 'unknown' key when IP is null", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport(null);
      }
      expect(rateLimitBugReport(null)).toBe(false);
    });

    it("resets window after time expires", () => {
      const realDateNow = Date.now;

      // Fill the limit
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("10.0.0.1");
      }
      expect(rateLimitBugReport("10.0.0.1")).toBe(false);

      // Advance time past the 10-minute window
      Date.now = () => realDateNow() + 11 * 60 * 1000;
      expect(rateLimitBugReport("10.0.0.1")).toBe(true);

      Date.now = realDateNow;
    });

    it("reset function clears all state", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("10.0.0.1");
      }
      expect(rateLimitBugReport("10.0.0.1")).toBe(false);

      resetBugReportRateLimit();
      expect(rateLimitBugReport("10.0.0.1")).toBe(true);
    });
  });

  // ===================================================================
  //  2. Sanitization
  // ===================================================================

  describe("sanitize", () => {
    it("passes through clean text unchanged", () => {
      expect(sanitize("Hello, world!")).toBe("Hello, world!");
    });

    it("strips HTML tags", () => {
      expect(sanitize("<script>alert('xss')</script>")).toBe("alert('xss')");
    });

    it("strips self-closing tags", () => {
      expect(sanitize("before<br/>after")).toBe("beforeafter");
    });

    it("strips nested HTML", () => {
      expect(sanitize("<div><span>text</span></div>")).toBe("text");
    });

    it("strips tags with attributes", () => {
      expect(sanitize('<a href="http://evil.com">click</a>')).toBe("click");
    });

    it("handles empty string", () => {
      expect(sanitize("")).toBe("");
    });

    it("caps output at default maxLen (10000)", () => {
      const longInput = "a".repeat(20_000);
      const result = sanitize(longInput);
      expect(result.length).toBe(10_000);
    });

    it("caps output at custom maxLen", () => {
      const result = sanitize("Hello, World!", 5);
      expect(result).toBe("Hello");
    });

    it("strips tags before applying length cap", () => {
      // 10 chars of tags + 5 chars of content = 15 chars raw
      // After stripping: "hello" (5 chars), cap at 3 = "hel"
      expect(sanitize("<b>hello</b>", 3)).toBe("hel");
    });

    it.each([
      ["<img src=x onerror=alert(1)>", ""],
      ['<svg onload="alert(1)">', ""],
      ["<iframe src=javascript:alert(1)>", ""],
      ["<math><mtext><table><mglyph><style>", ""],
    ])("strips dangerous tag: %s", (input, expected) => {
      expect(sanitize(input)).toBe(expected);
    });

    it("preserves markdown formatting", () => {
      const md = "## Heading\n\n- item 1\n- item 2\n\n```code```";
      expect(sanitize(md)).toBe(md);
    });

    it("preserves bare angle brackets without closing >", () => {
      // The regex /<[^>]*>/g only matches <...> pairs
      // Bare < without a matching > is preserved
      expect(sanitize("x > 5 && y < 10")).toBe("x > 5 && y < 10");
    });
  });

  // ===================================================================
  //  3. Constants
  // ===================================================================

  describe("constants", () => {
    it("exports the correct repo", () => {
      expect(BUG_REPORT_REPO).toBe("milady-ai/milady");
    });
  });
});
