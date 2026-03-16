import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCodesignArgs,
  buildDirectLauncherCompileArgs,
  classifyMachOKind,
  isRetryableCodesignFailure,
  parseLauncherArchitectures,
  resolveBuildBundlePath,
  resolveRuntimeNodeModulesPath,
  shouldConsiderForCodesign,
  signBuildBundleArtifacts,
} from "../../scripts/postwrap-sign-runtime-macos";

describe("classifyMachOKind", () => {
  it("classifies Mach-O executables and libraries", () => {
    expect(classifyMachOKind("Mach-O 64-bit executable arm64")).toBe(
      "executable",
    );
    expect(classifyMachOKind("Mach-O 64-bit bundle arm64")).toBe("library");
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

describe("buildCodesignArgs", () => {
  it("adds hardened runtime only for executables", () => {
    expect(
      buildCodesignArgs(
        "executable",
        "Developer ID Application: Test",
        "/tmp/helper",
      ),
    ).toEqual([
      "--force",
      "--timestamp",
      "--sign",
      "Developer ID Application: Test",
      "--options",
      "runtime",
      "/tmp/helper",
    ]);

    expect(
      buildCodesignArgs(
        "library",
        "Developer ID Application: Test",
        "/tmp/addon.node",
      ),
    ).toEqual([
      "--force",
      "--timestamp",
      "--sign",
      "Developer ID Application: Test",
      "/tmp/addon.node",
    ]);
  });
});

describe("isRetryableCodesignFailure", () => {
  it("retries timestamp service outages", () => {
    expect(
      isRetryableCodesignFailure("The timestamp service is not available."),
    ).toBe(true);
    expect(
      isRetryableCodesignFailure("codesign: resource envelope is obsolete"),
    ).toBe(false);
  });
});

describe("resolveRuntimeNodeModulesPath", () => {
  it("resolves the matching build bundle from ELECTROBUN_BUILD_DIR", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "postwrap-sign-"));
    const stableBundle = path.join(tempDir, "Milady.app");
    const canaryBundle = path.join(tempDir, "Milady canary.app");
    fs.mkdirSync(stableBundle, { recursive: true });
    fs.mkdirSync(canaryBundle, { recursive: true });

    expect(
      resolveBuildBundlePath({
        ELECTROBUN_BUILD_DIR: tempDir,
        ELECTROBUN_OS: "macos",
        ELECTROBUN_APP_NAME: "Milady-canary",
      }),
    ).toBe(canaryBundle);
  });

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
      path.join(
        appBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
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
      path.join(
        stableBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
      { recursive: true },
    );
    fs.mkdirSync(
      path.join(
        canaryBundle,
        "Contents",
        "Resources",
        "app",
        "milady-dist",
        "node_modules",
      ),
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
    expect(resolveRuntimeNodeModulesPath(["/tmp/milady-dist"], {})).toBe(
      "/tmp/milady-dist/node_modules",
    );
  });

  it("accepts an explicit dist/node_modules path for pre-wrap signing", () => {
    expect(resolveRuntimeNodeModulesPath(["/tmp/dist/node_modules"], {})).toBe(
      "/tmp/dist/node_modules",
    );
  });
});

describe("parseLauncherArchitectures", () => {
  it("preserves the packaged launcher architecture list", () => {
    expect(parseLauncherArchitectures("x86_64 arm64")).toEqual([
      "x86_64",
      "arm64",
    ]);
  });

  it("rejects unsupported launcher architectures", () => {
    expect(() => parseLauncherArchitectures("arm64 ppc64")).toThrow(
      "runtime-sign: unsupported launcher architecture: ppc64",
    );
  });
});

describe("buildDirectLauncherCompileArgs", () => {
  it("builds clang args for every packaged launcher architecture", () => {
    expect(
      buildDirectLauncherCompileArgs(
        "/tmp/macos-direct-launcher.c",
        "/tmp/out/launcher",
        ["arm64", "x86_64"],
      ),
    ).toEqual([
      "-O2",
      "-Wall",
      "-Wextra",
      "-arch",
      "arm64",
      "-arch",
      "x86_64",
      "-mmacosx-version-min=11.0",
      "/tmp/macos-direct-launcher.c",
      "-o",
      "/tmp/out/launcher",
    ]);
  });
});

describe("signBuildBundleArtifacts", () => {
  it("rebuilds the launcher before nested runtime signing and signs it last", () => {
    const calls: string[] = [];

    const signedCount = signBuildBundleArtifacts(
      "/tmp/Milady.app",
      "/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules",
      "Developer ID Application: Test",
      {
        installDirectLauncher: (bundlePath) => {
          calls.push(`install:${bundlePath}`);
          return `${bundlePath}/Contents/MacOS/launcher`;
        },
        collectNativeCandidates: (runtimeNodeModulesPath) => {
          calls.push(`collect:${runtimeNodeModulesPath}`);
          return ["/tmp/addon.node"];
        },
        signRuntimeFile: (filePath, developerId) => {
          calls.push(`sign:${filePath}:${developerId}`);
          return true;
        },
      },
    );

    expect(signedCount).toBe(1);
    expect(calls).toEqual([
      "install:/tmp/Milady.app",
      "collect:/tmp/Milady.app/Contents/Resources/app/milady-dist/node_modules",
      "sign:/tmp/addon.node:Developer ID Application: Test",
      "sign:/tmp/Milady.app/Contents/MacOS/launcher:Developer ID Application: Test",
    ]);
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
