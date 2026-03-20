import { describe, expect, it } from "vitest";
import { isSafeResetStateDir } from "./server";

describe("isSafeResetStateDir", () => {
  it("accepts default state dir under home", () => {
    expect(isSafeResetStateDir("/Users/alice/.milady", "/Users/alice")).toBe(
      true,
    );
  });

  it("accepts nested paths under .eliza", () => {
    expect(
      isSafeResetStateDir(
        "/Users/alice/.milady/workspace/snapshots",
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

  it("rejects paths outside home even if they contain eliza", () => {
    expect(isSafeResetStateDir("/tmp/eliza-state", "/Users/alice")).toBe(false);
  });

  it("rejects substring-only matches without an eliza segment", () => {
    expect(
      isSafeResetStateDir("/Users/alice/not-eliza-backup", "/Users/alice"),
    ).toBe(false);
  });

  it("accepts .milady state dir under home (custom namespace)", () => {
    expect(isSafeResetStateDir("/Users/alice/.milady", "/Users/alice")).toBe(
      true,
    );
  });
});
