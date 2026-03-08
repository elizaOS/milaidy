import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
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
