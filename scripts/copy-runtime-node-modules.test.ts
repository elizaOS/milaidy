import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getRuntimeDependencies,
  getRuntimeDependencyEntries,
  inferVersionFromBunEntryPath,
  isExactVersionSpecifier,
  isPackageCompatibleWithCurrentPlatform,
  matchesRuntimeVariant,
  normalizeResolvedPackage,
  selectCopyTargetNodeModules,
  selectResolvedCandidate,
  shouldCopyPackageEntry,
  shouldKeepPackageRelativePath,
} from "./copy-runtime-node-modules";

describe("inferVersionFromBunEntryPath", () => {
  it("extracts versions from scoped Bun store paths", () => {
    const packageDir = path.join(
      "/tmp",
      "repo",
      "node_modules",
      ".bun",
      "@elizaos+core@2.0.0-alpha.12+60549e3a9e4e4118",
      "node_modules",
      "@elizaos",
      "core",
    );

    expect(inferVersionFromBunEntryPath(packageDir)).toBe("2.0.0-alpha.12");
  });

  it("extracts versions from unscoped Bun store paths", () => {
    const packageDir = path.join(
      "/tmp",
      "repo",
      "node_modules",
      ".bun",
      "node-llama-cpp@3.17.1",
      "node_modules",
      "node-llama-cpp",
    );

    expect(inferVersionFromBunEntryPath(packageDir)).toBe("3.17.1");
  });

  it("returns null for non-Bun paths", () => {
    expect(
      inferVersionFromBunEntryPath("/tmp/repo/packages/plugin-streaming-base"),
    ).toBeNull();
  });
});

describe("getRuntimeDependencies", () => {
  it("keeps runtime helpers like tslib while skipping toolchain-only deps", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-dependencies-test-"),
    );
    const packageJsonPath = path.join(tempDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        dependencies: {
          "discord.js": "^14.18.0",
          tslib: "^2.6.3",
          typescript: "^5.8.0",
        },
        optionalDependencies: {
          "@types/node": "^24.0.0",
        },
      }),
    );

    expect(getRuntimeDependencies(packageJsonPath)).toEqual([
      "discord.js",
      "tslib",
    ]);
  });

  it("preserves dependency version specs for downstream resolution", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-dependencies-test-"),
    );
    const packageJsonPath = path.join(tempDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        dependencies: {
          ethers: "6.16.0",
          "@noble/hashes": "1.3.2",
        },
        optionalDependencies: {
          tslib: "^2.6.3",
        },
      }),
    );

    expect(getRuntimeDependencyEntries(packageJsonPath)).toEqual([
      { name: "@noble/hashes", spec: "1.3.2" },
      { name: "ethers", spec: "6.16.0" },
      { name: "tslib", spec: "^2.6.3" },
    ]);
  });

  it("includes required peer dependencies while skipping optional peers", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-dependencies-test-"),
    );
    const packageJsonPath = path.join(tempDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        dependencies: {
          "coding-agent-adapters": "0.12.0",
        },
        peerDependencies: {
          "@elizaos/core": ">=2.0.0-alpha.0",
          "git-workspace-service": "0.4.4",
          "pty-manager": "1.9.5",
          "@octokit/rest": "^20.0.0",
        },
        peerDependenciesMeta: {
          "@octokit/rest": {
            optional: true,
          },
        },
      }),
    );

    expect(getRuntimeDependencyEntries(packageJsonPath)).toEqual([
      { name: "@elizaos/core", spec: ">=2.0.0-alpha.0" },
      { name: "coding-agent-adapters", spec: "0.12.0" },
      { name: "git-workspace-service", spec: "0.4.4" },
      { name: "pty-manager", spec: "1.9.5" },
    ]);
  });
});

describe("isExactVersionSpecifier", () => {
  it("detects exact semver pins", () => {
    expect(isExactVersionSpecifier("1.3.2")).toBe(true);
    expect(isExactVersionSpecifier("2.0.0-alpha.12")).toBe(true);
  });

  it("rejects ranges and workspace specs", () => {
    expect(isExactVersionSpecifier("^1.3.2")).toBe(false);
    expect(isExactVersionSpecifier("workspace:*")).toBe(false);
    expect(isExactVersionSpecifier(null)).toBe(false);
  });
});

