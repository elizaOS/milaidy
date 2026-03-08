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

function collectArchiveReports(resourcesDir: string): ArchiveReport[] {
  if (!fs.existsSync(resourcesDir)) {
    return [];
  }

  return fs
    .readdirSync(resourcesDir)
    .filter((entry) => entry.endsWith(".tar.zst"))
    .map((entry) => path.join(resourcesDir, entry))
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
    wrapperBundlePath,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
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
