#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electrobunConfig from "../electrobun.config";
import {
  shouldApplyLocalAdhocSigning,
  signLocalAppBundle,
} from "./local-adhoc-sign-macos";

type BinaryReport = {
  exists: boolean;
  name: string;
  path: string;
  codesign?: string;
  file?: string;
  lipo?: string;
};

type ArchiveReport = {
  containsWgpuDawn: boolean;
  path: string;
  sampleEntries: string[];
};

type WrapperDiagnostics = {
  appName: string;
  arch: string;
  binaryDir: string;
  binaries: BinaryReport[];
  buildDir: string | null;
  generatedAt: string;
  os: string;
  outputPath: string;
  resourcesDir: string;
  resourceArchives: ArchiveReport[];
  wrapperBundlePath: string;
};

const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/;

function isPosixAbsolutePath(value: string): boolean {
  return value.startsWith("/") && !WINDOWS_ABS_PATH_RE.test(value);
}

function resolvePortablePath(value: string): string {
  return isPosixAbsolutePath(value) || WINDOWS_ABS_PATH_RE.test(value)
    ? value
    : path.resolve(value);
}

function joinPortable(base: string, ...parts: string[]): string {
  return isPosixAbsolutePath(base)
    ? path.posix.join(base, ...parts)
    : path.join(base, ...parts);
}

function dirnamePortable(value: string): string {
  return isPosixAbsolutePath(value)
    ? path.posix.dirname(value)
    : path.dirname(value);
}

function execText(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeBundleStem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveBuildBundlePath(env: NodeJS.ProcessEnv): string | null {
  const buildDir = env.ELECTROBUN_BUILD_DIR?.trim();
  if (!buildDir) {
    return null;
  }

  const resolvedBuildDir = path.resolve(buildDir);
  if (!fs.existsSync(resolvedBuildDir)) {
    return null;
  }

  const bundleCandidates = fs
    .readdirSync(resolvedBuildDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => joinPortable(resolvedBuildDir, entry.name));

  if (bundleCandidates.length === 0) {
    return null;
  }

  const wrapperPath = env.ELECTROBUN_WRAPPER_BUNDLE_PATH?.trim();
  if (wrapperPath) {
    const resolvedWrapperPath = resolvePortablePath(wrapperPath);
    if (fs.existsSync(resolvedWrapperPath)) {
      return resolvedWrapperPath;
    }
  }

  const appName = env.ELECTROBUN_APP_NAME?.trim();
  if (appName) {
    const normalizedAppName = normalizeBundleStem(appName);
    const matched = bundleCandidates.find((candidate) => {
      const stem = path.basename(candidate, path.extname(candidate));
      return normalizeBundleStem(stem) === normalizedAppName;
    });
    if (matched) {
      return matched;
    }
  }

  if (bundleCandidates.length === 1) {
    return bundleCandidates[0] ?? null;
  }

  return null;
}

export function resolveWrapperBundlePath(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitPath = args.find((arg) => arg.trim().length > 0);
  if (explicitPath) {
    return resolvePortablePath(explicitPath);
  }

  const wrapperBundlePath = env.ELECTROBUN_WRAPPER_BUNDLE_PATH?.trim();
  if (wrapperBundlePath) {
    return resolvePortablePath(wrapperBundlePath);
  }

  const buildBundlePath = resolveBuildBundlePath(env);
  if (buildBundlePath) {
    return buildBundlePath;
  }

  throw new Error(
    "postwrap-diagnostics: wrapper bundle path not provided and Electrobun did not expose one",
  );
}

export function resolveBundleLayout(
  bundlePath: string,
  osName: string,
): { binaryDir: string; resourcesDir: string } {
  if (osName === "macos") {
    return {
      binaryDir: joinPortable(bundlePath, "Contents", "MacOS"),
      resourcesDir: joinPortable(bundlePath, "Contents", "Resources"),
    };
  }

  return {
    binaryDir: joinPortable(bundlePath, "bin"),
    resourcesDir: joinPortable(bundlePath, "resources"),
  };
}

export function resolveDiagnosticsOutputPath(
  bundlePath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const buildDir = env.ELECTROBUN_BUILD_DIR?.trim();
  if (buildDir) {
    const resolvedBuildDir = resolvePortablePath(buildDir);
    return joinPortable(resolvedBuildDir, "wrapper-diagnostics.json");
  }
  return joinPortable(dirnamePortable(bundlePath), "wrapper-diagnostics.json");
}

function collectBinaryReport(
  binaryDir: string,
  fileName: string,
): BinaryReport {
  const filePath = joinPortable(binaryDir, fileName);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      name: fileName,
      path: filePath,
    };
  }

  const report: BinaryReport = {
    exists: true,
    name: fileName,
    path: filePath,
  };

  try {
    report.file = execText("file", ["-b", filePath]);
  } catch (error) {
    report.file = `file failed: ${(error as Error).message}`;
  }

  try {
    report.lipo = execText("lipo", ["-info", filePath]);
  } catch {
    // Not all files support lipo -info.
  }

  if (process.platform === "darwin") {
    try {
      report.codesign = execText("codesign", ["-dv", "--verbose=2", filePath]);
    } catch (error) {
      report.codesign = `codesign failed: ${(error as Error).message}`;
    }
  }

  return report;
}

