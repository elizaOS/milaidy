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
  "Sign macOS runtime node_modules before Electrobun wrap",
  "bun apps/app/electrobun/scripts/postwrap-sign-runtime-macos.ts dist/node_modules",
  "ELECTROBUN_REAL_XCRUN: /usr/bin/xcrun",
  "ELECTROBUN_REAL_ZIP: /usr/bin/zip",
];
const requiredElectrobunConfigSnippets = [
  'postWrap: "scripts/postwrap-sign-runtime-macos.ts"',
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
      "release-check: electrobun config is missing postWrap signer wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function main() {
  assertReleaseWorkflowHasNotaryWrapper();
  assertElectrobunConfigHasPostWrapSigner();
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
