import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetCloudSecretStoreForTests,
  getCloudSecret,
  isStoreNonEnumerable,
  scrubCloudKeyFromEnv,
} from "../cloud-secret-store";

const KEY = "ELIZAOS_CLOUD_API_KEY";

describe("cloud secret scrubbing — process.env leak prevention", () => {
  let prevValue: string | undefined;

  beforeEach(() => {
    prevValue = process.env[KEY];
    delete process.env[KEY];
    __resetCloudSecretStoreForTests();
  });

  afterEach(() => {
    if (prevValue === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = prevValue;
    }
    __resetCloudSecretStoreForTests();
  });

  it("scrubs ELIZAOS_CLOUD_API_KEY from process.env after login", () => {
    // Simulate what cloud-routes does on login:
    process.env[KEY] = "cloud-secret-abc";

    scrubCloudKeyFromEnv();

    expect(process.env[KEY]).toBeUndefined();
    expect(getCloudSecret()).toBe("cloud-secret-abc");
  });

  it("scrubs ELIZAOS_CLOUD_API_KEY from process.env after disconnect", () => {
    // Login → scrub
    process.env[KEY] = "cloud-secret-abc";
    scrubCloudKeyFromEnv();

    // Disconnect: upstream deletes process.env[KEY] and we scrub again
    delete process.env[KEY];
    scrubCloudKeyFromEnv();

    expect(process.env[KEY]).toBeUndefined();
    // The stored value from login should still be accessible (it was
    // stored before upstream deleted it; on disconnect the scrub is
    // defensive — the key may already be gone from process.env).
    expect(getCloudSecret()).toBe("cloud-secret-abc");
  });

  it("getCloudSecret() returns the correct value after login", () => {
    process.env[KEY] = "test-key-123";
    scrubCloudKeyFromEnv();

    expect(getCloudSecret()).toBe("test-key-123");
  });

  it("falls back to process.env for Docker entrypoints", () => {
    // When a Docker entrypoint sets the key before the module loads,
    // getCloudSecret should still find it via process.env fallback.
    process.env[KEY] = "docker-provided-key";

    // No scrub has happened — simulates first access before any request.
    expect(getCloudSecret()).toBe("docker-provided-key");
  });

  it("sealed store is non-enumerable (not visible via Object.keys)", () => {
    process.env[KEY] = "invisible-key";
    scrubCloudKeyFromEnv();

    expect(isStoreNonEnumerable()).toBe(true);
  });
});
