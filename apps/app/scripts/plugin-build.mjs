#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const pluginsDir = path.join(appDir, "plugins");
const pluginNames = [
  "gateway",
  "swabble",
  "camera",
  "screencapture",
  "canvas",
  "desktop",
  "location",
  "talkmode",
  "agent",
];

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

const npmCommand = "bun";
const npmArgs = ["run", "build"];

// Plugins have no inter-dependencies — build in parallel
await Promise.all(
  pluginNames.map(async (name) => {
    console.log(`[plugin:${name}] building...`);
    await run(npmCommand, npmArgs, path.join(pluginsDir, name));
    console.log(`[plugin:${name}] done`);
  }),
);
