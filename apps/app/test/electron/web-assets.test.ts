import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildMissingWebAssetsMessage,
  resolveWebAssetDirectory,
} from "../../electron/src/web-assets";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "milaidy-electron-web-assets-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveWebAssetDirectory", () => {
  it("prefers the synced electron app directory", () => {
    const root = createTempDir();
    const appPath = path.join(root, "electron");
    const appDir = path.join(appPath, "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "index.html"), "<html></html>");

    const result = resolveWebAssetDirectory({ appPath, cwd: appPath, webDir: "dist" });

    expect(result.directory).toBe(path.resolve(appDir));
    expect(result.usedFallback).toBe(false);
    expect(result.hasIndexHtml).toBe(true);
  });

  it("falls back to sibling webDir when electron/app is missing", () => {
    const root = createTempDir();
    const appPath = path.join(root, "electron");
    mkdirSync(appPath, { recursive: true });
    const distDir = path.join(root, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(path.join(distDir, "index.html"), "<html></html>");

    const result = resolveWebAssetDirectory({ appPath, cwd: appPath, webDir: "dist" });

    expect(result.directory).toBe(path.resolve(distDir));
    expect(result.usedFallback).toBe(true);
    expect(result.hasIndexHtml).toBe(true);
  });

  it("prefers build output over synced app assets when configured", () => {
    const root = createTempDir();
    const appPath = path.join(root, "electron");
    const appDir = path.join(appPath, "app");
    const distDir = path.join(root, "dist");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    writeFileSync(path.join(appDir, "index.html"), "<html><body>stale</body></html>");
    writeFileSync(path.join(distDir, "index.html"), "<html><body>fresh</body></html>");

    const result = resolveWebAssetDirectory({
      appPath,
      cwd: appPath,
      webDir: "dist",
      preferBuildOutput: true,
    });

    expect(result.directory).toBe(path.resolve(distDir));
    expect(result.usedFallback).toBe(true);
    expect(result.hasIndexHtml).toBe(true);
    expect(result.primaryHasIndexHtml).toBe(true);
  });

  it("reports searched paths when assets are missing", () => {
    const root = createTempDir();
    const appPath = path.join(root, "electron");
    mkdirSync(appPath, { recursive: true });

    const result = resolveWebAssetDirectory({ appPath, cwd: appPath, webDir: "dist" });
    const message = buildMissingWebAssetsMessage(result);

    expect(result.hasIndexHtml).toBe(false);
    expect(message).toContain("Web assets were not found");
    expect(message).toContain(path.resolve(path.join(appPath, "app")));
  });
});
