#!/usr/bin/env node

/**
 * Launch Electron main process while forcing true Electron runtime mode.
 *
 * Some shells/dev tools export ELECTRON_RUN_AS_NODE=1 globally, which makes
 * Electron execute as plain Node.js and breaks app startup.
 */
const { spawn } = require("node:child_process");
const _path = require("node:path");

const electronCli = require.resolve("electron/cli.js");
const args = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [electronCli, ...args], {
  stdio: "inherit",
  env,
  cwd: process.cwd(),
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
