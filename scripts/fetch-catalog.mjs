#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://clawhub.ai/api/v1/search?q=${q}&limit=100`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          if (!seen.has(r.slug)) {
            seen.set(r.slug, {
              slug: r.slug,
              displayName: r.name || r.slug,
              summary: r.description || null,
              tags: {},
              stats: {
                comments: 0,
                downloads: r.downloads || 0,
                installsAllTime: r.installs || 0,
                installsCurrent: 0,
                stars: r.stars || 0,
                versions: 1,
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
              latestVersion: r.version
                ? { version: r.version, createdAt: Date.now(), changelog: "" }
                : null,
            });
          }
        }
      }
      process.stdout.write(`[${q}] total unique: ${seen.size}\n`);
    } catch (err) {
      process.stderr.write(`[${q}] failed: ${err.message}\n`);
    }
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
