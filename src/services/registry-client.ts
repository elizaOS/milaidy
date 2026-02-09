/**
 * Registry Client for Milaidy.
 *
 * Provides a 3-tier cached registry (memory → file → network) that works
 * offline, in .app bundles, and in dev. Fetches from the next@registry branch.
 *
 * @module services/registry-client
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATED_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/refs/heads/next%40registry/generated-registry.json";
const INDEX_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/refs/heads/next%40registry/index.json";
const CACHE_TTL_MS = 3_600_000; // 1 hour

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegistryPluginInfo {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  git: {
    v0Branch: string | null;
    v1Branch: string | null;
    v2Branch: string | null;
  };
  supports: { v0: boolean; v1: boolean; v2: boolean };
  /** Set to "app" when this entry is a launchable application */
  kind?: string;
  /** App metadata — present when kind is "app" */
  appMeta?: RegistryAppMeta;
}

/** App-specific metadata from the registry. */
export interface RegistryAppMeta {
  displayName: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  minPlayers: number | null;
  maxPlayers: number | null;
}

/** App-specific info for listing and searching. */
export interface RegistryAppInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  stars: number;
  repository: string;
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  score: number;
  tags: string[];
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  repository: string;
}

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

let memoryCache: {
  plugins: Map<string, RegistryPluginInfo>;
  fetchedAt: number;
} | null = null;

function cacheFilePath(): string {
  const base =
    process.env.MILAIDY_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".milaidy");
  return path.join(base, "cache", "registry.json");
}

// ---------------------------------------------------------------------------
// Network fetch + parse (inlined wire types — not exported)
// ---------------------------------------------------------------------------

async function fetchFromNetwork(): Promise<Map<string, RegistryPluginInfo>> {
  // Try enriched registry first
  try {
    const resp = await fetch(GENERATED_REGISTRY_URL);
    if (resp.ok) {
      const data = (await resp.json()) as {
        registry: Record<
          string,
          {
            git: {
              repo: string;
              v0: { branch: string | null };
              v1: { branch: string | null };
              v2: { branch: string | null };
            };
            npm: {
              repo: string;
              v0: string | null;
              v1: string | null;
              v2: string | null;
            };
            supports: { v0: boolean; v1: boolean; v2: boolean };
            description: string;
            homepage: string | null;
            topics: string[];
            stargazers_count: number;
            language: string;
            kind?: string;
            app?: {
              displayName: string;
              category: string;
              launchType: string;
              launchUrl: string | null;
              icon: string | null;
              capabilities: string[];
              minPlayers: number | null;
              maxPlayers: number | null;
            };
          }
        >;
      };
      const plugins = new Map<string, RegistryPluginInfo>();
      for (const [name, e] of Object.entries(data.registry)) {
        const info: RegistryPluginInfo = {
          name,
          gitRepo: e.git.repo,
          gitUrl: `https://github.com/${e.git.repo}.git`,
          description: e.description || "",
          homepage: e.homepage,
          topics: e.topics || [],
          stars: e.stargazers_count || 0,
          language: e.language || "TypeScript",
          npm: {
            package: e.npm.repo,
            v0Version: e.npm.v0,
            v1Version: e.npm.v1,
            v2Version: e.npm.v2,
          },
          git: {
            v0Branch: e.git.v0?.branch ?? null,
            v1Branch: e.git.v1?.branch ?? null,
            v2Branch: e.git.v2?.branch ?? null,
          },
          supports: e.supports,
        };

        if (e.kind === "app" && e.app) {
          info.kind = "app";
          info.appMeta = {
            displayName: e.app.displayName,
            category: e.app.category,
            launchType: e.app.launchType,
            launchUrl: e.app.launchUrl,
            icon: e.app.icon,
            capabilities: e.app.capabilities || [],
            minPlayers: e.app.minPlayers ?? null,
            maxPlayers: e.app.maxPlayers ?? null,
          };
        }

        plugins.set(name, info);
      }
      return plugins;
    }
  } catch (err) {
    logger.warn(
      `[registry-client] generated-registry.json unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Fallback to index.json
  const resp = await fetch(INDEX_REGISTRY_URL);
  if (!resp.ok)
    throw new Error(`index.json: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as Record<string, string>;
  const plugins = new Map<string, RegistryPluginInfo>();
  for (const [name, gitRef] of Object.entries(data)) {
    const repo = gitRef.replace(/^github:/, "");
    plugins.set(name, {
      name,
      gitRepo: repo,
      gitUrl: `https://github.com/${repo}.git`,
      description: "",
      homepage: null,
      topics: [],
      stars: 0,
      language: "TypeScript",
      npm: { package: name, v0Version: null, v1Version: null, v2Version: null },
      git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
      supports: { v0: false, v1: false, v2: false },
    });
  }
  return plugins;
}

// ---------------------------------------------------------------------------
// File cache
// ---------------------------------------------------------------------------

async function readFileCache(): Promise<Map<
  string,
  RegistryPluginInfo
> | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as {
      fetchedAt: number;
      plugins: Array<[string, RegistryPluginInfo]>;
    };
    if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.plugins))
      return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return new Map(parsed.plugins);
  } catch {
    return null;
  }
}

