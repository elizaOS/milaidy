import { afterEach, describe, expect, it } from "vitest";
import { ensureApiTokenForBind, isLoopbackBindAddress } from "./server.js";

describe("api auth token enforcement", () => {
  const originalToken = process.env.MILAIDY_API_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.MILAIDY_API_TOKEN;
    } else {
      process.env.MILAIDY_API_TOKEN = originalToken;
    }
  });

  it("detects loopback bind addresses", () => {
    expect(isLoopbackBindAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackBindAddress("::1")).toBe(true);
    expect(isLoopbackBindAddress("localhost")).toBe(true);
    expect(isLoopbackBindAddress("0.0.0.0")).toBe(false);
    expect(isLoopbackBindAddress("::")).toBe(false);
  });

  it("generates a token when non-loopback bind has no token", () => {
    delete process.env.MILAIDY_API_TOKEN;

    const result = ensureApiTokenForBind("0.0.0.0");

    expect(result.generated).toBe(true);
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(process.env.MILAIDY_API_TOKEN).toBe(result.token ?? undefined);
  });

  it("does not override an existing token", () => {
    process.env.MILAIDY_API_TOKEN = "existing-token";

    const result = ensureApiTokenForBind("0.0.0.0");

    expect(result.generated).toBe(false);
    expect(result.token).toBe("existing-token");
    expect(process.env.MILAIDY_API_TOKEN).toBe("existing-token");
  });

  it("does not generate a token for loopback bind", () => {
    delete process.env.MILAIDY_API_TOKEN;

    const result = ensureApiTokenForBind("127.0.0.1");

    expect(result.generated).toBe(false);
    expect(result.token).toBeNull();
    expect(process.env.MILAIDY_API_TOKEN).toBeUndefined();
  });
});
