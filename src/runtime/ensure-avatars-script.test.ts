import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasValidAnimations,
  hasValidVrm,
  runEnsureAvatars,
} from "../../scripts/ensure-avatars.mjs";

// ── Deterministic helpers ─────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `ensure-avatars-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFakeFile(filePath: string, sizeBytes: number): void {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, Buffer.alloc(sizeBytes, 0x42));
}

// ── hasValidVrm ───────────────────────────────────────────────────────

describe("hasValidVrm", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir("vrm");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns false for non-existent directory", () => {
    expect(hasValidVrm("/tmp/does-not-exist-xyz-99999")).toBe(false);
  });

  it("returns false for empty directory", () => {
    expect(hasValidVrm(dir)).toBe(false);
  });

  it("returns false when VRM is an LFS pointer (< 1 KB)", () => {
    writeFakeFile(join(dir, "milady-1.vrm"), 130);
    expect(hasValidVrm(dir)).toBe(false);
  });

  it("returns true when VRM is a real binary (> 1 KB)", () => {
    writeFakeFile(join(dir, "milady-1.vrm"), 2048);
    expect(hasValidVrm(dir)).toBe(true);
  });

  it("ignores non-VRM files", () => {
    writeFakeFile(join(dir, "readme.txt"), 5000);
    expect(hasValidVrm(dir)).toBe(false);
  });
});

// ── hasValidAnimations ────────────────────────────────────────────────

describe("hasValidAnimations", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir("anim");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns false for non-existent directory", () => {
    expect(hasValidAnimations("/tmp/does-not-exist-xyz-99999")).toBe(false);
  });

  it("returns false when emotes subdirectory is missing", () => {
    expect(hasValidAnimations(dir)).toBe(false);
  });

  it("returns false when emotes has no .glb files", () => {
    mkdirSync(join(dir, "emotes"), { recursive: true });
    expect(hasValidAnimations(dir)).toBe(false);
  });

  it("returns false when .glb is an LFS pointer (< 1 KB)", () => {
    writeFakeFile(join(dir, "emotes", "idle.glb"), 100);
    expect(hasValidAnimations(dir)).toBe(false);
  });

  it("returns true when .glb is a real binary (> 1 KB)", () => {
    writeFakeFile(join(dir, "emotes", "idle.glb"), 4096);
    expect(hasValidAnimations(dir)).toBe(true);
  });
});

// ── runEnsureAvatars ──────────────────────────────────────────────────

describe("runEnsureAvatars", () => {
  it("skips when avatar assets are already present", () => {
    const logs: string[] = [];
    const result = runEnsureAvatars({
      force: false,
      log: (msg: string) => logs.push(msg),
      logError: (msg: string) => logs.push(msg),
    });

    expect(result.cloned).toBe(false);
    expect(result.reason).toBe("already-present");
    expect(logs.some((m: string) => m.includes("already present"))).toBe(true);
  });

  it("returns expected shape for already-present path", () => {
    const result = runEnsureAvatars({
      force: false,
      log: () => {},
      logError: () => {},
    });
    expect(result.cloned).toBe(false);
    expect(result.reason).toBe("already-present");
    expect(result).not.toHaveProperty("error");
  });

  it("accepts all option parameters", () => {
    // Verify the function signature accepts force, log, logError
    expect(typeof runEnsureAvatars).toBe("function");
    const result = runEnsureAvatars({
      force: false,
      log: () => {},
      logError: () => {},
    });
    expect(result).toHaveProperty("cloned");
  });
});
