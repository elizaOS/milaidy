#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const candidates = [
  path.join(root, "node_modules", "@elizaos", "plugin-pi-ai"),
  path.join(root, "packages", "plugin-pi-ai"),
];

const uniqueDirs = [];
const seen = new Set();
for (const dir of candidates) {
  if (!existsSync(dir)) continue;
  const resolved = realpathSync(dir);
  if (seen.has(resolved)) continue;
  seen.add(resolved);
  uniqueDirs.push(dir);
}

if (uniqueDirs.length === 0) {
  console.log(
    "[build-local-plugins] No local plugin directories found, skipping.",
  );
  process.exit(0);
}

for (const dir of uniqueDirs) {
  console.log(`[build-local-plugins] Building @elizaos/plugin-pi-ai in ${dir}`);
  const result = spawnSync("bun", ["run", "build"], {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
