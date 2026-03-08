import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveWebAssetDirectory } from "../../electron/src/web-assets";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "milady-electron-startup-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("electron startup web asset resolution (e2e)", () => {
  it("uses apps/app/dist when launching from electron with missing synced app assets", () => {
    const workspaceRoot = createTempDir();
    const capacitorAppDir = path.join(workspaceRoot, "apps", "app");
    const electronDir = path.join(capacitorAppDir, "electron");
    const distDir = path.join(capacitorAppDir, "dist");

    mkdirSync(electronDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      path.join(distDir, "index.html"),
      "<html><body>chat</body></html>",
    );

    const result = resolveWebAssetDirectory({
      appPath: electronDir,
      cwd: electronDir,
      webDir: "dist",
    });

    expect(result.hasIndexHtml).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.directory).toBe(path.resolve(distDir));
  });

  it("uses apps/app/dist in dev preference even when synced app assets exist", () => {
    const workspaceRoot = createTempDir();
    const capacitorAppDir = path.join(workspaceRoot, "apps", "app");
    const electronDir = path.join(capacitorAppDir, "electron");
    const syncedAppDir = path.join(electronDir, "app");
    const distDir = path.join(capacitorAppDir, "dist");

    mkdirSync(syncedAppDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      path.join(syncedAppDir, "index.html"),
      "<html><body>stale</body></html>",
    );
    writeFileSync(
      path.join(distDir, "index.html"),
      "<html><body>fresh</body></html>",
    );

    const result = resolveWebAssetDirectory({
      appPath: electronDir,
      cwd: electronDir,
      webDir: "dist",
      preferBuildOutput: true,
    });

    expect(result.hasIndexHtml).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.primaryHasIndexHtml).toBe(true);
    expect(result.directory).toBe(path.resolve(distDir));
  });
});