async function writeFileCache(
  plugins: Map<string, RegistryPluginInfo>,
): Promise<void> {
  const filePath = cacheFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ fetchedAt: Date.now(), plugins: [...plugins.entries()] }),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all plugins. Resolution: memory → file → network. */
export async function getRegistryPlugins(): Promise<
  Map<string, RegistryPluginInfo>
> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.plugins;
  }

  const fromFile = await readFileCache();
  if (fromFile) {
    memoryCache = { plugins: fromFile, fetchedAt: Date.now() };
    return fromFile;
  }

  logger.info(
    "[registry-client] Fetching plugin registry from next@registry...",
  );
  const plugins = await fetchFromNetwork();
  logger.info(`[registry-client] Loaded ${plugins.size} plugins`);

  memoryCache = { plugins, fetchedAt: Date.now() };
  writeFileCache(plugins).catch((err) =>
    logger.warn(
      `[registry-client] Cache write failed: ${err instanceof Error ? err.message : String(err)}`,
    ),
  );

  return plugins;
}

/** Force-refresh from network. */
export async function refreshRegistry(): Promise<
  Map<string, RegistryPluginInfo>
> {
  memoryCache = null;
  try {
    await fs.unlink(cacheFilePath());
  } catch {
    /* noop */
  }
  return getRegistryPlugins();
}

/** Look up a plugin by name (exact → @elizaos/ prefix → bare suffix). */
export async function getPluginInfo(
  name: string,
): Promise<RegistryPluginInfo | null> {
  const registry = await getRegistryPlugins();

  let p = registry.get(name);
  if (p) return p;

  if (!name.startsWith("@")) {
    p = registry.get(`@elizaos/${name}`);
    if (p) return p;
  }

  const bare = name.replace(/^@[^/]+\//, "");
  for (const [key, value] of registry) {
    if (key.endsWith(`/${bare}`)) return value;
  }
  return null;
}

/**
 * Score registry entries against a query. Shared by searchPlugins and searchApps.
 * Returns entries sorted by score descending, limited to `limit` results.
 */
function scoreEntries(
  entries: Iterable<RegistryPluginInfo>,
  query: string,
  limit: number,
  extraNames?: (p: RegistryPluginInfo) => string[],
  extraTerms?: (p: RegistryPluginInfo) => string[],
): Array<{ p: RegistryPluginInfo; s: number }> {
  const lq = query.toLowerCase();
  const terms = lq.split(/\s+/).filter((t) => t.length > 1);
  const scored: Array<{ p: RegistryPluginInfo; s: number }> = [];

  for (const p of entries) {
    const ln = p.name.toLowerCase();
    const ld = p.description.toLowerCase();
    const aliases = extraNames?.(p) ?? [];
    let s = 0;

    // Exact match on name or aliases
    if (ln === lq || ln === `@elizaos/${lq}` || aliases.some((a) => a === lq))
      s += 100;
    else if (ln.includes(lq) || aliases.some((a) => a.includes(lq))) s += 50;
    if (ld.includes(lq)) s += 30;
    // Topics + extra terms (capabilities for apps)
    for (const t of p.topics) if (t.toLowerCase().includes(lq)) s += 25;
    for (const t of extraTerms?.(p) ?? [])
      if (t.toLowerCase().includes(lq)) s += 25;
    for (const term of terms) {
      if (ln.includes(term) || aliases.some((a) => a.includes(term))) s += 15;
      if (ld.includes(term)) s += 10;
      for (const t of p.topics) if (t.toLowerCase().includes(term)) s += 8;
    }
    if (s > 0) {
      if (p.stars > 100) s += 3;
      if (p.stars > 500) s += 3;
      if (p.stars > 1000) s += 4;
      scored.push({ p, s });
    }
  }

  scored.sort((a, b) => b.s - a.s || b.p.stars - a.p.stars);
  return scored.slice(0, limit);
}

/** Search plugins by query (local fuzzy match on name/description/topics). */
export async function searchPlugins(
  query: string,
  limit = 15,
): Promise<RegistrySearchResult[]> {
  const registry = await getRegistryPlugins();
  const results = scoreEntries(registry.values(), query, limit);
  const max = results[0]?.s || 1;

  return results.map(({ p, s }) => ({
    name: p.name,
    description: p.description,
    score: s / max,
    tags: p.topics,
    latestVersion: p.npm.v2Version || p.npm.v1Version || p.npm.v0Version,
    stars: p.stars,
    supports: p.supports,
    repository: `https://github.com/${p.gitRepo}`,
  }));
}

// ---------------------------------------------------------------------------
// App-specific queries
// ---------------------------------------------------------------------------

function toAppInfo(p: RegistryPluginInfo): RegistryAppInfo {
  const meta = p.appMeta;
  return {
    name: p.name,
    displayName: meta?.displayName ?? p.name.replace(/^@elizaos\/app-/, ""),
    description: p.description,
    category: meta?.category ?? "game",
    launchType: meta?.launchType ?? "url",
    launchUrl: meta?.launchUrl ?? p.homepage,
    icon: meta?.icon ?? null,
    capabilities: meta?.capabilities ?? [],
    stars: p.stars,
    repository: `https://github.com/${p.gitRepo}`,
    latestVersion: p.npm.v2Version || p.npm.v1Version || p.npm.v0Version,
    supports: p.supports,
    npm: p.npm,
    // Pass through viewer config from the registry metadata
    viewer:
      meta?.launchType === "connect" || meta?.launchType === "local"
        ? {
            url: meta?.launchUrl ?? "",
            sandbox: "allow-scripts allow-same-origin allow-popups",
          }
        : undefined,
  };
}

/** List all registered apps. */
export async function listApps(): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const apps: RegistryAppInfo[] = [];

  for (const p of registry.values()) {
    if (p.kind === "app") {
      apps.push(toAppInfo(p));
    }
  }

  apps.sort((a, b) => b.stars - a.stars);
  return apps;
}

