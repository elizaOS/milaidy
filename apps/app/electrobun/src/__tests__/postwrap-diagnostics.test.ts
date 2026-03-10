import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectArchiveReports,
  collectSizeDiagnostics,
  resolveBundleLayout,
  resolveDiagnosticsOutputPath,
  resolveWrapperBundlePath,
} from "../../scripts/postwrap-diagnostics";

describe("resolveWrapperBundlePath", () => {
  it("accepts an explicit wrapper path", () => {
    expect(resolveWrapperBundlePath(["/tmp/Milady.app"], {})).toBe(
      "/tmp/Milady.app",
    );
  });

  it("uses ELECTROBUN_WRAPPER_BUNDLE_PATH when present", () => {
    expect(
      resolveWrapperBundlePath([], {
        ELECTROBUN_WRAPPER_BUNDLE_PATH: "/tmp/Milady.app",
      }),
    ).toBe("/tmp/Milady.app");
  });

  it("falls back to the matching bundle inside ELECTROBUN_BUILD_DIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-diag-"));
    const stableBundle = path.join(tempDir, "Milady.app");
    const canaryBundle = path.join(tempDir, "Milady-canary.app");
    fs.mkdirSync(stableBundle, { recursive: true });
    fs.mkdirSync(canaryBundle, { recursive: true });

    expect(
      resolveWrapperBundlePath([], {
        ELECTROBUN_APP_NAME: "Milady canary",
        ELECTROBUN_BUILD_DIR: tempDir,
      }),
    ).toBe(canaryBundle);
  });
});

describe("resolveBundleLayout", () => {
  it("uses macOS app bundle paths", () => {
    expect(resolveBundleLayout("/tmp/Milady.app", "macos")).toEqual({
      binaryDir: "/tmp/Milady.app/Contents/MacOS",
      resourcesDir: "/tmp/Milady.app/Contents/Resources",
    });
  });

  it("uses bin/resources for non-mac wrappers", () => {
    expect(resolveBundleLayout("/tmp/Milady", "linux")).toEqual({
      binaryDir: "/tmp/Milady/bin",
      resourcesDir: "/tmp/Milady/resources",
    });
  });
});

describe("resolveDiagnosticsOutputPath", () => {
  it("writes into ELECTROBUN_BUILD_DIR when available", () => {
    expect(
      resolveDiagnosticsOutputPath("/tmp/Milady.app", {
        ELECTROBUN_BUILD_DIR: "/tmp/build",
      }),
    ).toBe("/tmp/build/wrapper-diagnostics.json");
  });

  it("falls back to the wrapper parent directory", () => {
    expect(resolveDiagnosticsOutputPath("/tmp/build/Milady.app", {})).toBe(
      "/tmp/build/wrapper-diagnostics.json",
    );
  });
});

describe("collectSizeDiagnostics", () => {
  it("reports notable bundle paths and largest files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-size-"));
    const bundlePath = path.join(tempDir, "Milady.app");
    const binaryDir = path.join(bundlePath, "Contents", "MacOS");
    const resourcesDir = path.join(bundlePath, "Contents", "Resources");
    const rendererVrmsDir = path.join(resourcesDir, "app", "renderer", "vrms");
    const nodeModulesDir = path.join(
      resourcesDir,
      "app",
      "milady-dist",
      "node_modules",
    );

    fs.mkdirSync(binaryDir, { recursive: true });
    fs.mkdirSync(rendererVrmsDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    fs.writeFileSync(path.join(binaryDir, "launcher"), "12345");
    fs.writeFileSync(
      path.join(rendererVrmsDir, "milady-1.vrm"),
      Buffer.alloc(64, 1),
    );
    fs.writeFileSync(
      path.join(nodeModulesDir, "addon.node"),
      Buffer.alloc(32, 2),
    );

    const diagnostics = collectSizeDiagnostics(bundlePath, binaryDir, resourcesDir);

    expect(diagnostics.bundleBytes).toBeGreaterThan(0);
    expect(diagnostics.binaryDirBytes).toBeGreaterThan(0);
    expect(diagnostics.resourcesDirBytes).toBeGreaterThan(0);
    expect(diagnostics.notablePaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "Contents/Resources/app/milady-dist/node_modules",
        }),
        expect.objectContaining({
          path: "Contents/Resources/app/renderer/vrms",
        }),
      ]),
    );
    expect(diagnostics.largestFiles[0]).toEqual(
      expect.objectContaining({
        path: "Contents/Resources/app/renderer/vrms/milady-1.vrm",
      }),
    );
    expect(diagnostics.appChildren).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "Contents/Resources/app/renderer",
        }),
        expect.objectContaining({
          path: "Contents/Resources/app/milady-dist",
        }),
      ]),
    );
  });
});

describe("collectArchiveReports", () => {
  it("probes specific archive entries without needing a full tar listing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-archive-"));
    const bundlePath = path.join(tempDir, "Milady-canary.app");
    const resourcesDir = path.join(bundlePath, "Contents", "Resources");
    const binaryDir = path.join(bundlePath, "Contents", "MacOS");
    const stagedArchivePath = path.join(tempDir, "resources.tar.zst");
    const archivePath = path.join(resourcesDir, "resources.tar.zst");

    fs.mkdirSync(binaryDir, { recursive: true });
    fs.mkdirSync(path.join(resourcesDir, "app", "bun"), { recursive: true });
    fs.writeFileSync(path.join(binaryDir, "libwebgpu_dawn.dylib"), "dawn");
    fs.writeFileSync(path.join(binaryDir, "bun"), "bun");
    fs.writeFileSync(path.join(resourcesDir, "main.js"), "main");
    fs.writeFileSync(path.join(resourcesDir, "app", "bun", "index.js"), "index");

    execFileSync(
      "tar",
      ["--zstd", "-cf", stagedArchivePath, "-C", tempDir, "Milady-canary.app"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    fs.rmSync(bundlePath, { force: true, recursive: true });
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.copyFileSync(stagedArchivePath, archivePath);

    const reports = collectArchiveReports(resourcesDir);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        containsWgpuDawn: true,
        path: archivePath,
        sampleEntries: expect.arrayContaining([
          "Milady-canary.app/Contents/MacOS/libwebgpu_dawn.dylib",
          "Milady-canary.app/Contents/Resources/main.js",
        ]),
      }),
    );
  });
});
