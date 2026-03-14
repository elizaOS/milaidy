import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getElectrobunPreloadStatus,
  readBuiltPreloadScript,
} from "../preload-validation";

const tempDirs: string[] = [];

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-preload-"));
  tempDirs.push(dir);
  const sourcePath = path.join(dir, "bridge", "electrobun-preload.ts");
  const preloadPath = path.join(dir, "preload.js");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  return { dir, sourcePath, preloadPath };
}

function setFileTime(filePath: string, timeMs: number): void {
  const date = new Date(timeMs);
  fs.utimesSync(filePath, date, date);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Electrobun preload validation", () => {
  it("throws when preload.js is missing", () => {
    const { dir, sourcePath } = createFixture();
    fs.writeFileSync(sourcePath, "export const preload = true;\n", "utf8");

    expect(() => readBuiltPreloadScript(dir)).toThrow(/preload\.js is missing/);
  });

  it("marks preload.js stale when the source is newer", () => {
    const { dir, sourcePath, preloadPath } = createFixture();
    fs.writeFileSync(sourcePath, "export const preload = true;\n", "utf8");
    fs.writeFileSync(preloadPath, "console.log('ready');\n", "utf8");
    setFileTime(preloadPath, 1_000);
    setFileTime(sourcePath, 2_000);

    expect(getElectrobunPreloadStatus(dir)).toMatchObject({
      preloadExists: true,
      sourceExists: true,
      stale: true,
    });
    expect(() => readBuiltPreloadScript(dir)).toThrow(/preload\.js is stale/);
  });

  it("returns the built preload when it is newer than the source", () => {
    const { dir, sourcePath, preloadPath } = createFixture();
    fs.writeFileSync(sourcePath, "export const preload = true;\n", "utf8");
    fs.writeFileSync(preloadPath, "console.log('ready');\n", "utf8");
    setFileTime(sourcePath, 1_000);
    setFileTime(preloadPath, 2_000);

    expect(readBuiltPreloadScript(dir)).toBe("console.log('ready');\n");
  });

  it("allows packaged layouts where the source file is absent", () => {
    const { dir, preloadPath } = createFixture();
    fs.writeFileSync(preloadPath, "console.log('ready');\n", "utf8");

    expect(getElectrobunPreloadStatus(dir)).toMatchObject({
      preloadExists: true,
      sourceExists: false,
      stale: false,
    });
    expect(readBuiltPreloadScript(dir)).toBe("console.log('ready');\n");
  });
});
