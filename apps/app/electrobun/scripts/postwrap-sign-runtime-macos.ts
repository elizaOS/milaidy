#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type MachOKind = "executable" | "library" | null;

const NATIVE_EXTENSIONS = new Set([".bare", ".dylib", ".node", ".so"]);

export function classifyMachOKind(description: string): MachOKind {
  const normalized = description.toLowerCase();
  if (!normalized.includes("mach-o")) {
    return null;
  }
  if (normalized.includes("executable")) {
    return "executable";
  }
  if (
    normalized.includes("bundle") ||
    normalized.includes("shared library") ||
    normalized.includes("dynamically linked shared library") ||
    normalized.includes("dylib")
  ) {
    return "library";
  }
  return null;
}

function materializeRuntimePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (resolved.endsWith(".app")) {
    return path.join(
      resolved,
      "Contents",
      "Resources",
      "app",
      "milady-dist",
      "node_modules",
    );
  }
  if (path.basename(resolved) === "milady-dist") {
    return path.join(resolved, "node_modules");
  }
  return resolved;
}

export function resolveRuntimeNodeModulesPath(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitPath = args.find((arg) => arg.trim().length > 0);
  if (explicitPath) {
    return materializeRuntimePath(explicitPath);
  }

  const wrapperBundle = env.ELECTROBUN_WRAPPER_BUNDLE_PATH?.trim();
  if (wrapperBundle) {
    return materializeRuntimePath(wrapperBundle);
  }

  throw new Error(
    "postwrap-sign: runtime node_modules path not provided and ELECTROBUN_WRAPPER_BUNDLE_PATH is unset",
  );
}

export function shouldConsiderForCodesign(
  filePath: string,
  stats: Pick<fs.Stats, "isFile" | "mode">,
): boolean {
  if (!stats.isFile()) {
    return false;
  }

  if (NATIVE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }

  return (stats.mode & 0o111) !== 0;
}

function resolveDeveloperId(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicitIdentity = env.ELECTROBUN_DEVELOPER_ID?.trim();
  if (explicitIdentity) {
    return explicitIdentity;
  }

  try {
    const output = execFileSync(
      "security",
      ["find-identity", "-v", "-p", "codesigning"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const match = output.match(/"([^"]*Developer ID Application[^"]*)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function collectNativeCandidates(rootDir: string): string[] {
  const candidates: string[] = [];

  const visit = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      const stats = fs.statSync(entryPath);
      if (shouldConsiderForCodesign(entryPath, stats)) {
        candidates.push(entryPath);
      }
    }
  };

  visit(rootDir);

  return candidates.sort((left, right) => {
    const depthDelta =
      right.split(path.sep).length - left.split(path.sep).length;
    if (depthDelta !== 0) {
      return depthDelta;
    }
    return left.localeCompare(right);
  });
}

function signRuntimeFile(filePath: string, developerId: string): boolean {
  const fileDescription = execFileSync("file", ["-b", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const machOKind = classifyMachOKind(fileDescription);
  if (!machOKind) {
    return false;
  }

  const codesignArgs = ["--force", "--timestamp", "--sign", developerId];
  if (machOKind === "executable") {
    codesignArgs.push("--options", "runtime");
  }
  codesignArgs.push(filePath);
  execFileSync("codesign", codesignArgs, { stdio: "inherit" });
  return true;
}

function shouldRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (process.platform !== "darwin") {
    return false;
  }
  if (env.ELECTROBUN_OS && env.ELECTROBUN_OS !== "macos") {
    return false;
  }
  if (env.ELECTROBUN_SKIP_CODESIGN === "1") {
    return false;
  }
  return true;
}

function main(): void {
  if (!shouldRun()) {
    console.log("[postwrap-sign] skipping nested runtime codesign");
    return;
  }

  const runtimeNodeModulesPath = resolveRuntimeNodeModulesPath();
  if (!fs.existsSync(runtimeNodeModulesPath)) {
    throw new Error(
      `postwrap-sign: runtime node_modules not found at ${runtimeNodeModulesPath}`,
    );
  }

  const developerId = resolveDeveloperId();
  if (!developerId) {
    throw new Error(
      "postwrap-sign: no Developer ID Application identity available for codesign",
    );
  }

  let signedCount = 0;
  for (const candidate of collectNativeCandidates(runtimeNodeModulesPath)) {
    if (signRuntimeFile(candidate, developerId)) {
      signedCount += 1;
    }
  }

  console.log(
    `[postwrap-sign] signed ${signedCount} Mach-O file(s) under ${runtimeNodeModulesPath}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
