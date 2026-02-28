#!/usr/bin/env node
/**
 * Sync the root plugins.json (generated via `npm run generate:plugins`) into:
 * 1) Electron app package root (apps/app/electron/plugins.json)
 * 2) Embedded backend bundle root (apps/app/electron/milady-dist/plugins.json)
 *
 * The packaged backend resolves plugins.json relative to milady-dist. If missing,
 * /api/plugins falls back to built-ins and UI appears empty.
 */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../../..");
const sourcePath = path.join(repoRoot, "plugins.json");
const destinationPaths = [
  path.resolve(__dirname, "..", "plugins.json"),
  path.resolve(__dirname, "..", "milady-dist", "plugins.json"),
];

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

for (const destinationPath of destinationPaths) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, JSON.stringify(parsed, null, 2));
  console.log(
    `[sync-plugin-index] Wrote ${path.relative(repoRoot, destinationPath)} (${parsed.plugins.length} plugins)`,
  );
}
