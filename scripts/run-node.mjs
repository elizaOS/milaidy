#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compiler = "tsdown";

const distRoot = path.join(cwd, "dist");
const distEntry = path.join(distRoot, "/entry.js");
const buildStampPath = path.join(distRoot, ".buildstamp");
const srcRoot = path.join(cwd, "src");
const configFiles = [
  path.join(cwd, "tsconfig.json"),
  path.join(cwd, "package.json"),
];

const statMtime = (filePath) => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
};

const isExcludedSource = (filePath) => {
  const relativePath = path.relative(srcRoot, filePath);
  if (relativePath.startsWith("..")) {
    return false;
  }
  return (
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".test.tsx") ||
    relativePath.endsWith(`test-utils.ts`)
  );
};

const findLatestMtime = (dirPath, shouldSkip) => {
  let latest = null;
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (shouldSkip?.(fullPath)) {
        continue;
      }
      const mtime = statMtime(fullPath);
      if (mtime == null) {
        continue;
      }
      if (latest == null || mtime > latest) {
        latest = mtime;
      }
    }
  }
  return latest;
};

const shouldBuild = () => {
  if (env.MILADY_FORCE_BUILD === "1") {
    return true;
  }
  const stampMtime = statMtime(buildStampPath);
  if (stampMtime == null) {
    return true;
  }
  if (statMtime(distEntry) == null) {
    return true;
  }

  for (const filePath of configFiles) {
    const mtime = statMtime(filePath);
    if (mtime != null && mtime > stampMtime) {
      return true;
    }
  }

  const srcMtime = findLatestMtime(srcRoot, isExcludedSource);
  if (srcMtime != null && srcMtime > stampMtime) {
    return true;
  }
  return false;
};

const logRunner = (message) => {
  if (env.MILADY_RUNNER_LOG === "0") {
    return;
  }
  process.stderr.write(`[milady] ${message}\n`);
};

/** Exit code used by the restart action to signal "restart requested". */
const RESTART_EXIT_CODE = 75;

const runNode = () => {
  // Eliza MIGRATION: Use bun for faster startup and better TypeScript support
  const runtime = process.env.MILADY_RUNTIME || "bun";
  const execPath = runtime === "bun" ? "bun" : process.execPath;
  const nodeProcess = spawn(execPath, ["milady.mjs", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  nodeProcess.on("exit", (exitCode, exitSignal) => {
    if (exitSignal) {
      process.exit(1);
    }

    // Restart loop: when the agent requests a restart it exits with code 75.
    // Re-run the full runner (including the build-staleness check) so any
    // source changes are compiled before the new process starts.
    if (exitCode === RESTART_EXIT_CODE) {
      logRunner("Restart requested — relaunching...");

      // Re-check whether a rebuild is needed (source files may have changed).
      if (shouldBuild()) {
        logRunner("Building TypeScript (dist is stale).");
        const bunxArgs = [compiler];
        const buildCmd = process.platform === "win32" ? "cmd.exe" : "bunx";
        const buildArgs =
          process.platform === "win32"
            ? ["/d", "/s", "/c", "bunx", ...bunxArgs]
            : bunxArgs;
        const build = spawn(buildCmd, buildArgs, {
          cwd,
          env,
          stdio: "inherit",
        });
        build.on("exit", (code, signal) => {
          if (signal || (code !== 0 && code !== null)) {
            logRunner("Rebuild failed, restarting anyway.");
          } else {
            writeBuildStamp();
          }
          runNode();
        });
      } else {
        runNode();
      }
      return;
    }

    process.exit(exitCode ?? 1);
  });
};

const writeBuildStamp = () => {
  try {
    fs.mkdirSync(distRoot, { recursive: true });
    fs.writeFileSync(buildStampPath, `${Date.now()}\n`);
  } catch (error) {
    // Best-effort stamp; still allow the runner to start.
    logRunner(
      `Failed to write build stamp: ${error?.message ?? "unknown error"}`,
    );
  }
};

if (!shouldBuild()) {
  runNode();
} else {
  logRunner("Building TypeScript (dist is stale).");
  // Eliza MIGRATION: Use bunx for faster builds
  const bunxArgs = [compiler];
  const buildCmd = process.platform === "win32" ? "cmd.exe" : "bunx";
  const buildArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "bunx", ...bunxArgs]
      : bunxArgs;
  const build = spawn(buildCmd, buildArgs, {
    cwd,
    env,
    stdio: "inherit",
  });

  build.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    if (code !== 0 && code !== null) {
      process.exit(code);
    }
    writeBuildStamp();
    runNode();
  });
}
