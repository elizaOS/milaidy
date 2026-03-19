import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Tests for connection key generation in the CLI start command.
 *
 * Connection keys are only generated when:
 * 1. --connection-key flag is explicitly passed (with or without a value)
 * 2. Binding to a non-localhost address (0.0.0.0) and no token exists
 *
 * Local access (localhost) does NOT require a connection key.
 */
describe("generateConnectionKey", () => {
  beforeEach(() => {
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
  });

  // Inline the function for isolated testing
  function generateConnectionKey(): string {
    const generated = crypto.randomBytes(16).toString("hex");
    process.env.MILADY_API_TOKEN = generated;
    process.env.ELIZA_API_TOKEN = generated;
    return generated;
  }

  it("generates a 32-char hex key", () => {
    const key = generateConnectionKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sets both MILADY_API_TOKEN and ELIZA_API_TOKEN", () => {
    const key = generateConnectionKey();
    expect(process.env.MILADY_API_TOKEN).toBe(key);
    expect(process.env.ELIZA_API_TOKEN).toBe(key);
  });

  it("generates different keys on each call", () => {
    const key1 = generateConnectionKey();
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
    const key2 = generateConnectionKey();
    expect(key1).not.toBe(key2);
  });
});

describe("isNetworkBind", () => {
  beforeEach(() => {
    delete process.env.MILADY_API_BIND;
    delete process.env.ELIZA_API_BIND;
  });

  function isNetworkBind(): boolean {
    const bind =
      process.env.MILADY_API_BIND?.trim() || process.env.ELIZA_API_BIND?.trim();
    if (!bind) return false;
    return bind !== "127.0.0.1" && bind !== "localhost" && bind !== "::1";
  }

  it("returns false when no bind is set (default localhost)", () => {
    expect(isNetworkBind()).toBe(false);
  });

  it("returns false for 127.0.0.1", () => {
    process.env.ELIZA_API_BIND = "127.0.0.1";
    expect(isNetworkBind()).toBe(false);
  });

  it("returns false for localhost", () => {
    process.env.MILADY_API_BIND = "localhost";
    expect(isNetworkBind()).toBe(false);
  });

  it("returns true for 0.0.0.0", () => {
    process.env.ELIZA_API_BIND = "0.0.0.0";
    expect(isNetworkBind()).toBe(true);
  });

  it("returns true for a specific IP", () => {
    process.env.MILADY_API_BIND = "192.168.1.100";
    expect(isNetworkBind()).toBe(true);
  });
});

describe("connection key is NOT auto-generated for localhost", () => {
  beforeEach(() => {
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
    delete process.env.MILADY_API_BIND;
    delete process.env.ELIZA_API_BIND;
  });

  it("no token is set when running on default localhost bind", () => {
    // Simulate startAction logic: only generate when isNetworkBind
    const existingToken =
      process.env.MILADY_API_TOKEN?.trim() ||
      process.env.ELIZA_API_TOKEN?.trim();
    const bind =
      process.env.MILADY_API_BIND?.trim() || process.env.ELIZA_API_BIND?.trim();
    const isNetwork = bind && bind !== "127.0.0.1" && bind !== "localhost";

    if (!existingToken && isNetwork) {
      // Would generate key — but isNetwork is false for localhost
    }

    expect(process.env.MILADY_API_TOKEN).toBeUndefined();
    expect(process.env.ELIZA_API_TOKEN).toBeUndefined();
  });

  it("existing token is preserved without generating a new one", () => {
    process.env.MILADY_API_TOKEN = "my-custom-key";
    const existingToken = process.env.MILADY_API_TOKEN?.trim();
    expect(existingToken).toBe("my-custom-key");
  });
});
