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

function findLatestSnapshot(cwd) {
  const entries = fs
    .readdirSync(cwd, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name.startsWith(".milady-state.backup-"),
    )
    .map((entry) => entry.name)
    .sort();
  if (entries.length === 0) return null;
  return path.resolve(cwd, entries[entries.length - 1]);
}

function ensureDir(parentDir) {
  fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
}

function backupCurrentState(stateDir, configPath, cwd) {
  const backupDir = path.resolve(
    cwd,
    `.milady-state.pre-rollback-${timestamp()}`,
  );
  ensureDir(backupDir);

  const stateBackup = path.join(backupDir, "state");
  const configBackup = path.join(backupDir, "milady.json");

  if (fs.existsSync(stateDir)) {
    fs.cpSync(stateDir, stateBackup, { recursive: true, force: true });
  }
  if (fs.existsSync(configPath)) {
    fs.cpSync(configPath, configBackup, { recursive: true, force: true });
  }
  return backupDir;
}

function restore(snapshotDir, stateDir, configPath) {
  const manifestPath = path.join(snapshotDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Snapshot missing manifest: ${manifestPath}`);
  }

  const snapshotState = path.join(snapshotDir, "state");
  const snapshotConfig = path.join(snapshotDir, "milady.json");

  if (!fs.existsSync(snapshotState) && !fs.existsSync(snapshotConfig)) {
    throw new Error(
      `Snapshot contains neither state nor config payload: ${snapshotDir}`,
    );
  }

  ensureDir(path.dirname(stateDir));
  ensureDir(path.dirname(configPath));

  if (fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  if (fs.existsSync(snapshotState)) {
    fs.cpSync(snapshotState, stateDir, { recursive: true, force: true });
  }

  if (fs.existsSync(snapshotConfig)) {
    fs.cpSync(snapshotConfig, configPath, { recursive: true, force: true });
  }
}

function main() {
  const { cwd, stateDir, configPath } = resolveStateTargets();
  const explicitSnapshot = parseArg("--snapshot");
  const snapshotDir = explicitSnapshot
    ? path.resolve(explicitSnapshot)
    : findLatestSnapshot(cwd);

  if (!snapshotDir) {
    throw new Error(
      "No snapshot found. Create one first with `bun run state:snapshot`.",
    );
  }
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Snapshot path not found: ${snapshotDir}`);
  }

  const preRollbackBackup = backupCurrentState(stateDir, configPath, cwd);
  restore(snapshotDir, stateDir, configPath);

  console.log(`[state-rollback] Restored snapshot: ${snapshotDir}`);
  console.log(`[state-rollback] Previous state backup: ${preRollbackBackup}`);
}

main();
