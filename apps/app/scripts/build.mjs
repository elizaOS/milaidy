#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..", "..");
const rtScript = path.join(repoRoot, "scripts", "rt.mjs");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

await run(process.execPath, [rtScript, "run", "install:build"], repoRoot);
await run(process.execPath, [path.join(__dirname, "plugin-build.mjs")], appDir);
await run(process.execPath, [rtScript, "install", "--ignore-scripts"], appDir);
await run(process.execPath, [rtScript, "run", "build:web"], appDir);