function collectArchiveReports(resourcesDir: string): ArchiveReport[] {
  if (!fs.existsSync(resourcesDir)) {
    return [];
  }

  return fs
    .readdirSync(resourcesDir)
    .filter((entry) => entry.endsWith(".tar.zst"))
    .map((entry) => joinPortable(resourcesDir, entry))
    .sort()
    .map((archivePath) => {
      let sampleEntries: string[] = [];
      try {
        const listing = execText("tar", ["--zstd", "-tf", archivePath]);
        sampleEntries = listing
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 20);
        return {
          containsWgpuDawn: listing.includes("libwebgpu_dawn"),
          path: archivePath,
          sampleEntries,
        };
      } catch (error) {
        return {
          containsWgpuDawn: false,
          path: archivePath,
          sampleEntries: [`tar listing failed: ${(error as Error).message}`],
        };
      }
    });
}

export function main(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const osName = env.ELECTROBUN_OS?.trim() || process.platform;
  const arch = env.ELECTROBUN_ARCH?.trim() || process.arch;
  const wrapperBundlePath = resolveWrapperBundlePath(args, env);
  const { binaryDir, resourcesDir } = resolveBundleLayout(
    wrapperBundlePath,
    osName,
  );
  const outputPath = resolveDiagnosticsOutputPath(wrapperBundlePath, env);

  if (shouldApplyLocalAdhocSigning(env)) {
    signLocalAppBundle({
      appBundlePath: wrapperBundlePath,
      entitlements: electrobunConfig.build.mac.entitlements,
      expectedIdentifier: electrobunConfig.app.identifier,
    });
    console.log(
      `[postwrap-diagnostics] applied local ad-hoc signing for ${wrapperBundlePath}`,
    );
  }

  const binaryNames =
    osName === "macos"
      ? [
          "launcher",
          "bun",
          "libwebgpu_dawn.dylib",
          "libNativeWrapper.dylib",
          "zig-zstd",
          "bspatch",
        ]
      : osName === "win"
        ? ["launcher.exe", "bun.exe", "libwebgpu_dawn.dll", "bspatch.exe"]
        : [
            "launcher",
            "bun",
            "libwebgpu_dawn.so",
            "libNativeWrapper.so",
            "bspatch",
          ];

  const diagnostics: WrapperDiagnostics = {
    appName:
      env.ELECTROBUN_APP_NAME?.trim() || path.basename(wrapperBundlePath),
    arch,
    binaryDir,
    binaries: binaryNames.map((binaryName) =>
      collectBinaryReport(binaryDir, binaryName),
    ),
    buildDir: env.ELECTROBUN_BUILD_DIR?.trim() || null,
    generatedAt: new Date().toISOString(),
    os: osName,
    outputPath,
    resourcesDir,
    resourceArchives: collectArchiveReports(resourcesDir),
    wrapperBundlePath,
  };

  fs.mkdirSync(dirnamePortable(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`);

  console.log(
    `[postwrap-diagnostics] wrote ${outputPath} (${diagnostics.os}/${diagnostics.arch})`,
  );
  for (const binary of diagnostics.binaries) {
    if (!binary.exists) {
      console.log(`[postwrap-diagnostics] missing ${binary.name}`);
      continue;
    }
    const summary = [binary.file, binary.lipo].filter(Boolean).join(" | ");
    console.log(`[postwrap-diagnostics] ${binary.name}: ${summary}`);
  }
  for (const archive of diagnostics.resourceArchives) {
    console.log(
      `[postwrap-diagnostics] archive ${path.basename(archive.path)} contains libwebgpu_dawn=${archive.containsWgpuDawn}`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