/** Look up a specific app by name. */
export async function getAppInfo(
  name: string,
): Promise<RegistryAppInfo | null> {
  const info = await getPluginInfo(name);
  if (!info || info.kind !== "app") return null;
  return toAppInfo(info);
}

/** Search apps by query. */
export async function searchApps(
  query: string,
  limit = 15,
): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const appEntries = [...registry.values()].filter((p) => p.kind === "app");

  const results = scoreEntries(
    appEntries,
    query,
    limit,
    (p) => [p.appMeta?.displayName?.toLowerCase() ?? ""],
    (p) => p.appMeta?.capabilities ?? [],
  );

  return results.map(({ p }) => toAppInfo(p));
}

// ---------------------------------------------------------------------------
// Non-app plugin queries (for unified Apps & Plugins view)
// ---------------------------------------------------------------------------

/** Slim plugin info returned by listNonAppPlugins / searchNonAppPlugins. */
export interface RegistryPluginListItem {
  name: string;
  description: string;
  stars: number;
  repository: string;
  topics: string[];
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
}

function toPluginListItem(p: RegistryPluginInfo): RegistryPluginListItem {
  return {
    name: p.name,
    description: p.description,
    stars: p.stars,
    repository: `https://github.com/${p.gitRepo}`,
    topics: p.topics,
    latestVersion: p.npm.v2Version || p.npm.v1Version || p.npm.v0Version,
    supports: p.supports,
    npm: p.npm,
  };
}

/** List all non-app plugins from the registry. */
export async function listNonAppPlugins(): Promise<RegistryPluginListItem[]> {
  const registry = await getRegistryPlugins();
  const plugins: RegistryPluginListItem[] = [];

  for (const p of registry.values()) {
    if (p.kind !== "app") {
      plugins.push(toPluginListItem(p));
    }
  }

  plugins.sort((a, b) => b.stars - a.stars);
  return plugins;
}

/** Search non-app plugins by query. */
export async function searchNonAppPlugins(
  query: string,
  limit = 15,
): Promise<RegistryPluginListItem[]> {
  const registry = await getRegistryPlugins();
  const pluginEntries = [...registry.values()].filter((p) => p.kind !== "app");

  const results = scoreEntries(pluginEntries, query, limit);
  return results.map(({ p }) => toPluginListItem(p));
}