describe("selectResolvedCandidate", () => {
  it("prefers the exact installed version requested by the parent package", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-dependencies-test-"),
    );
    const newerDir = path.join(tempDir, "newer");
    const exactDir = path.join(tempDir, "exact");
    const newerPkg = path.join(newerDir, "package.json");
    const exactPkg = path.join(exactDir, "package.json");

    fs.mkdirSync(newerDir, { recursive: true });
    fs.mkdirSync(exactDir, { recursive: true });
    fs.writeFileSync(newerPkg, JSON.stringify({ version: "2.0.1" }));
    fs.writeFileSync(exactPkg, JSON.stringify({ version: "1.3.2" }));

    expect(
      selectResolvedCandidate(
        [
          { sourceDir: newerDir, packageJsonPath: newerPkg },
          { sourceDir: exactDir, packageJsonPath: exactPkg },
        ],
        "1.3.2",
      ),
    ).toEqual({
      sourceDir: exactDir,
      packageJsonPath: exactPkg,
    });
  });
});

describe("selectCopyTargetNodeModules", () => {
  it("always uses the top-level node_modules for root runtime imports", () => {
    const targetNodeModules = "/tmp/app/dist/node_modules";

    expect(
      selectCopyTargetNodeModules({
        name: "discord.js",
        requesterDestDir: "/tmp/app/dist",
        rootDestDir: "/tmp/app/dist",
        targetNodeModules,
        topLevelVersions: new Map(),
        resolvedVersion: "14.18.0",
      }),
    ).toBe(targetNodeModules);
  });

  it("reuses the top-level copy when the requested version already matches", () => {
    const targetNodeModules = "/tmp/app/dist/node_modules";

    expect(
      selectCopyTargetNodeModules({
        name: "discord-api-types",
        requesterDestDir: "/tmp/app/dist/node_modules/@discordjs/builders",
        rootDestDir: "/tmp/app/dist",
        targetNodeModules,
        topLevelVersions: new Map([["discord-api-types", "0.38.40"]]),
        resolvedVersion: "0.38.40",
      }),
    ).toBe(targetNodeModules);
  });

  it("promotes the first transitive package copy to the top level", () => {
    expect(
      selectCopyTargetNodeModules({
        name: "discord-api-types",
        requesterDestDir: "/tmp/app/dist/node_modules/@discordjs/builders",
        rootDestDir: "/tmp/app/dist",
        targetNodeModules: "/tmp/app/dist/node_modules",
        topLevelVersions: new Map(),
        resolvedVersion: "0.38.40",
      }),
    ).toBe("/tmp/app/dist/node_modules");
  });

  it("keeps a package-local override when a child resolves a different version", () => {
    expect(
      selectCopyTargetNodeModules({
        name: "discord-api-types",
        requesterDestDir: "/tmp/app/dist/node_modules/@discordjs/builders",
        rootDestDir: "/tmp/app/dist",
        targetNodeModules: "/tmp/app/dist/node_modules",
        topLevelVersions: new Map([["discord-api-types", "0.37.120"]]),
        resolvedVersion: "0.38.40",
      }),
    ).toBe("/tmp/app/dist/node_modules/@discordjs/builders/node_modules");
  });

  it("always hoists @elizaos/core to the top level once present", () => {
    expect(
      selectCopyTargetNodeModules({
        name: "@elizaos/core",
        requesterDestDir: "/tmp/app/dist/node_modules/@elizaos/plugin-ollama",
        rootDestDir: "/tmp/app/dist",
        targetNodeModules: "/tmp/app/dist/node_modules",
        topLevelVersions: new Map([["@elizaos/core", "2.0.0-alpha.12"]]),
        resolvedVersion: "2.0.0-alpha.3",
      }),
    ).toBe("/tmp/app/dist/node_modules");
  });
});

describe("shouldCopyPackageEntry", () => {
  it("skips nested node_modules folders", () => {
    expect(shouldCopyPackageEntry("/tmp/pkg/node_modules")).toBe(false);
  });

  it("skips broken symlinks from the Bun store", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-copy-entry-test-"),
    );
    const brokenLink = path.join(tempDir, "broken-link");

    fs.symlinkSync("../missing-target", brokenLink);

    expect(shouldCopyPackageEntry(brokenLink)).toBe(false);
  });

  it("keeps valid package files", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-copy-entry-test-"),
    );
    const manifest = path.join(tempDir, "package.json");

    fs.writeFileSync(manifest, "{}");

    expect(shouldCopyPackageEntry(manifest)).toBe(true);
  });
});

