#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const result = spawnSync("bun", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
