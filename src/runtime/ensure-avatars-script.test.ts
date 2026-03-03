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

// Stub checkers that simulate "assets already present" without touching disk.
const presentVrm = () => true;
const presentAnims = () => true;
const absentVrm = () => false;
const absentAnims = () => false;

describe("runEnsureAvatars", () => {
  let savedSkipEnv: string | undefined;

  beforeEach(() => {
    savedSkipEnv = process.env.SKIP_AVATAR_CLONE;
    delete process.env.SKIP_AVATAR_CLONE;
  });

  afterEach(() => {
    if (savedSkipEnv === undefined) {
      delete process.env.SKIP_AVATAR_CLONE;
    } else {
      process.env.SKIP_AVATAR_CLONE = savedSkipEnv;
    }
  });

  it("skips when avatar assets are already present", () => {
    const logs: string[] = [];
    const result = runEnsureAvatars({
      force: false,
      log: (msg: string) => logs.push(msg),
      logError: (msg: string) => logs.push(msg),
      _hasValidVrm: presentVrm,
      _hasValidAnimations: presentAnims,
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
      _hasValidVrm: presentVrm,
      _hasValidAnimations: presentAnims,
    });
    expect(result.cloned).toBe(false);
    expect(result.reason).toBe("already-present");
    expect(result).not.toHaveProperty("error");
  });

  it("bypasses already-present check when force=true", () => {
    // Even though validators report assets present, force should skip
    // the early return and attempt to clone (which will fail in CI
    // without git — that's fine, we're testing the branch logic).
    const logs: string[] = [];
    const result = runEnsureAvatars({
      force: true,
      log: (msg: string) => logs.push(msg),
      logError: (msg: string) => logs.push(msg),
      _hasValidVrm: presentVrm,
      _hasValidAnimations: presentAnims,
    });
    // With force=true and assets "present", the function should NOT
    // return "already-present" — it proceeds to the clone path.
    expect(result.reason).not.toBe("already-present");
  });

  it("does not skip when SKIP_AVATAR_CLONE is an unrelated value", () => {
    process.env.SKIP_AVATAR_CLONE = "no";
    const logs: string[] = [];
    const result = runEnsureAvatars({
      force: false,
      log: (msg: string) => logs.push(msg),
      logError: (msg: string) => logs.push(msg),
      _hasValidVrm: absentVrm,
      _hasValidAnimations: absentAnims,
    });
    // "no" is not "1" or "true", so the env guard should not trigger
    expect(result.reason).not.toBe("skipped-by-env");
  });

  it("returns skipped-by-env when SKIP_AVATAR_CLONE=1", () => {
    process.env.SKIP_AVATAR_CLONE = "1";
    const logs: string[] = [];
    const result = runEnsureAvatars({
      force: false,
      log: (msg: string) => logs.push(msg),
      logError: (msg: string) => logs.push(msg),
      _hasValidVrm: absentVrm,
      _hasValidAnimations: absentAnims,
    });
    expect(result.cloned).toBe(false);
    expect(result.reason).toBe("skipped-by-env");
    expect(logs.some((m: string) => m.includes("SKIP_AVATAR_CLONE"))).toBe(
      true,
    );
  });

  it("returns skipped-by-env when SKIP_AVATAR_CLONE=true", () => {
    process.env.SKIP_AVATAR_CLONE = "true";
    const result = runEnsureAvatars({
      force: false,
      log: () => {},
      logError: () => {},
      _hasValidVrm: absentVrm,
      _hasValidAnimations: absentAnims,
    });
    expect(result.cloned).toBe(false);
    expect(result.reason).toBe("skipped-by-env");
  });
});

// ── Module exports ───────────────────────────────────────────────────

describe("module exports", () => {
  it("exports expected functions", () => {
    expect(typeof hasValidVrm).toBe("function");
    expect(typeof hasValidAnimations).toBe("function");
    expect(typeof runEnsureAvatars).toBe("function");
  });
});
