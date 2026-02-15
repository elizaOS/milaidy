import { describe, expect, it } from "vitest";
import { isSafeResetStateDir } from "./server.js";

describe("isSafeResetStateDir", () => {
  it("accepts default state dir under home", () => {
    expect(isSafeResetStateDir("/Users/alice/.milaidy", "/Users/alice")).toBe(
      true,
    );
  });

  it("accepts nested paths under .milaidy", () => {
    expect(
      isSafeResetStateDir(
        "/Users/alice/.milaidy/workspace/snapshots",
        "/Users/alice",
      ),
    ).toBe(true);
  });

  it("rejects root path", () => {
    expect(isSafeResetStateDir("/", "/Users/alice")).toBe(false);
  });

  it("rejects the home directory itself", () => {
    expect(isSafeResetStateDir("/Users/alice", "/Users/alice")).toBe(false);
  });

  it("rejects paths outside home even if they contain milaidy", () => {
    expect(isSafeResetStateDir("/tmp/milaidy-state", "/Users/alice")).toBe(
      false,
    );
  });

  it("rejects substring-only matches without a milaidy segment", () => {
    expect(
      isSafeResetStateDir("/Users/alice/not-milaidy-backup", "/Users/alice"),
    ).toBe(false);
  });
});
