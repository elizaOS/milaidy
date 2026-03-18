/**
 * Tests for the update checker service.
 *
 * These tests validate the core logic for checking npm for new versions
 * and resolving release channels, without making real network requests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_DIST_TAGS } from "./update-checker";

// The type is inlined to avoid resolving types.milady vs types.eliza
// depending on the workspace layout.
type ReleaseChannel = "stable" | "beta" | "nightly";

// ---------------------------------------------------------------------------
// We test the pure logic functions by importing them directly.
// Network-dependent functions are tested with mocked fetch.
// ---------------------------------------------------------------------------

// Mock config module before imports.
// The eliza workspace exports loadElizaConfig/saveElizaConfig while the npm
// milady fork exports loadMiladyConfig/saveMiladyConfig.  Provide both so the
// mock satisfies whichever variant the resolved source uses.
const { _loadConfig, _saveConfig } = vi.hoisted(() => ({
  _loadConfig: vi.fn(() => ({})),
  _saveConfig: vi.fn(),
}));

vi.mock("@elizaos/autonomous/config/config.ts", () => ({
  loadElizaConfig: _loadConfig,
  saveElizaConfig: _saveConfig,
  loadMiladyConfig: _loadConfig,
  saveMiladyConfig: _saveConfig,
}));

// Mock version module
vi.mock("@elizaos/autonomous/runtime/version.ts", () => ({
  VERSION: "2.0.0-alpha.7",
}));

import {
  checkForUpdate,
  fetchAllChannelVersions,
  resolveChannel,
} from "@elizaos/autonomous/services/update-checker.ts";

// ============================================================================
// 1. Channel resolution
// ============================================================================

describe("resolveChannel", () => {
  // The source uses either ELIZA_UPDATE_CHANNEL or MILADY_UPDATE_CHANNEL
  // depending on the resolved package version.  Set/clear both to be safe.
  const ENV_KEYS = ["ELIZA_UPDATE_CHANNEL", "MILADY_UPDATE_CHANNEL"] as const;
  const originals = ENV_KEYS.map((k) => process.env[k]);

  function setChannelEnv(value: string) {
    for (const k of ENV_KEYS) process.env[k] = value;
  }
  function deleteChannelEnv() {
    for (const k of ENV_KEYS) delete process.env[k];
  }

  afterEach(() => {
    ENV_KEYS.forEach((k, i) => {
      if (originals[i] === undefined) delete process.env[k];
      else process.env[k] = originals[i];
    });
  });

  it("defaults to stable when no config is set", () => {
    deleteChannelEnv();
    expect(resolveChannel(undefined)).toBe("stable");
  });

  it("returns the configured channel", () => {
    deleteChannelEnv();
    expect(resolveChannel({ channel: "beta" })).toBe("beta");
    expect(resolveChannel({ channel: "nightly" })).toBe("nightly");
    expect(resolveChannel({ channel: "stable" })).toBe("stable");
  });

  it("respects update channel env var override", () => {
    setChannelEnv("nightly");
    expect(resolveChannel({ channel: "stable" })).toBe("nightly");
  });

  it("ignores invalid env var values", () => {
    setChannelEnv("invalid");
    expect(resolveChannel({ channel: "beta" })).toBe("beta");
  });

  it("handles env var with extra whitespace", () => {
    setChannelEnv("  beta  ");
    expect(resolveChannel({ channel: "stable" })).toBe("beta");
  });

  it("handles env var case-insensitively", () => {
    setChannelEnv("NIGHTLY");
    expect(resolveChannel(undefined)).toBe("nightly");
  });

  it("falls back to config when env var is empty string", () => {
    setChannelEnv("");
    expect(resolveChannel({ channel: "beta" })).toBe("beta");
  });

  it("falls back to config when env var is only whitespace", () => {
    setChannelEnv("   ");
    expect(resolveChannel({ channel: "nightly" })).toBe("nightly");
  });
});

// ============================================================================
// 2. Channel dist-tag mapping
// ============================================================================

describe("CHANNEL_DIST_TAGS", () => {
  it("maps stable to latest", () => {
    expect(CHANNEL_DIST_TAGS.stable).toBe("latest");
  });

  it("maps beta to beta", () => {
    expect(CHANNEL_DIST_TAGS.beta).toBe("beta");
  });

  it("maps nightly to nightly", () => {
    expect(CHANNEL_DIST_TAGS.nightly).toBe("nightly");
  });

  it("covers all channel types", () => {
    const channels: ReleaseChannel[] = ["stable", "beta", "nightly"];
    for (const channel of channels) {
      expect(CHANNEL_DIST_TAGS[channel]).toBeDefined();
      expect(typeof CHANNEL_DIST_TAGS[channel]).toBe("string");
    }
  });
});

// ============================================================================
// 3. Update check with mocked fetch
// ============================================================================

describe("checkForUpdate", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    _loadConfig.mockReturnValue({});
    _saveConfig.mockImplementation(() => {});
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects an available update on stable channel", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": {
          latest: "2.1.0",
          beta: "2.1.0-beta.1",
          nightly: "2.1.0-nightly.20260208",
        },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(true);
    expect(result.currentVersion).toBe("2.0.0-alpha.7");
    expect(result.latestVersion).toBe("2.1.0");
    expect(result.channel).toBe("stable");
    expect(result.distTag).toBe("latest");
    expect(result.cached).toBe(false);
    expect(result.error).toBeNull();
  });

  it("reports no update when already on latest", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0-alpha.7" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("2.0.0-alpha.7");
  });

  it("handles network failure gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.error).toContain("npm registry");
  });

  it("handles non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("npm registry");
  });

  it("handles missing dist-tag", async () => {
    _loadConfig.mockReturnValue({
      update: { channel: "nightly" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0" },
        // No "nightly" tag
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("nightly");
    expect(result.error).toContain("not have any published releases");
  });

  it("saves last-check metadata to config", async () => {
    _saveConfig.mockClear();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.1.0" },
      }),
    });

    await checkForUpdate({ force: true });

    expect(_saveConfig).toHaveBeenCalledOnce();
    const savedConfig = _saveConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(savedConfig.update?.lastCheckAt).toBeDefined();
    expect(savedConfig.update?.lastCheckVersion).toBe("2.1.0");
  });

  it("returns cached result within check interval", async () => {
    const recentCheck = new Date().toISOString();
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: recentCheck,
        lastCheckVersion: "2.1.0",
        checkIntervalSeconds: 3600,
      },
    });

    const result = await checkForUpdate();

    expect(result.cached).toBe(true);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("2.1.0");
    // Should NOT have called fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("bypasses cache when force is true", async () => {
    const recentCheck = new Date().toISOString();
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: recentCheck,
        lastCheckVersion: "2.1.0",
        checkIntervalSeconds: 3600,
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.2.0" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.cached).toBe(false);
    expect(result.latestVersion).toBe("2.2.0");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("uses beta channel when configured", async () => {
    _loadConfig.mockReturnValue({
      update: { channel: "beta" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0", beta: "2.1.0-beta.3" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.channel).toBe("beta");
    expect(result.distTag).toBe("beta");
    expect(result.latestVersion).toBe("2.1.0-beta.3");
    expect(result.updateAvailable).toBe(true);
  });

  it("fetches outside interval when cache is expired", async () => {
    // lastCheckAt is 5 hours ago, interval is 4 hours → should re-check
    const fiveHoursAgo = new Date(
      Date.now() - 5 * 60 * 60 * 1000,
    ).toISOString();
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: fiveHoursAgo,
        lastCheckVersion: "2.0.0",
        checkIntervalSeconds: 14400, // 4 hours
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.1.0" },
      }),
    });

    const result = await checkForUpdate(); // NOT forced

    expect(result.cached).toBe(false);
    expect(result.latestVersion).toBe("2.1.0");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns updateAvailable=false when cached with no lastCheckVersion", async () => {
    const recentCheck = new Date().toISOString();
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: recentCheck,
        // lastCheckVersion is undefined
        checkIntervalSeconds: 3600,
      },
    });

    const result = await checkForUpdate();

    expect(result.cached).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
  });

  it("reports no update when current version is newer than registry", async () => {
    // Simulates a local/dev build ahead of the published version
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0-alpha.5" },
      }),
    });

    const result = await checkForUpdate({ force: true });
    // VERSION is "2.0.0-alpha.7" which is > "2.0.0-alpha.5"
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("2.0.0-alpha.5");
    expect(result.error).toBeNull();
  });

  it("sends correct URL and Accept header to npm registry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "dist-tags": { latest: "2.0.0" } }),
    });

    await checkForUpdate({ force: true });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    // The URL depends on which fork (elizaos vs miladyai) is resolved
    expect(url).toMatch(/^https:\/\/registry\.npmjs\.org\/(elizaos|miladyai)$/);
    expect(options.headers.Accept).toBe("application/vnd.npm.install-v1+json");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("writes warning to stderr when saveConfig throws", async () => {
    _saveConfig.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "dist-tags": { latest: "2.1.0" } }),
    });

    const result = await checkForUpdate({ force: true });

    // The check should still succeed despite the save failure
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("2.1.0");
    expect(result.error).toBeNull();

    // But a warning should have been written to stderr
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("could not save update-check metadata");
    expect(written).toContain("EACCES");

    stderrSpy.mockRestore();
  });

  it("handles registry returning malformed JSON (no dist-tags key)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: "milady", versions: {} }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("npm registry");
  });

  it("handles registry returning unparseable latest version", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "not-a-version" },
      }),
    });

    const result = await checkForUpdate({ force: true });

    // compareSemver returns null → updateAvailable is false
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("not-a-version");
    // No error — the check succeeded, the version just isn't parseable
    expect(result.error).toBeNull();
  });

  it("detects nightly update on nightly channel", async () => {
    _loadConfig.mockReturnValue({
      update: { channel: "nightly" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": {
          latest: "2.0.0",
          nightly: "2.0.0-nightly.20260209",
        },
      }),
    });

    const result = await checkForUpdate({ force: true });

    expect(result.channel).toBe("nightly");
    expect(result.distTag).toBe("nightly");
    expect(result.latestVersion).toBe("2.0.0-nightly.20260209");
    // VERSION is "2.0.0-alpha.7" — alpha.7 vs nightly.20260209
    // parseSemver gives [2,0,0,7] vs [2,0,0,20260209] → update available
    expect(result.updateAvailable).toBe(true);
  });

  it("handles response.json() throwing (malformed body)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const result = await checkForUpdate({ force: true });

    // fetchDistTags catches the error and returns null
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("npm registry");
  });

  it("re-checks every time when checkIntervalSeconds is 0", async () => {
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: new Date().toISOString(), // just checked
        lastCheckVersion: "2.0.0",
        checkIntervalSeconds: 0, // always re-check
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "dist-tags": { latest: "2.1.0" } }),
    });

    const result = await checkForUpdate(); // NOT forced

    // With interval=0, elapsed > 0 is always true, so it should re-check
    expect(result.cached).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("re-checks when lastCheckAt is an invalid date string", async () => {
    _loadConfig.mockReturnValue({
      update: {
        lastCheckAt: "not-a-date",
        lastCheckVersion: "2.0.0",
        checkIntervalSeconds: 999999,
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "dist-tags": { latest: "2.1.0" } }),
    });

    const result = await checkForUpdate(); // NOT forced

    // Invalid date → NaN elapsed → NaN < interval is false → does NOT skip
    expect(result.cached).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles concurrent calls without double-fetching from cache", async () => {
    _loadConfig.mockReturnValue({});

    let fetchCount = 0;
    mockFetch.mockImplementation(async () => {
      fetchCount++;
      // Simulate a small delay
      await new Promise((r) => setTimeout(r, 10));
      return {
        ok: true,
        json: async () => ({ "dist-tags": { latest: "2.1.0" } }),
      };
    });

    // Fire two checks concurrently
    const [result1, result2] = await Promise.all([
      checkForUpdate({ force: true }),
      checkForUpdate({ force: true }),
    ]);

    // Both should succeed
    expect(result1.latestVersion).toBe("2.1.0");
    expect(result2.latestVersion).toBe("2.1.0");
    // Both used force, so both should have fetched
    expect(fetchCount).toBe(2);
  });
});

// ============================================================================
// 4. Fetch all channel versions
// ============================================================================

describe("fetchAllChannelVersions", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns versions for all channels", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": {
          latest: "2.0.0",
          beta: "2.1.0-beta.1",
          nightly: "2.1.0-nightly.20260208",
        },
      }),
    });

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBe("2.0.0");
    expect(versions.beta).toBe("2.1.0-beta.1");
    expect(versions.nightly).toBe("2.1.0-nightly.20260208");
  });

  it("returns null for unpublished channels", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "2.0.0" },
      }),
    });

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBe("2.0.0");
    expect(versions.beta).toBeNull();
    expect(versions.nightly).toBeNull();
  });

  it("returns all nulls on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    const versions = await fetchAllChannelVersions();

    expect(versions.stable).toBeNull();
    expect(versions.beta).toBeNull();
    expect(versions.nightly).toBeNull();
  });
});

// ============================================================================
// 5. Integration: real npm registry (skip if offline)
// ============================================================================

describe("npm registry integration", () => {
  // These tests hit the real npm registry to verify our URL, headers,
  // and response parsing actually work against production infrastructure.
  // They are skipped when offline or in CI without network access.

  async function isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      const res = await globalThis.fetch("https://registry.npmjs.org/", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  it("fetches real dist-tags from npm and gets a valid response shape", async () => {
    // Unstub global fetch so we use the real one
    vi.unstubAllGlobals();

    const online = await isOnline();
    if (!online) {
      console.log("  (skipped — npm registry unreachable)");
      return;
    }

    // Fetch the abbreviated packument directly (same way update-checker does).
    // The resolved source may target either "elizaos" or "miladyai" on npm.
    // We test against "elizaos" which is the upstream package name.
    const packageName = "elizaos";
    const res = await globalThis.fetch(
      `https://registry.npmjs.org/${packageName}`,
      {
        headers: {
          Accept: "application/vnd.npm.install-v1+json",
        },
      },
    );

    expect(res.ok).toBe(true);

    const data = (await res.json()) as {
      "dist-tags"?: Record<string, string>;
      name?: string;
    };

    // Verify the response has the expected shape
    expect(data.name).toBe(packageName);
    expect(data["dist-tags"]).toBeDefined();
    expect(typeof data["dist-tags"]).toBe("object");

    // The "latest" dist-tag should always exist for a published package
    const latest = data["dist-tags"]?.latest;
    expect(latest).toBeDefined();
    expect(typeof latest).toBe("string");

    // Verify the version is parseable semver
    const match = latest?.match(/^\d+\.\d+\.\d+/);
    expect(match).not.toBeNull();
  });
});
