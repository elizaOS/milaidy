import { describe, expect, it, vi } from "vitest";

import {
  createApiBaseInjectionScript,
  createApiBaseInjector,
  normalizeApiBase,
  resolveExternalApiBase,
} from "../../electron/src/api-base";

describe("normalizeApiBase", () => {
  it("accepts http/https URLs and returns origin", () => {
    expect(normalizeApiBase("https://example.com/api/v1")).toBe(
      "https://example.com",
    );
    expect(normalizeApiBase("http://127.0.0.1:2138/path")).toBe(
      "http://127.0.0.1:2138",
    );
  });

  it("rejects non-http protocols", () => {
    expect(normalizeApiBase("ws://localhost:2138")).toBeNull();
    expect(normalizeApiBase("file:///tmp/test")).toBeNull();
  });
});

describe("resolveExternalApiBase", () => {
  it("prefers the test override when provided", () => {
    const resolved = resolveExternalApiBase({
      MILADY_API_BASE_URL: "https://api.prod.milady.ai",
      MILADY_ELECTRON_TEST_API_BASE: "http://127.0.0.1:9999",
    });

    expect(resolved.base).toBe("http://127.0.0.1:9999");
    expect(resolved.source).toBe("MILADY_ELECTRON_TEST_API_BASE");
    expect(resolved.invalidSources).toEqual([]);
  });

  it("skips invalid higher-priority values and keeps searching", () => {
    const resolved = resolveExternalApiBase({
      MILADY_API_BASE_URL: "not a url",
      MILADY_API_BASE: "http://127.0.0.1:31337",
    });

    expect(resolved.base).toBe("http://127.0.0.1:31337");
    expect(resolved.source).toBe("MILADY_API_BASE");
    expect(resolved.invalidSources).toEqual(["MILADY_API_BASE_URL"]);
  });
});

describe("createApiBaseInjector", () => {
  it("retries the same base after an early executeJavaScript failure", async () => {
    const executeJavaScript = vi
      .fn<(script: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce(undefined);

    const injector = createApiBaseInjector(
      {
        isDestroyed: () => false,
        executeJavaScript,
      },
      {
        getApiToken: () => "  desktop-token  ",
      },
    );

    await expect(injector.inject("http://localhost:31337")).resolves.toBe(
      false,
    );
    await expect(injector.inject("http://localhost:31337")).resolves.toBe(true);

    expect(executeJavaScript).toHaveBeenCalledTimes(2);
    expect(injector.getLastInjectedBase()).toBe("http://localhost:31337");
  });

  it("reinjects the same base on subsequent calls (renderer reload safe)", async () => {
    const executeJavaScript = vi
      .fn<(script: string) => Promise<unknown>>()
      .mockResolvedValue(undefined);

    const injector = createApiBaseInjector({
      isDestroyed: () => false,
      executeJavaScript,
    });

    await injector.inject("http://localhost:2138");
    await injector.inject("http://localhost:2138");

    expect(executeJavaScript).toHaveBeenCalledTimes(2);
  });

  it("no-ops when the target window is destroyed", async () => {
    const executeJavaScript = vi
      .fn<(script: string) => Promise<unknown>>()
      .mockResolvedValue(undefined);

    const injector = createApiBaseInjector({
      isDestroyed: () => true,
      executeJavaScript,
    });

    await expect(injector.inject("http://localhost:2138")).resolves.toBe(false);
    expect(executeJavaScript).not.toHaveBeenCalled();
  });
});

describe("createApiBaseInjectionScript", () => {
  it("embeds base and optional token globals", () => {
    const withToken = createApiBaseInjectionScript(
      "http://localhost:2138",
      "  abc123  ",
    );
    expect(withToken).toContain(
      'window.__MILADY_API_BASE__ = "http://localhost:2138";',
    );
    expect(withToken).toContain('window.__MILADY_API_TOKEN__ = "abc123";');

    const withoutToken = createApiBaseInjectionScript("http://localhost:2138");
    expect(withoutToken).not.toContain("__MILADY_API_TOKEN__");
  });
});
