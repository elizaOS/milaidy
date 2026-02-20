import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BugReportRouteContext,
  handleBugReportRoutes,
  sanitize,
} from "../bug-report-routes";

// --- helpers ----------------------------------------------------------------

function makeCtx(
  overrides: Partial<BugReportRouteContext> & {
    method: string;
    pathname: string;
  },
): BugReportRouteContext {
  return {
    req: {} as http.IncomingMessage,
    res: {} as http.ServerResponse,
    json: vi.fn(),
    error: vi.fn(),
    readJsonBody: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// --- sanitize ---------------------------------------------------------------

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize('<img onerror="alert(1)">hello')).toBe("hello");
  });

  it("caps length", () => {
    expect(sanitize("abcdef", 3)).toBe("abc");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("strips nested tags", () => {
    expect(sanitize("<div><script>alert(1)</script></div>")).toBe("alert(1)");
  });
});

// --- GET /api/bug-report/info -----------------------------------------------

describe("GET /api/bug-report/info", () => {
  it("returns nodeVersion and platform", async () => {
    const ctx = makeCtx({ method: "GET", pathname: "/api/bug-report/info" });
    const handled = await handleBugReportRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({
        nodeVersion: expect.stringMatching(/^v\d+/),
        platform: expect.any(String),
      }),
    );
  });

  it("does not expose github token presence", async () => {
    const ctx = makeCtx({ method: "GET", pathname: "/api/bug-report/info" });
    await handleBugReportRoutes(ctx);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).not.toHaveProperty("github");
  });
});

// --- POST /api/bug-report ---------------------------------------------------

describe("POST /api/bug-report", () => {
  const validBody = {
    description: "App crashes on startup",
    stepsToReproduce: "1. Open app\n2. Click start",
  };

  it("rejects missing required fields", async () => {
    const ctx = makeCtx({
      method: "POST",
      pathname: "/api/bug-report",
      readJsonBody: vi
        .fn()
        .mockResolvedValue({ description: "", stepsToReproduce: "" }),
    });
    const handled = await handleBugReportRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "description and stepsToReproduce are required",
      400,
    );
  });

  it("rejects when readJsonBody returns null (bad JSON)", async () => {
    const ctx = makeCtx({
      method: "POST",
      pathname: "/api/bug-report",
      readJsonBody: vi.fn().mockResolvedValue(null),
    });
    const handled = await handleBugReportRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).not.toHaveBeenCalled();
    expect(ctx.error).not.toHaveBeenCalled(); // readJsonBody already sent error
  });

  describe("without GITHUB_TOKEN", () => {
    beforeEach(() => {
      delete process.env.GITHUB_TOKEN;
    });

    it("returns fallback URL", async () => {
      const ctx = makeCtx({
        method: "POST",
        pathname: "/api/bug-report",
        readJsonBody: vi.fn().mockResolvedValue(validBody),
      });
      const handled = await handleBugReportRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.json).toHaveBeenCalledWith(ctx.res, {
        fallback: expect.stringContaining("github.com/milady-ai/milady"),
      });
    });
  });

  describe("with GITHUB_TOKEN", () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = "ghp_test123";
    });
    afterEach(() => {
      delete process.env.GITHUB_TOKEN;
      vi.restoreAllMocks();
    });

    it("creates GitHub issue and returns URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html_url: "https://github.com/milady-ai/milady/issues/42",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const ctx = makeCtx({
        method: "POST",
        pathname: "/api/bug-report",
        readJsonBody: vi.fn().mockResolvedValue(validBody),
      });
      const handled = await handleBugReportRoutes(ctx);
      expect(handled).toBe(true);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.github.com/repos/milady-ai/milady/issues");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.title).toContain("[Bug]");
      expect(body.labels).toEqual(["bug", "triage", "user-reported"]);

      expect(ctx.json).toHaveBeenCalledWith(ctx.res, {
        url: "https://github.com/milady-ai/milady/issues/42",
      });
    });

    it("returns 502 on GitHub API failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          text: () => Promise.resolve("Validation Failed"),
        }),
      );

      const ctx = makeCtx({
        method: "POST",
        pathname: "/api/bug-report",
        readJsonBody: vi.fn().mockResolvedValue(validBody),
      });
      await handleBugReportRoutes(ctx);
      expect(ctx.error).toHaveBeenCalledWith(
        ctx.res,
        expect.stringContaining("GitHub API error (422)"),
        502,
      );
    });

    it("sanitizes HTML in description for title", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ html_url: "https://example.com/1" }),
        }),
      );

      const ctx = makeCtx({
        method: "POST",
        pathname: "/api/bug-report",
        readJsonBody: vi.fn().mockResolvedValue({
          description: '<script>alert("xss")</script>Bug here',
          stepsToReproduce: "steps",
        }),
      });
      await handleBugReportRoutes(ctx);

      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.title).not.toContain("<script>");
      expect(body.title).toContain("Bug here");
    });

    it("skips oversized screenshots", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ html_url: "https://example.com/1" }),
        }),
      );

      const bigScreenshot = `data:image/jpeg;base64,${"A".repeat(2_000_000)}`;
      const ctx = makeCtx({
        method: "POST",
        pathname: "/api/bug-report",
        readJsonBody: vi.fn().mockResolvedValue({
          ...validBody,
          screenshot: bigScreenshot,
        }),
      });
      await handleBugReportRoutes(ctx);

      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.body).not.toContain("screenshot");
    });
  });

  it("does not handle unrelated routes", async () => {
    const ctx = makeCtx({ method: "GET", pathname: "/api/status" });
    const handled = await handleBugReportRoutes(ctx);
    expect(handled).toBe(false);
  });
});
