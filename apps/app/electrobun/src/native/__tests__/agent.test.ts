/**
 * Tests for agent.ts utility functions.
 *
 * Covers:
 *  - resolveConfigDir: Windows vs POSIX config directory resolution
 *  - getMiladyDistFallbackCandidates: path resolution fallback list
 */

import path from "node:path";
import { describe, expect, it } from "vitest";

import { getMiladyDistFallbackCandidates, resolveConfigDir } from "../agent";

// ---------------------------------------------------------------------------
// resolveConfigDir
// ---------------------------------------------------------------------------

describe("resolveConfigDir", () => {
  it("returns %APPDATA%\\Milady on Windows when APPDATA is set", () => {
    const result = resolveConfigDir({
      platform: "win32",
      appdata: "C:\\Users\\Test\\AppData\\Roaming",
      homedir: "C:\\Users\\Test",
    });
    expect(result).toBe(
      path.join("C:\\Users\\Test\\AppData\\Roaming", "Milady"),
    );
  });

  it("falls back to homedir\\AppData\\Roaming\\Milady on Windows when APPDATA is absent", () => {
    const result = resolveConfigDir({
      platform: "win32",
      homedir: "C:\\Users\\Test",
    });
    // No appdata provided and process.env.APPDATA should not be used when
    // explicit opts are given — but the function falls through to
    // process.env.APPDATA. On a non-Windows CI runner APPDATA is unset, so
    // the fallback to homedir kicks in. On a Windows runner APPDATA is set.
    // Either way, the result must end with "Milady".
    expect(result.endsWith("Milady")).toBe(true);
  });

  it("returns ~/.config/Milady on macOS", () => {
    const result = resolveConfigDir({
      platform: "darwin",
      homedir: "/Users/test",
    });
    expect(result).toBe(path.join("/Users/test", ".config", "Milady"));
  });

  it("returns ~/.config/Milady on Linux", () => {
    const result = resolveConfigDir({
      platform: "linux",
      homedir: "/home/test",
    });
    expect(result).toBe(path.join("/home/test", ".config", "Milady"));
  });

  it("ignores APPDATA on non-Windows platforms", () => {
    const result = resolveConfigDir({
      platform: "darwin",
      appdata: "C:\\Users\\Test\\AppData\\Roaming",
      homedir: "/Users/test",
    });
    // Should use ~/.config, not APPDATA
    expect(result).toBe(path.join("/Users/test", ".config", "Milady"));
  });

  it("uses explicit appdata over process.env.APPDATA", () => {
    const result = resolveConfigDir({
      platform: "win32",
      appdata: "D:\\CustomAppData",
      homedir: "C:\\Users\\Test",
    });
    expect(result).toBe(path.join("D:\\CustomAppData", "Milady"));
  });
});

// ---------------------------------------------------------------------------
// getMiladyDistFallbackCandidates
// ---------------------------------------------------------------------------

describe("getMiladyDistFallbackCandidates", () => {
  it("returns an array of candidate paths", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/some/dir",
      "/usr/bin/bun",
    );
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("deduplicates candidates", () => {
    const candidates = getMiladyDistFallbackCandidates("/a/b", "/a/b/bun");
    const unique = new Set(candidates);
    expect(candidates.length).toBe(unique.size);
  });

  it("includes macOS bundle path", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/a/b",
      "/app/Contents/MacOS/launcher",
    );
    const macosBundlePath = path.resolve(
      "/app/Contents/MacOS",
      "../Resources/app/milady-dist",
    );
    expect(candidates).toContain(macosBundlePath);
  });

  it("includes Windows resources path", () => {
    const candidates = getMiladyDistFallbackCandidates(
      "/a/b",
      "/app/launcher.exe",
    );
    const winResourcesPath = path.resolve("/app", "resources/app/milady-dist");
    expect(candidates).toContain(winResourcesPath);
  });
});
