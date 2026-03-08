import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyMachOKind,
  resolveRuntimeNodeModulesPath,
  shouldConsiderForCodesign,
} from "../../scripts/postwrap-sign-runtime-macos";

describe("classifyMachOKind", () => {
  it("classifies Mach-O executables and libraries", () => {
    expect(
      classifyMachOKind("Mach-O 64-bit executable arm64"),
    ).toBe("executable");
    expect(
      classifyMachOKind("Mach-O 64-bit bundle arm64"),
    ).toBe("library");
    expect(
      classifyMachOKind(
        "Mach-O 64-bit dynamically linked shared library arm64",
      ),
    ).toBe("library");
  });

  it("ignores non-Mach-O files", () => {
    expect(classifyMachOKind("ELF 64-bit LSB shared object")).toBeNull();
    expect(classifyMachOKind("ASCII text")).toBeNull();
  });
});

describe("resolveRuntimeNodeModulesPath", () => {
  it("accepts an explicit runtime node_modules path", () => {
    expect(
      resolveRuntimeNodeModulesPath(
        ["/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules"],
        {},
      ),
    ).toBe("/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules");
  });

  it("derives the runtime node_modules path from the wrapped app bundle", () => {
    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_WRAPPER_BUNDLE_PATH: "/tmp/Milady.app",
      }),
    ).toBe("/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules");
  });

  it("derives the runtime node_modules path from the postBuild bundle in ELECTROBUN_BUILD_DIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const appBundle = path.join(tempDir, "Milady canary.app");
    fs.mkdirSync(
      path.join(appBundle, "Contents", "Resources", "app", "milady-dist", "node_modules"),
      { recursive: true },
    );

    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "macos",
      }),
    ).toBe(
      path.join(
        appBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
    );
  });

  it("matches the correct app bundle in ELECTROBUN_BUILD_DIR using ELECTROBUN_APP_NAME", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const stableBundle = path.join(tempDir, "Milady.app");
    const canaryBundle = path.join(tempDir, "Milady canary.app");
    fs.mkdirSync(
      path.join(stableBundle, "Contents", "Resources", "app", "milady-dist", "node_modules"),
      { recursive: true },
    );
    fs.mkdirSync(
      path.join(canaryBundle, "Contents", "Resources", "app", "milady-dist", "node_modules"),
      { recursive: true },
    );

    expect(
      resolveRuntimeNodeModulesPath([], {
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "macos",
        ELECTROBUN_APP_NAME: "Milady-canary",
      }),
    ).toBe(
      path.join(
        canaryBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
    );
  });

  it("accepts a milady-dist directory and appends node_modules", () => {
    expect(
      resolveRuntimeNodeModulesPath(["/tmp/milady-dist"], {}),
    ).toBe("/tmp/milady-dist/node_modules");
  });

  it("accepts an explicit dist/node_modules path for pre-wrap signing", () => {
    expect(
      resolveRuntimeNodeModulesPath(["/tmp/dist/node_modules"], {}),
    ).toBe("/tmp/dist/node_modules");
  });
});

describe("shouldConsiderForCodesign", () => {
  it("keeps known native extensions even without executable bits", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const nativeModule = path.join(tempDir, "addon.node");
    fs.writeFileSync(nativeModule, "binary");
    const stats = fs.statSync(nativeModule);

    expect(shouldConsiderForCodesign(nativeModule, stats)).toBe(true);
  });

  it("keeps executable files without native extensions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const helperBinary = path.join(tempDir, "spawn-helper");
    fs.writeFileSync(helperBinary, "#!/bin/sh\n");
    fs.chmodSync(helperBinary, 0o755);
    const stats = fs.statSync(helperBinary);

    expect(shouldConsiderForCodesign(helperBinary, stats)).toBe(true);
  });

  it("keeps known native helpers even when package mode bits are wrong", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const helperBinary = path.join(
      tempDir,
      "node-pty",
      "prebuilds",
      "darwin-arm64",
      "spawn-helper",
    );
    fs.mkdirSync(path.dirname(helperBinary), { recursive: true });
    fs.writeFileSync(helperBinary, "binary");
    fs.chmodSync(helperBinary, 0o644);
    const stats = fs.statSync(helperBinary);

    expect(shouldConsiderForCodesign(helperBinary, stats)).toBe(true);
  });

  it("skips regular non-native files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const textFile = path.join(tempDir, "README.txt");
    fs.writeFileSync(textFile, "hello");
    const stats = fs.statSync(textFile);

    expect(shouldConsiderForCodesign(textFile, stats)).toBe(false);
  });
});
