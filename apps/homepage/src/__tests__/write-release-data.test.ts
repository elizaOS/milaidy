import { describe, expect, it } from "vitest";
import {
  type GithubRelease,
  matchAsset,
  pickRelease,
} from "../lib/release-helpers";

function makeRelease(
  overrides: Partial<GithubRelease> = {},
): GithubRelease {
  return {
    draft: false,
    prerelease: false,
    tag_name: "v1.0.0",
    published_at: "2026-01-15T00:00:00Z",
    html_url: "https://github.com/milady-ai/milady/releases/tag/v1.0.0",
    assets: [
      {
        name: "canary-macos-arm64-Milady.dmg",
        size: 500_000_000,
        browser_download_url:
          "https://github.com/milady-ai/milady/releases/download/v1.0.0/canary-macos-arm64-Milady.dmg",
      },
    ],
    ...overrides,
  };
}

describe("pickRelease", () => {
  it("skips releases with no assets", () => {
    const releases = [
      makeRelease({
        tag_name: "v2.0.0",
        published_at: "2026-03-01T00:00:00Z",
        assets: [],
      }),
      makeRelease({
        tag_name: "v1.0.0",
        published_at: "2026-02-01T00:00:00Z",
      }),
    ];

    const result = pickRelease(releases);
    expect(result?.tag_name).toBe("v1.0.0");
  });

  it("returns the most recent release with assets", () => {
    const releases = [
      makeRelease({
        tag_name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
      }),
      makeRelease({
        tag_name: "v3.0.0",
        published_at: "2026-03-01T00:00:00Z",
      }),
      makeRelease({
        tag_name: "v2.0.0",
        published_at: "2026-02-01T00:00:00Z",
      }),
    ];

    const result = pickRelease(releases);
    expect(result?.tag_name).toBe("v3.0.0");
  });

  it("skips drafts", () => {
    const releases = [
      makeRelease({
        tag_name: "v2.0.0-draft",
        draft: true,
        published_at: "2026-03-01T00:00:00Z",
      }),
      makeRelease({
        tag_name: "v1.0.0",
        published_at: "2026-02-01T00:00:00Z",
      }),
    ];

    const result = pickRelease(releases);
    expect(result?.tag_name).toBe("v1.0.0");
  });

  it("returns null for empty array", () => {
    expect(pickRelease([])).toBeNull();
  });
});

describe("matchAsset (script logic)", () => {
  it("maps known filenames correctly", () => {
    expect(matchAsset("canary-macos-arm64-Milady-canary.dmg")).toBe(
      "macos-arm64",
    );
    expect(matchAsset("canary-macos-x64-Milady-canary.dmg")).toBe("macos-x64");
    expect(matchAsset("Milady-Setup-canary.exe")).toBe("windows-x64");
    expect(matchAsset("canary-linux-x64-Milady-canary-Setup.tar.gz")).toBe(
      "linux-x64",
    );
    expect(matchAsset("milady-linux-x64.deb")).toBe("linux-deb");
  });

  it("handles Windows .exe format (Setup prefix)", () => {
    expect(matchAsset("Setup-Milady.exe")).toBe("windows-x64");
  });

  it("handles Windows .exe format (win prefix)", () => {
    expect(matchAsset("win-milady-installer.exe")).toBe("windows-x64");
  });

  it("handles Windows .zip format with win+setup", () => {
    expect(matchAsset("win-milady-setup-x64.zip")).toBe("windows-x64");
  });

  it("handles Linux AppImage format", () => {
    expect(matchAsset("milady-linux-x64.AppImage")).toBe("linux-x64");
  });

  it("returns null for unrecognized assets", () => {
    expect(matchAsset("SHA256SUMS.txt")).toBeNull();
    expect(matchAsset("source.tar.gz")).toBeNull();
  });
});
