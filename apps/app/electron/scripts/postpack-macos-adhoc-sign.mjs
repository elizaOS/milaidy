#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

function hasSigningCredentials() {
  const keys = ["CSC_LINK", "CSC_NAME", "APPLE_ID", "APPLE_TEAM_ID"];
  return keys.some((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function findMacApps(distDir) {
  if (!existsSync(distDir)) return [];

  const entries = readdirSync(distDir, { withFileTypes: true });
  const appPaths = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
    const appPath = path.join(distDir, entry.name, "Milady.app");
    if (existsSync(appPath)) {
      appPaths.push(appPath);
    }
  }

  return appPaths;
}

function runOrExit(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status === 0) return;
  const code = typeof result.status === "number" ? result.status : 1;
  console.error(`[postpack-sign] ${label} failed (exit ${code})`);
  process.exit(code);
}

if (process.platform !== "darwin") {
  console.log("[postpack-sign] Non-macOS host; skipping ad-hoc signing fix.");
  process.exit(0);
}

if (hasSigningCredentials()) {
  console.log(
    "[postpack-sign] Signing credentials detected; skipping local ad-hoc re-sign.",
  );
  process.exit(0);
}

const distDir = path.resolve(process.cwd(), "dist");
const appBundles = findMacApps(distDir);

if (appBundles.length === 0) {
  console.log(`[postpack-sign] No Milady.app bundles found under ${distDir}.`);
  process.exit(0);
}

for (const appPath of appBundles) {
  console.log(`[postpack-sign] Re-signing ${appPath} (ad-hoc, deep)...`);
  runOrExit(
    "codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    "codesign",
  );

  console.log(`[postpack-sign] Verifying ${appPath}...`);
  runOrExit(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    "codesign verify",
  );
}

console.log("[postpack-sign] macOS ad-hoc signing fix complete.");
