#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
];
const forbiddenPrefixes = ["dist/Milady.app/"];
const requiredWorkflowSnippets = [
  "Install quiet macOS packaging wrappers",
  "apps/app/electrobun/scripts/xcrun-wrapper.sh",
  "apps/app/electrobun/scripts/zip-wrapper.sh",
  "ELECTROBUN_REAL_XCRUN: /usr/bin/xcrun",
  "ELECTROBUN_REAL_ZIP: /usr/bin/zip",
  "Smoke test packaged macOS app",
  "SKIP_BUILD=1",
  "bash apps/app/electrobun/scripts/smoke-test.sh",
];
const requiredElectrobunConfigSnippets = [
  'postBuild: "scripts/postwrap-sign-runtime-macos.ts"',
];

function runPackDry(): PackResult[] {
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 100,
  });
  return JSON.parse(raw) as PackResult[];
}

function assertReleaseWorkflowHasNotaryWrapper() {
  const workflow = readFileSync(".github/workflows/release-electrobun.yml", "utf8");
  const missing = requiredWorkflowSnippets.filter((snippet) =>
    !workflow.includes(snippet),
  );

  if (missing.length > 0) {
    console.error("release-check: release workflow is missing notary wrapper wiring:");
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertElectrobunConfigHasPostWrapSigner() {
  const config = readFileSync(
    "apps/app/electrobun/electrobun.config.ts",
    "utf8",
  );
  const missing = requiredElectrobunConfigSnippets.filter((snippet) =>
    !config.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: electrobun config is missing postBuild signer wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertWindowsSmokeScriptHasLeadingParamBlock() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test-windows.ps1",
    "utf8",
  );
  const firstRelevantLine = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (firstRelevantLine !== "param(") {
    console.error(
      "release-check: smoke-test-windows.ps1 must start with a param() block before executable statements.",
    );
    console.error(`  - first relevant line: ${firstRelevantLine ?? "<none>"}`);
    process.exit(1);
  }
}

function assertMacSmokeScriptLaunchesPackagedLauncherDirectly() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test.sh",
    "utf8",
  );

  if (!script.includes('LAUNCHER_PATH="$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher"')) {
    console.error(
      "release-check: smoke-test.sh must launch the packaged Contents/MacOS/launcher directly.",
    );
    process.exit(1);
  }

  if (script.includes('open "$LAUNCH_APP_BUNDLE"')) {
    console.error(
      "release-check: smoke-test.sh must not use open(1); it can reactivate a stale installed bundle.",
    );
    process.exit(1);
  }
}

function main() {
  assertReleaseWorkflowHasNotaryWrapper();
  assertElectrobunConfigHasPostWrapSigner();
  assertWindowsSmokeScriptHasLeadingParamBlock();
  assertMacSmokeScriptLaunchesPackagedLauncherDirectly();
  const results = runPackDry();
  const files = results.flatMap((entry) => entry.files ?? []);
  const paths = new Set(files.map((file) => file.path));

  const missing = requiredPaths.filter((path) => !paths.has(path));
  const forbidden = [...paths].filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
  );

  if (missing.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in npm pack:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files in npm pack:");
      for (const path of forbidden) {
        console.error(`  - ${path}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: npm pack contents look OK.");
}

main();
