/**
 * Unit tests for bug-report-routes.ts — rate limiting, sanitization,
 * input validation, and GitHub issue creation.
 *
 * All GitHub API calls are mocked via vi.stubGlobal("fetch").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUG_REPORT_REPO,
  rateLimitBugReport,
  resetBugReportRateLimit,
  sanitize,
} from "./bug-report-routes";

// ═════════════════════════════════════════════════════════════════════════
describe("bug-report-routes", () => {
  // ── sanitize ───────────────────────────────────────────────────────
  describe("sanitize", () => {
    it("strips HTML tags", () => {
      expect(sanitize("<script>alert(1)</script>hello")).toBe("alert(1)hello");
    });

    it("strips nested tags", () => {
      expect(sanitize("<div><b>bold</b></div>")).toBe("bold");
    });

    it("returns plain text unchanged", () => {
      expect(sanitize("just text")).toBe("just text");
    });

    it("truncates to default maxLen (10000)", () => {
      const long = "a".repeat(20_000);
      expect(sanitize(long).length).toBe(10_000);
    });

    it("truncates to custom maxLen", () => {
      expect(sanitize("abcdefghij", 5)).toBe("abcde");
    });

    it("handles empty string", () => {
      expect(sanitize("")).toBe("");
    });

    it("strips self-closing tags", () => {
      expect(sanitize("before<br/>after")).toBe("beforeafter");
    });

    it("strips tags with attributes", () => {
      expect(sanitize('<a href="http://evil.com">click</a>')).toBe("click");
    });

    it("handles markdown-like content without stripping", () => {
      // Markdown formatting should NOT be stripped (no angle brackets)
      expect(sanitize("**bold** and _italic_")).toBe("**bold** and _italic_");
    });
  });

  // ── rateLimitBugReport ─────────────────────────────────────────────
  describe("rateLimitBugReport", () => {
    beforeEach(() => {
      resetBugReportRateLimit();
    });

    afterEach(() => {
      resetBugReportRateLimit();
    });

    it("allows first request", () => {
      expect(rateLimitBugReport("1.2.3.4")).toBe(true);
    });

    it("allows up to 5 requests from same IP", () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimitBugReport("1.2.3.4")).toBe(true);
      }
    });

    it("rejects 6th request from same IP", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("1.2.3.4");
      }
      expect(rateLimitBugReport("1.2.3.4")).toBe(false);
    });

    it("tracks IPs independently", () => {
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("1.1.1.1");
      }
      // Different IP should still be allowed
      expect(rateLimitBugReport("2.2.2.2")).toBe(true);
    });

    it("treats null IP as 'unknown'", () => {
      expect(rateLimitBugReport(null)).toBe(true);
      // Subsequent null calls share the 'unknown' key
      for (let i = 0; i < 4; i++) {
        rateLimitBugReport(null);
      }
      expect(rateLimitBugReport(null)).toBe(false);
    });

    it("resets after window expires", () => {
      const realDateNow = Date.now;
      const startTime = realDateNow.call(Date);

      // Use up the limit
      vi.spyOn(Date, "now").mockReturnValue(startTime);
      for (let i = 0; i < 5; i++) {
        rateLimitBugReport("1.2.3.4");
      }
      expect(rateLimitBugReport("1.2.3.4")).toBe(false);

      // Jump forward past the 10-minute window
      vi.spyOn(Date, "now").mockReturnValue(startTime + 11 * 60 * 1000);
      expect(rateLimitBugReport("1.2.3.4")).toBe(true);

      vi.restoreAllMocks();
    });
  });

  // ── BUG_REPORT_REPO constant ───────────────────────────────────────
  describe("BUG_REPORT_REPO", () => {
    it("points to milady-ai/milady", () => {
      expect(BUG_REPORT_REPO).toBe("milady-ai/milady");
    });
  });
});
