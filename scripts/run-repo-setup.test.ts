import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireRepoSetupLock,
  getRepoSetupLockPath,
  isRepoSetupLockStale,
  repoSetupSteps,
} from "./run-repo-setup.mjs";

describe("repoSetupSteps", () => {
  it("keeps repo setup order explicit", () => {
    expect(repoSetupSteps).toEqual([
      "scripts/init-submodules.mjs",
      "scripts/ensure-skills.mjs",
      "scripts/ensure-avatars.mjs",
      "scripts/link-browser-server.mjs",
      "scripts/ensure-vision-deps.mjs",
      "scripts/patch-deps.mjs",
    ]);
  });
});

describe("isRepoSetupLockStale", () => {
  it("treats malformed lock data as stale", () => {
    expect(isRepoSetupLockStale(null)).toBe(true);
    expect(isRepoSetupLockStale({})).toBe(true);
  });

  it("treats missing processes as stale", () => {
    expect(
      isRepoSetupLockStale(
        { pid: 1234, startedAt: 1_000 },
        {
          now: 1_500,
          processExists: () => false,
        },
      ),
    ).toBe(true);
  });

  it("treats active recent locks as fresh", () => {
    expect(
      isRepoSetupLockStale(
        { pid: 1234, startedAt: 1_000 },
        {
          now: 1_500,
          processExists: () => true,
        },
      ),
    ).toBe(false);
  });
});

describe("acquireRepoSetupLock", () => {
  it("creates and releases the lock file", async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "milady-setup-lock-"));
    const lockPath = getRepoSetupLockPath(repoRoot);

    try {
      const release = await acquireRepoSetupLock(lockPath);
      const contents = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(contents.pid).toBe(process.pid);
      await release();
      expect(() => readFileSync(lockPath, "utf8")).toThrow();
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });

  it("replaces stale lock files before acquiring", async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "milady-setup-lock-"));
    const lockPath = getRepoSetupLockPath(repoRoot);

    try {
      writeFileSync(
        lockPath,
        JSON.stringify({ pid: 42, startedAt: 0 }),
        "utf8",
      );

      const release = await acquireRepoSetupLock(lockPath, {
        now: () => 20 * 60 * 1000,
        processExists: () => false,
      });

      const contents = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(contents.pid).toBe(process.pid);
      await release();
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });
});
