#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("[milady] No runtime command provided.");
  process.exit(1);
}

const isWindows = process.platform === "win32";

function pathExists(candidate) {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function which(command) {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const exts = isWindows
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];

  for (const dir of dirs) {
    const direct = path.join(dir, command);
    if (pathExists(direct)) {
      return direct;
    }
    if (!isWindows) {
      continue;
    }
    for (const ext of exts) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveBun() {
  const fromPath = which("bun");
  if (fromPath) {
    return fromPath;
  }

  const homeDir = os.homedir();
  if (!homeDir) {
    return null;
  }

  const candidate = path.join(
    homeDir,
    ".bun",
    "bin",
    isWindows ? "bun.exe" : "bun",
  );
  return pathExists(candidate) ? candidate : null;
}

function resolveNpm() {
  return which(isWindows ? "npm.cmd" : "npm");
}

function resolveNode() {
  return process.execPath || which(isWindows ? "node.exe" : "node");
}

function isTypeScriptScript(command) {
  return /\.(cts|mts|ts|tsx)$/i.test(command);
}

function isJavaScriptScript(command) {
  return /\.(cjs|mjs|js|jsx)$/i.test(command);
}

const bunPath = resolveBun();
const command = args[0];

let executable;
let spawnArgs;

if (bunPath) {
  executable = bunPath;
  spawnArgs = args;
} else if (isTypeScriptScript(command)) {
  const nodePath = resolveNode();
  if (!nodePath) {
    console.error("[milady] Node.js is required to run TypeScript scripts.");
    process.exit(1);
  }
  executable = nodePath;
  spawnArgs = ["--import", "tsx", ...args];
} else if (isJavaScriptScript(command)) {
  const nodePath = resolveNode();
  if (!nodePath) {
    console.error("[milady] Node.js is required to run JavaScript scripts.");
    process.exit(1);
  }
  executable = nodePath;
  spawnArgs = args;
} else {
  const npmPath = resolveNpm();
  if (!npmPath) {
    console.error(
      "[milady] Bun is not installed and npm is unavailable for this command.",
    );
    process.exit(1);
  }
  executable = npmPath;
  spawnArgs = args;
}

const child = spawn(executable, spawnArgs, {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
