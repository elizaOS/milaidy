#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

// ── Schema validation ──────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$/;
const MAX_NAME_LEN = 128;
const MAX_SUMMARY_LEN = 512;
const MAX_VERSION_LEN = 64;

/** Truncate a string field to `max` characters. */
function cap(value, max) {
  if (typeof value !== "string") return null;
  return value.length <= max ? value : value.slice(0, max);
}

/** Validate and normalise a catalog result. Returns null (with warning) on invalid entries. */
function validateEntry(r) {
  if (!r || typeof r.slug !== "string") {
    process.stderr.write(`[warn] skipping entry with missing slug\n`);
    return null;
  }
  if (!SLUG_RE.test(r.slug)) {
    process.stderr.write(`[warn] skipping invalid slug: ${JSON.stringify(r.slug).slice(0, 80)}\n`);
    return null;
  }
  return {
    slug: r.slug,
    displayName: cap(r.name, MAX_NAME_LEN) || r.slug,
    summary: cap(r.description, MAX_SUMMARY_LEN) || null,
    tags: {},
    stats: {
      comments: 0,
      downloads: Number.isFinite(r.downloads) ? Math.max(0, r.downloads | 0) : 0,
      installsAllTime: Number.isFinite(r.installs) ? Math.max(0, r.installs | 0) : 0,
      installsCurrent: 0,
      stars: Number.isFinite(r.stars) ? Math.max(0, r.stars | 0) : 0,
      versions: 1,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    latestVersion: typeof r.version === "string"
      ? { version: cap(r.version, MAX_VERSION_LEN), createdAt: Date.now(), changelog: "" }
      : null,
  };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const seen = new Map();
  const queries = [
    "skill", "agent", "plugin", "tool", "chat", "web", "crypto", "game",
    "ai", "social", "data", "image", "video", "music", "code", "api",
    "bot", "finance", "trade", "news", "weather", "search", "email",
    "file", "database", "analytics", "security", "automation", "discord",
    "telegram", "twitter", "slack", "github", "hello", "test", "demo",
    "nft", "token", "wallet", "defi", "solana", "ethereum", "bitcoin",
  ];

  let skipped = 0;

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://clawhub.ai/api/v1/search?q=${q}&limit=100`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          if (seen.has(r.slug)) continue;
          const entry = validateEntry(r);
          if (entry) {
            seen.set(entry.slug, entry);
          } else {
            skipped++;
          }
        }
      }
      process.stdout.write(`[${q}] total unique: ${seen.size}\n`);
    } catch (err) {
      process.stderr.write(`[${q}] failed: ${err.message}\n`);
    }
  }

  if (skipped > 0) {
    process.stderr.write(`[warn] skipped ${skipped} invalid entries total\n`);
  }

  const catalog = { data: [...seen.values()], cachedAt: Date.now() };
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  const dir = path.join(home, ".milady", "skills");
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "catalog.json");
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  console.log(`Cached ${seen.size} skills to ${outPath}`);
}

main();
