import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveBaseUrls, runSmokeApiStatus } from "./smoke-api-status.mjs";

describe("smoke-api-status script", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns exit code 0 when all origins pass", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ state: "running" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const code = await runSmokeApiStatus({
      argv: ["https://milady.ai", "https://app.milady.ai"],
      fetchImpl,
      log: (line: string) => logs.push(line),
      error: (line: string) => errors.push(line),
    });

    expect(code).toBe(0);
    expect(errors).toHaveLength(0);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("OK");
    expect(logs[1]).toContain("OK");
  });

  it("returns exit code 1 when any origin returns 404", async () => {
    const errors: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("milady.ai/api/status")) {
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ state: "running" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const code = await runSmokeApiStatus({
      argv: ["https://milady.ai", "https://app.milady.ai"],
      fetchImpl,
      error: (line: string) => errors.push(line),
      log: () => {},
    });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("HTTP 404");
  });

  it("returns exit code 1 on timeout", async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = runSmokeApiStatus({
      argv: ["https://app.milady.ai"],
      fetchImpl,
      timeoutMs: 50,
      error: (line: string) => errors.push(line),
      log: () => {},
    });
    await vi.advanceTimersByTimeAsync(51);

    const code = await pending;
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("timed out after 50ms");
  });

  it("returns exit code 1 for non-JSON status payloads", async () => {
    const errors: string[] = [];
    const fetchImpl = vi.fn(
      async () =>
        new Response("<html>ok</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );

    const code = await runSmokeApiStatus({
      argv: ["https://app.milady.ai"],
      fetchImpl,
      error: (line: string) => errors.push(line),
      log: () => {},
    });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain(
      "responded without expected status payload",
    );
  });

  it("parses comma-separated env origins and legacy fallback", () => {
    const resolved = resolveBaseUrls([], {
      MILADY_DEPLOY_BASE_URLS: "https://milady.ai, https://app.milady.ai",
      MILADY_DEPLOY_BASE_URL: "https://legacy.milady.ai",
    } as NodeJS.ProcessEnv);

    expect(resolved).toEqual([
      "https://milady.ai",
      "https://app.milady.ai",
      "https://legacy.milady.ai",
    ]);
  });
});
