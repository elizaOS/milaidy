#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type SizeEntry = {
  bytes: number;
  path: string;
};

type SizeDiagnostics = {
  appChildren: SizeEntry[];
  binaryDirBytes: number;
  bundleBytes: number;
  largestFiles: SizeEntry[];
  notablePaths: SizeEntry[];
  resourcesDirBytes: number;
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
  sizes: SizeDiagnostics;
  wrapperBundlePath: string;
};

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
    .map((entry) => path.join(resolvedBuildDir, entry.name));

  if (bundleCandidates.length === 0) {
    return null;
  }

  const wrapperPath = env.ELECTROBUN_WRAPPER_BUNDLE_PATH?.trim();
  if (wrapperPath) {
    const resolvedWrapperPath = path.resolve(wrapperPath);
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
    return path.resolve(explicitPath);
  }

  const wrapperBundlePath = env.ELECTROBUN_WRAPPER_BUNDLE_PATH?.trim();
  if (wrapperBundlePath) {
    return path.resolve(wrapperBundlePath);
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
      binaryDir: path.join(bundlePath, "Contents", "MacOS"),
      resourcesDir: path.join(bundlePath, "Contents", "Resources"),
    };
  }

  return {
    binaryDir: path.join(bundlePath, "bin"),
    resourcesDir: path.join(bundlePath, "resources"),
  };
}

export function resolveDiagnosticsOutputPath(
  bundlePath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const buildDir = env.ELECTROBUN_BUILD_DIR?.trim();
  if (buildDir) {
    return path.join(path.resolve(buildDir), "wrapper-diagnostics.json");
  }
  return path.join(path.dirname(bundlePath), "wrapper-diagnostics.json");
}

