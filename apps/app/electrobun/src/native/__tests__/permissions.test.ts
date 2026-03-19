/**
 * Regression tests for PermissionManager cache behaviour.
 *
 * The original bug: a cached PermissionState with `status: "denied"` could be
 * bypassed because the old code separated `isCacheValid()` from `getFromCache()`,
 * creating a window where a cache entry existed but was not returned. The fix
 * unified the check into `getFromCache()` which returns the cached object (truthy
 * for ANY status, including "denied") or `null` when absent/expired.
 *
 * These tests verify the fixed behaviour:
 *  1. "denied" results are served from cache on subsequent calls.
 *  2. "granted" results are served from cache on subsequent calls.
 *  3. `clearCache()` forces a fresh platform query.
 *  4. Expired cache entries trigger a fresh platform query.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the three platform modules BEFORE importing the module under test.
// ---------------------------------------------------------------------------

vi.mock("../permissions-darwin", () => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  openPrivacySettings: vi.fn(),
}));

vi.mock("../permissions-win32", () => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  openPrivacySettings: vi.fn(),
}));

vi.mock("../permissions-linux", () => ({
  checkPermission: vi.fn(),
  requestPermission: vi.fn(),
  openPrivacySettings: vi.fn(),
}));

// Import the class under test (uses the mocked platform modules).
import { PermissionManager } from "../permissions";
// Import the mocked modules so we can configure return values per-test.
import * as darwin from "../permissions-darwin";
import * as linux from "../permissions-linux";
import * as win32 from "../permissions-win32";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the mocked `checkPermission` for the current `process.platform`. */
function platformCheckMock(): ReturnType<typeof vi.fn> {
  switch (process.platform) {
    case "darwin":
      return darwin.checkPermission as ReturnType<typeof vi.fn>;
    case "win32":
      return win32.checkPermission as ReturnType<typeof vi.fn>;
    case "linux":
      return linux.checkPermission as ReturnType<typeof vi.fn>;
    default:
      return darwin.checkPermission as ReturnType<typeof vi.fn>;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionManager cache", () => {
  let manager: PermissionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    manager = new PermissionManager();

    // Default: every platform mock resolves to "granted" for microphone.
    // Individual tests override as needed.
    const grantedResult = { status: "granted" as const, canRequest: true };
    (darwin.checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue(
      grantedResult,
    );
    (win32.checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue(
      grantedResult,
    );
    (linux.checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue(
      grantedResult,
    );
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. "denied" results must be cached and returned without re-querying
  // -----------------------------------------------------------------------

  it("returns cached 'denied' result without re-checking the platform", async () => {
    const mock = platformCheckMock();
    mock.mockResolvedValueOnce({ status: "denied", canRequest: true });

    // First call: hits the platform.
    const first = await manager.checkPermission("microphone");
    expect(first.status).toBe("denied");
    expect(mock).toHaveBeenCalledTimes(1);

    // Second call: should come from cache, NOT the platform.
    const second = await manager.checkPermission("microphone");
    expect(second.status).toBe("denied");
    expect(mock).toHaveBeenCalledTimes(1); // still 1 -- no second call
  });

  // -----------------------------------------------------------------------
  // 2. "granted" results must be cached and returned without re-querying
  // -----------------------------------------------------------------------

  it("returns cached 'granted' result without re-checking the platform", async () => {
    const mock = platformCheckMock();
    mock.mockResolvedValueOnce({ status: "granted", canRequest: true });

    const first = await manager.checkPermission("microphone");
    expect(first.status).toBe("granted");
    expect(mock).toHaveBeenCalledTimes(1);

    const second = await manager.checkPermission("microphone");
    expect(second.status).toBe("granted");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. clearCache() forces re-query on the next check
  // -----------------------------------------------------------------------

  it("re-queries the platform after clearCache()", async () => {
    const mock = platformCheckMock();

    // First query returns "denied".
    mock.mockResolvedValueOnce({ status: "denied", canRequest: true });
    const first = await manager.checkPermission("microphone");
    expect(first.status).toBe("denied");
    expect(mock).toHaveBeenCalledTimes(1);

    // Clear the cache.
    manager.clearCache();

    // Second query should hit the platform again (now returns "granted").
    mock.mockResolvedValueOnce({ status: "granted", canRequest: true });
    const second = await manager.checkPermission("microphone");
    expect(second.status).toBe("granted");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 4. Expired cache should trigger a fresh platform query
  // -----------------------------------------------------------------------

  it("re-queries the platform when the cache entry has expired", async () => {
    const mock = platformCheckMock();

    // First query returns "denied".
    mock.mockResolvedValueOnce({ status: "denied", canRequest: true });
    const first = await manager.checkPermission("microphone");
    expect(first.status).toBe("denied");
    expect(mock).toHaveBeenCalledTimes(1);

    // Advance time past the default 30-second timeout.
    vi.advanceTimersByTime(31_000);

    // Next query should re-check (cache expired).
    mock.mockResolvedValueOnce({
      status: "granted",
      canRequest: true,
    });
    const second = await manager.checkPermission("microphone");
    expect(second.status).toBe("granted");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Additional edge-case: forceRefresh bypasses valid cache
  // -----------------------------------------------------------------------

  it("bypasses cache when forceRefresh is true", async () => {
    const mock = platformCheckMock();

    mock.mockResolvedValueOnce({ status: "denied", canRequest: true });
    await manager.checkPermission("microphone");
    expect(mock).toHaveBeenCalledTimes(1);

    // Force refresh even though cache is still valid.
    mock.mockResolvedValueOnce({ status: "granted", canRequest: true });
    const refreshed = await manager.checkPermission("microphone", true);
    expect(refreshed.status).toBe("granted");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Regression guard: ensure the cached object itself is returned, not
  // a stale reference that could diverge.
  // -----------------------------------------------------------------------

  it("returns the exact cached PermissionState object on cache hit", async () => {
    const mock = platformCheckMock();
    mock.mockResolvedValueOnce({ status: "denied", canRequest: false });

    const first = await manager.checkPermission("microphone");
    const second = await manager.checkPermission("microphone");

    // Both should be the same object reference (cache hit returns stored value).
    expect(first).toBe(second);
    expect(first.id).toBe("microphone");
    expect(first.canRequest).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Ensure "not-determined" and "restricted" statuses are also cached
  // -----------------------------------------------------------------------

  it("caches 'not-determined' status correctly", async () => {
    const mock = platformCheckMock();
    mock.mockResolvedValueOnce({
      status: "not-determined",
      canRequest: true,
    });

    const first = await manager.checkPermission("microphone");
    expect(first.status).toBe("not-determined");

    const second = await manager.checkPermission("microphone");
    expect(second.status).toBe("not-determined");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
