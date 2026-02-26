#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const pluginSpecs = [
  {
    name: "@elizaos/plugin-pi-ai",
    candidates: [
      path.join(root, "node_modules", "@elizaos", "plugin-pi-ai"),
      path.join(root, "packages", "plugin-pi-ai"),
    ],
  },
  {
    name: "@milaidy/plugin-claude-code-workbench",
    candidates: [path.join(root, "packages", "plugin-claude-code-workbench")],
  },
  {
    name: "@milaidy/plugin-coding-agent",
    candidates: [path.join(root, "packages", "plugin-coding-agent")],
  },
];

const buildTargets = [];
const seen = new Set();

for (const spec of pluginSpecs) {
  for (const dir of spec.candidates) {
    if (!existsSync(dir)) continue;
    const resolved = realpathSync(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    buildTargets.push({ name: spec.name, dir });
  }
}

if (buildTargets.length === 0) {
  console.log(
    "[build-local-plugins] No local plugin directories found, skipping.",
  );
  process.exit(0);
}

for (const target of buildTargets) {
  console.log(`[build-local-plugins] Building ${target.name} in ${target.dir}`);
  const result = spawnSync("bun", ["run", "build"], {
    cwd: target.dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.signal === "SIGKILL" || result.status === 137) {
    // OOM-killed — common during postinstall when bun is already resident.
    // Dev mode doesn't need dist/ (Vite resolves TS source, server uses tsx).
    console.warn(
      `[build-local-plugins] ⚠ ${target.name} build was killed (OOM). ` +
        `Skipping — run "bun run build:local-plugins" manually if dist/ is needed.`,
    );
    continue;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