function collectBinaryReport(
  binaryDir: string,
  fileName: string,
): BinaryReport {
  const filePath = path.join(binaryDir, fileName);
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

function resolveArchiveProbeEntries(resourcesDir: string): string[] {
  const bundlePath =
    path.basename(resourcesDir) === "Resources" &&
    path.basename(path.dirname(resourcesDir)) === "Contents"
      ? path.dirname(path.dirname(resourcesDir))
      : path.dirname(resourcesDir);
  const bundleName = path.basename(bundlePath);
  const relativeProbeEntries = [
    "Contents/MacOS/libwebgpu_dawn.dylib",
    "Contents/MacOS/bun",
    "Contents/Resources/main.js",
    "Contents/Resources/app/bun/index.js",
    "bin/libwebgpu_dawn.so",
    "bin/libwebgpu_dawn.dll",
    "bin/bun",
    "bin/bun.exe",
    "resources/main.js",
    "resources/app/bun/index.js",
  ];

  return [
    ...new Set(
      [...relativeProbeEntries, ...relativeProbeEntries.map((entry) => path.posix.join(bundleName, entry))].map(
        (entry) => entry.replaceAll("\\", "/"),
      ),
    ),
  ];
}

function listArchiveProbeMatches(
  archivePath: string,
  probeEntry: string,
): string[] {
  try {
    return execText("tar", ["--zstd", "-tf", archivePath, probeEntry])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function collectArchiveReports(resourcesDir: string): ArchiveReport[] {
  if (!fs.existsSync(resourcesDir)) {
    return [];
  }

  const probeEntries = resolveArchiveProbeEntries(resourcesDir);
  return fs
    .readdirSync(resourcesDir)
    .filter((entry) => entry.endsWith(".tar.zst"))
    .map((entry) => path.join(resourcesDir, entry))
    .sort()
    .map((archivePath) => {
      const sampleEntries = probeEntries
        .flatMap((probeEntry) => listArchiveProbeMatches(archivePath, probeEntry))
        .filter((entry, index, all) => all.indexOf(entry) === index)
        .slice(0, 20);

      return {
        containsWgpuDawn: sampleEntries.some((entry) =>
          entry.includes("libwebgpu_dawn"),
        ),
        path: archivePath,
        sampleEntries:
          sampleEntries.length > 0
            ? sampleEntries
            : probeEntries
                .slice(0, 6)
                .map((probeEntry) => `probe miss: ${probeEntry}`),
      };
    });
}

function toRelativePath(rootPath: string, targetPath: string): string {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function getPathSizeBytes(targetPath: string): number {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(targetPath);
  } catch {
    return 0;
  }

  if (stats.isSymbolicLink()) {
    return 0;
  }

  if (stats.isFile()) {
    return stats.size;
  }

  if (!stats.isDirectory()) {
    return 0;
  }

  let total = 0;
  for (const entry of fs.readdirSync(targetPath)) {
    total += getPathSizeBytes(path.join(targetPath, entry));
  }
  return total;
}

function collectImmediateChildSizes(
  parentPath: string,
  rootPath: string,
): SizeEntry[] {
  if (!fs.existsSync(parentPath)) {
    return [];
  }

  return fs
    .readdirSync(parentPath, { withFileTypes: true })
    .map((entry) => path.join(parentPath, entry.name))
    .map((entryPath) => ({
      bytes: getPathSizeBytes(entryPath),
      path: toRelativePath(rootPath, entryPath),
    }))
    .filter((entry) => entry.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes);
}

function collectLargestFiles(
  rootPath: string,
  limit = 12,
): SizeEntry[] {
  const files: SizeEntry[] = [];

  const visit = (currentPath: string): void => {
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch {
      return;
    }

    if (stats.isSymbolicLink()) {
      return;
    }

    if (stats.isFile()) {
      files.push({
        bytes: stats.size,
        path: toRelativePath(rootPath, currentPath),
      });
      return;
    }

    if (!stats.isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(currentPath)) {
      visit(path.join(currentPath, entry));
    }
  };

  visit(rootPath);

  return files.sort((left, right) => right.bytes - left.bytes).slice(0, limit);
}

export function collectSizeDiagnostics(
  bundlePath: string,
  binaryDir: string,
  resourcesDir: string,
): SizeDiagnostics {
  const appRoot = path.join(resourcesDir, "app");
  const notableCandidates = [
    binaryDir,
    resourcesDir,
    appRoot,
    path.join(appRoot, "milady-dist"),
    path.join(appRoot, "milady-dist", "node_modules"),
    path.join(appRoot, "renderer"),
    path.join(appRoot, "renderer", "assets"),
    path.join(appRoot, "renderer", "vrms"),
  ]
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => fs.existsSync(candidate));

  return {
    appChildren: collectImmediateChildSizes(appRoot, bundlePath).slice(0, 12),
    binaryDirBytes: getPathSizeBytes(binaryDir),
    bundleBytes: getPathSizeBytes(bundlePath),
    largestFiles: collectLargestFiles(bundlePath, 15),
    notablePaths: notableCandidates
      .map((candidate) => ({
        bytes: getPathSizeBytes(candidate),
        path: toRelativePath(bundlePath, candidate),
      }))
      .filter((entry) => entry.bytes > 0)
      .sort((left, right) => right.bytes - left.bytes),
    resourcesDirBytes: getPathSizeBytes(resourcesDir),
  };
}

function main(): void {
  const env = process.env;
  const osName = env.ELECTROBUN_OS?.trim() || process.platform;
  const arch = env.ELECTROBUN_ARCH?.trim() || process.arch;
  const wrapperBundlePath = resolveWrapperBundlePath([], env);
  const { binaryDir, resourcesDir } = resolveBundleLayout(
    wrapperBundlePath,
    osName,
  );
  const outputPath = resolveDiagnosticsOutputPath(wrapperBundlePath, env);
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
    sizes: collectSizeDiagnostics(wrapperBundlePath, binaryDir, resourcesDir),
    wrapperBundlePath,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`);

  console.log(
    `[postwrap-diagnostics] wrote ${outputPath} (${diagnostics.os}/${diagnostics.arch})`,
  );
  console.log(
    `[postwrap-diagnostics] bundle size ${formatBytes(diagnostics.sizes.bundleBytes)} | resources ${formatBytes(diagnostics.sizes.resourcesDirBytes)} | binaries ${formatBytes(diagnostics.sizes.binaryDirBytes)}`,
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
  for (const entry of diagnostics.sizes.notablePaths.slice(0, 6)) {
    console.log(
      `[postwrap-diagnostics] size ${entry.path}: ${formatBytes(entry.bytes)}`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
