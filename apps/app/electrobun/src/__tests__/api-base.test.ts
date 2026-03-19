import { describe, expect, it } from "vitest";
import {
  normalizeApiBase,
  resolveDesktopRuntimeMode,
  resolveExternalApiBase,
  resolveInitialApiBase,
} from "../api-base";

describe("normalizeApiBase", () => {
  it("returns null for undefined input", () => {
    expect(normalizeApiBase(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeApiBase("")).toBeNull();
  });

  it("returns origin for valid http URL", () => {
    expect(normalizeApiBase("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns origin for valid https URL", () => {
    expect(normalizeApiBase("https://api.milady.ai")).toBe(
      "https://api.milady.ai",
    );
  });

  it("strips trailing path from URL", () => {
    expect(normalizeApiBase("https://api.milady.ai/v1/")).toBe(
      "https://api.milady.ai",
    );
  });

  it("strips trailing slash from URL with port", () => {
    expect(normalizeApiBase("http://localhost:2138/")).toBe(
      "http://localhost:2138",
    );
  });

  it("returns null for non-http protocol (ftp)", () => {
    expect(normalizeApiBase("ftp://example.com")).toBeNull();
  });

  it("returns null for non-http protocol (file)", () => {
    expect(normalizeApiBase("file:///etc/passwd")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(normalizeApiBase("not a url")).toBeNull();
  });

  it("returns null for URL with only protocol", () => {
    expect(normalizeApiBase("http://")).toBeNull();
  });

  it("handles URL with authentication info", () => {
    // URL constructor parses this but origin strips auth
    expect(normalizeApiBase("https://user:pass@api.milady.ai")).toBe(
      "https://api.milady.ai",
    );
  });
});

describe("resolveExternalApiBase", () => {
  it("returns null base when no env vars are set", () => {
    const result = resolveExternalApiBase({});
    expect(result).toEqual({
      base: null,
      source: null,
      invalidSources: [],
    });
  });

  it("resolves MILADY_DESKTOP_TEST_API_BASE first (highest priority)", () => {
    const result = resolveExternalApiBase({
      MILADY_DESKTOP_TEST_API_BASE: "http://localhost:9999",
      MILADY_API_BASE_URL: "http://localhost:8888",
    });
    expect(result.base).toBe("http://localhost:9999");
    expect(result.source).toBe("MILADY_DESKTOP_TEST_API_BASE");
    expect(result.invalidSources).toEqual([]);
  });

  it("falls through to MILADY_DESKTOP_API_BASE when test var missing", () => {
    const result = resolveExternalApiBase({
      MILADY_DESKTOP_API_BASE: "https://api.milady.ai",
    });
    expect(result.base).toBe("https://api.milady.ai");
    expect(result.source).toBe("MILADY_DESKTOP_API_BASE");
  });

  it("falls through to MILADY_API_BASE_URL", () => {
    const result = resolveExternalApiBase({
      MILADY_API_BASE_URL: "https://prod.milady.ai",
    });
    expect(result.base).toBe("https://prod.milady.ai");
    expect(result.source).toBe("MILADY_API_BASE_URL");
  });

  it("falls through to MILADY_API_BASE (lowest priority)", () => {
    const result = resolveExternalApiBase({
      MILADY_API_BASE: "http://localhost:2138",
    });
    expect(result.base).toBe("http://localhost:2138");
    expect(result.source).toBe("MILADY_API_BASE");
  });

  it("skips invalid URLs and records them in invalidSources", () => {
    const result = resolveExternalApiBase({
      MILADY_DESKTOP_TEST_API_BASE: "not-a-url",
      MILADY_DESKTOP_API_BASE: "ftp://bad-protocol.com",
      MILADY_API_BASE_URL: "https://valid.milady.ai",
    });
    expect(result.base).toBe("https://valid.milady.ai");
    expect(result.source).toBe("MILADY_API_BASE_URL");
    expect(result.invalidSources).toEqual([
      "MILADY_DESKTOP_TEST_API_BASE",
      "MILADY_DESKTOP_API_BASE",
    ]);
  });

  it("returns null when all env vars are invalid", () => {
    const result = resolveExternalApiBase({
      MILADY_DESKTOP_TEST_API_BASE: "garbage",
      MILADY_API_BASE: "ftp://nope",
    });
    expect(result.base).toBeNull();
    expect(result.source).toBeNull();
    expect(result.invalidSources).toEqual([
      "MILADY_DESKTOP_TEST_API_BASE",
      "MILADY_API_BASE",
    ]);
  });

  it("ignores empty string env vars", () => {
    const result = resolveExternalApiBase({
      MILADY_DESKTOP_TEST_API_BASE: "",
      MILADY_API_BASE: "http://localhost:2138",
    });
    expect(result.base).toBe("http://localhost:2138");
    expect(result.source).toBe("MILADY_API_BASE");
    expect(result.invalidSources).toEqual([]);
  });

  it("trims whitespace from env var values", () => {
    const result = resolveExternalApiBase({
      MILADY_API_BASE: "  http://localhost:2138  ",
    });
    expect(result.base).toBe("http://localhost:2138");
  });
});

describe("resolveDesktopRuntimeMode", () => {
  it("uses external mode when an external API base is configured", () => {
    const result = resolveDesktopRuntimeMode({
      MILADY_DESKTOP_API_BASE: "https://api.milady.ai",
      MILADY_DESKTOP_SKIP_EMBEDDED_AGENT: "1",
    });

    expect(result.mode).toBe("external");
    expect(result.externalApi.base).toBe("https://api.milady.ai");
    expect(result.externalApi.source).toBe("MILADY_DESKTOP_API_BASE");
  });

  it("uses disabled mode when embedded startup is explicitly skipped", () => {
    const result = resolveDesktopRuntimeMode({
      MILADY_DESKTOP_SKIP_EMBEDDED_AGENT: "true",
    });

    expect(result.mode).toBe("disabled");
    expect(result.externalApi.base).toBeNull();
  });

  it("defaults to local mode when no external base or skip flag is set", () => {
    const result = resolveDesktopRuntimeMode({});

    expect(result.mode).toBe("local");
    expect(result.externalApi.base).toBeNull();
  });
});

describe("resolveInitialApiBase", () => {
  it("returns the external API base in external mode", () => {
    expect(
      resolveInitialApiBase({
        MILADY_DESKTOP_API_BASE: "https://api.milady.ai/v1",
      }),
    ).toBe("https://api.milady.ai");
  });

  it("returns the local port in local mode", () => {
    expect(resolveInitialApiBase({ MILADY_PORT: "4242" })).toBe(
      "http://127.0.0.1:4242",
    );
  });

  it("keeps the local API base in disabled mode for manually managed runtimes", () => {
    expect(
      resolveInitialApiBase({
        MILADY_DESKTOP_SKIP_EMBEDDED_AGENT: "1",
        MILADY_PORT: "5151",
      }),
    ).toBe("http://127.0.0.1:5151");
  });
});
