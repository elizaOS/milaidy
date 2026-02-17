import { describe, expect, it } from "vitest";
import { isSafeResetStateDir } from "./server";

describe("isSafeResetStateDir", () => {
  it("accepts default state dir under home", () => {
    expect(isSafeResetStateDir("/Users/alice/.milady", "/Users/alice")).toBe(
      true,
    );
  });

  it("accepts nested paths under .milady", () => {
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

  it("rejects paths outside home even if they contain milady", () => {
    expect(isSafeResetStateDir("/tmp/milady-state", "/Users/alice")).toBe(
      false,
    );
  });

  it("rejects substring-only matches without a milady segment", () => {
    expect(
      isSafeResetStateDir("/Users/alice/not-milady-backup", "/Users/alice"),
    ).toBe(false);
  });
});