describe("normalizeResolvedPackage", () => {
  it("realpaths symlinked package dirs before dependency traversal", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-resolved-package-test-"),
    );
    const realPackageDir = path.join(tempDir, "real", "pkg");
    const symlinkPackageDir = path.join(tempDir, "linked", "pkg");

    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.mkdirSync(path.dirname(symlinkPackageDir), { recursive: true });
    fs.writeFileSync(
      path.join(realPackageDir, "package.json"),
      JSON.stringify({ name: "pkg", version: "1.0.0" }),
    );
    fs.symlinkSync(realPackageDir, symlinkPackageDir, "dir");
    const normalizedRealPackageDir = fs.realpathSync.native(realPackageDir);

    expect(normalizeResolvedPackage(symlinkPackageDir)).toEqual({
      sourceDir: normalizedRealPackageDir,
      packageJsonPath: path.join(normalizedRealPackageDir, "package.json"),
    });
  });
});

describe("isPackageCompatibleWithCurrentPlatform", () => {
  it("skips packages pinned to a different operating system", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-platform-test-"),
    );
    const packageJsonPath = path.join(tempDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: "@img/sharp-win32-x64",
        version: "1.0.0",
        os: ["win32"],
        cpu: ["x64"],
      }),
    );

    expect(isPackageCompatibleWithCurrentPlatform(packageJsonPath)).toBe(false);
  });

  it("keeps packages that match the current host platform", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-platform-test-"),
    );
    const packageJsonPath = path.join(tempDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: `@img/sharp-${process.platform}-${process.arch}`,
        version: "1.0.0",
        os: [process.platform],
        cpu: [process.arch],
      }),
    );

    expect(isPackageCompatibleWithCurrentPlatform(packageJsonPath)).toBe(true);
  });
});

describe("matchesRuntimeVariant", () => {
  it("matches macOS arm64 aliases", () => {
    expect(matchesRuntimeVariant("darwin-arm64", "darwin", "arm64")).toBe(true);
    expect(matchesRuntimeVariant("mac-arm64-metal", "darwin", "arm64")).toBe(
      true,
    );
    expect(matchesRuntimeVariant("darwin-universal2", "darwin", "arm64")).toBe(
      true,
    );
  });

  it("rejects mismatched operating systems and architectures", () => {
    expect(matchesRuntimeVariant("darwin-x64", "darwin", "arm64")).toBe(false);
    expect(matchesRuntimeVariant("ios-x64-simulator", "darwin", "arm64")).toBe(
      false,
    );
    expect(matchesRuntimeVariant("freebsd_arm64", "darwin", "arm64")).toBe(
      false,
    );
    expect(matchesRuntimeVariant("musl_arm64", "darwin", "arm64")).toBe(false);
    expect(matchesRuntimeVariant("win32-x64", "darwin", "arm64")).toBe(false);
  });
});

describe("shouldKeepPackageRelativePath", () => {
  const targetOS = "darwin";
  const targetArch = "arm64";

  it("prunes non-target prebuilds while keeping the active variant", () => {
    expect(
      shouldKeepPackageRelativePath(
        "prebuilds/darwin-arm64/pty.node",
        targetOS,
        targetArch,
      ),
    ).toBe(true);
    expect(
      shouldKeepPackageRelativePath(
        "prebuilds/darwin-x64/pty.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
    expect(
      shouldKeepPackageRelativePath(
        "prebuilds/ios-x64-simulator/bare-fs.bare",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
  });

  it("prunes non-target napi-v3 runtime trees", () => {
    expect(
      shouldKeepPackageRelativePath(
        "bin/napi-v3/darwin/arm64/onnxruntime_binding.node",
        targetOS,
        targetArch,
      ),
    ).toBe(true);
    expect(
      shouldKeepPackageRelativePath(
        "bin/napi-v3/darwin/x64/onnxruntime_binding.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
    expect(
      shouldKeepPackageRelativePath(
        "bin/napi-v3/linux/x64/onnxruntime_binding.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
  });

  it("prunes non-target koffi and bins runtime directories", () => {
    expect(
      shouldKeepPackageRelativePath(
        "build/koffi/darwin_arm64/koffi.node",
        targetOS,
        targetArch,
      ),
    ).toBe(true);
    expect(
      shouldKeepPackageRelativePath(
        "build/koffi/darwin_x64/koffi.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
    expect(
      shouldKeepPackageRelativePath(
        "build/koffi/freebsd_arm64/koffi.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
    expect(
      shouldKeepPackageRelativePath(
        "build/koffi/musl_arm64/koffi.node",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
    expect(
      shouldKeepPackageRelativePath(
        "bins/mac-arm64-metal/libllama.dylib",
        targetOS,
        targetArch,
      ),
    ).toBe(true);
    expect(
      shouldKeepPackageRelativePath(
        "bins/mac-x64-metal/libllama.dylib",
        targetOS,
        targetArch,
      ),
    ).toBe(false);
  });
});
