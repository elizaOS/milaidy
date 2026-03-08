#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

function parseBudget(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const MAIN_JS_MAX_BYTES = parseBudget(
  "MILADY_BUNDLE_MAIN_MAX_BYTES",
  2_100_000,
);
const MAIN_JS_MAX_GZIP_BYTES = parseBudget(
  "MILADY_BUNDLE_MAIN_MAX_GZIP_BYTES",
  560_000,
);
const MAIN_CSS_MAX_BYTES = parseBudget(
  "MILADY_BUNDLE_MAIN_CSS_MAX_BYTES",
  180_000,
);

function fail(message) {
  console.error(`[perf-budget] fail: ${message}`);
  process.exit(1);
}

function findSingleAsset(dir, prefix, ext) {
  if (!fs.existsSync(dir)) return null;
  const all = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext));
  if (all.length === 0) return null;
  all.sort((a, b) => a.localeCompare(b));
  return path.join(dir, all[all.length - 1]);
}

function measure(filePath) {
  const raw = fs.readFileSync(filePath);
  return {
    bytes: raw.byteLength,
    gzipBytes: zlib.gzipSync(raw).byteLength,
  };
}

function main() {
  const assetsDir = path.resolve("apps/app/dist/assets");
  if (!fs.existsSync(assetsDir)) {
    fail(`Missing assets directory: ${assetsDir}. Run bun run build first.`);
  }

  const mainJs = findSingleAsset(assetsDir, "main-", ".js");
  if (!mainJs) {
    fail("Could not find main JS asset (main-*.js).");
  }
  const mainCss = findSingleAsset(assetsDir, "main-", ".css");
  if (!mainCss) {
    fail("Could not find main CSS asset (main-*.css).");
  }

  const js = measure(mainJs);
  const css = measure(mainCss);

  console.log(
    `[perf-budget] main.js bytes=${js.bytes} gzip=${js.gzipBytes} | budget bytes<=${MAIN_JS_MAX_BYTES} gzip<=${MAIN_JS_MAX_GZIP_BYTES}`,
  );
  console.log(
    `[perf-budget] main.css bytes=${css.bytes} gzip=${css.gzipBytes} | budget bytes<=${MAIN_CSS_MAX_BYTES}`,
  );

  if (js.bytes > MAIN_JS_MAX_BYTES) {
    fail(`main.js raw size ${js.bytes} exceeds ${MAIN_JS_MAX_BYTES}`);
  }
  if (js.gzipBytes > MAIN_JS_MAX_GZIP_BYTES) {
    fail(`main.js gzip size ${js.gzipBytes} exceeds ${MAIN_JS_MAX_GZIP_BYTES}`);
  }
  if (css.bytes > MAIN_CSS_MAX_BYTES) {
    fail(`main.css raw size ${css.bytes} exceeds ${MAIN_CSS_MAX_BYTES}`);
  }

  console.log("[perf-budget] pass");
}

main();
