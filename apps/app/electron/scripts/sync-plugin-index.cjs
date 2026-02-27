#!/usr/bin/env node
/**
 * Sync the root plugins.json (generated via `npm run generate:plugins`) into the
 * Electron app package root so packaged desktop builds can render Plugins/Channels.
 *
 * Packaged milady-dist reads plugins.json relative to the Electron app root
 * (app.asar) — if it's missing, the UI ends up with an empty list.
 */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../../..");
const sourcePath = path.join(repoRoot, "plugins.json");
const destPath = path.resolve(__dirname, "..", "plugins.json");

function fail(message) {
  console.error(`[sync-plugin-index] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  fail(`Missing ${sourcePath}. Run \`npm run generate:plugins\` from repo root.`);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
} catch (err) {
  fail(
    `Failed to parse ${sourcePath}: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}

if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.plugins)) {
  fail(`Invalid plugin index shape in ${sourcePath}.`);
}

fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2));
console.log(
  `[sync-plugin-index] Wrote ${path.relative(repoRoot, destPath)} (${parsed.plugins.length} plugins)`,
);

