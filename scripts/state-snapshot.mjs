#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
}

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function resolveStateTargets() {
  const cwd = process.cwd();
  const stateDir = path.resolve(
    process.env.MILADY_STATE_DIR?.trim() || path.join(cwd, ".milady-state"),
  );
  const configPath = path.resolve(
    process.env.MILADY_CONFIG_PATH?.trim() ||
      path.join(stateDir, "milady.json"),
  );
  return { cwd, stateDir, configPath };
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

function main() {
  const { cwd, stateDir, configPath } = resolveStateTargets();
  const customName = parseArg("--name");
  const suffix = customName?.trim() || timestamp();
  const snapshotDir = path.resolve(cwd, `.milady-state.backup-${suffix}`);

  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });

  const snapshotStateDir = path.join(snapshotDir, "state");
  const snapshotConfigPath = path.join(snapshotDir, "milady.json");

  const copiedState = copyIfExists(stateDir, snapshotStateDir);
  const copiedConfig = copyIfExists(configPath, snapshotConfigPath);

  const manifest = {
    createdAt: new Date().toISOString(),
    cwd,
    source: {
      stateDir,
      configPath,
    },
    copied: {
      stateDir: copiedState,
      configPath: copiedConfig,
    },
  };
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf-8", mode: 0o600 },
  );

  console.log(`[state-snapshot] Snapshot created: ${snapshotDir}`);
  console.log(
    `[state-snapshot] state=${copiedState ? "copied" : "missing"} config=${copiedConfig ? "copied" : "missing"}`,
  );
}

main();
