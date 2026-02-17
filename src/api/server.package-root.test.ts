import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findOwnPackageRoot } from "./server";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("findOwnPackageRoot", () => {
  it("matches package name case-insensitively", () => {
    const root = makeTempDir("milady-root-");
    const nested = path.join(root, "src", "api");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "Milady" }),
      "utf8",
    );

    expect(findOwnPackageRoot(nested)).toBe(root);
  });

  it("returns start directory when no matching package root exists", () => {
    const root = makeTempDir("not-milady-");
    const nested = path.join(root, "src", "api");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "other-package" }),
      "utf8",
    );

    expect(findOwnPackageRoot(nested)).toBe(nested);
  });
});
