/**
 * Registry Client for Milady.
 *
 * Provides a 3-tier cached registry (memory → file → network) that works
 * offline, in .app bundles, and in dev. Fetches from the next@registry branch.
 *
 * @module services/registry-client
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATED_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/refs/heads/next%40registry/generated-registry.json";
const INDEX_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/refs/heads/next%40registry/index.json";
const CACHE_TTL_MS = 3_600_000; // 1 hour

const LOCAL_APP_DEFAULT_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

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
  /** Absolute local workspace package path when discovered from filesystem. */
  localPath?: string;
  /** Set to "app" when this entry is a launchable application */
  kind?: string;
  /** App metadata — present when kind is "app" */
  appMeta?: RegistryAppMeta;
}

export interface RegistryAppViewerMeta {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
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
  viewer?: RegistryAppViewerMeta;
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

interface LocalPackageAppMeta {
  displayName?: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  icon?: string | null;
  capabilities?: string[];
  minPlayers?: number | null;
  maxPlayers?: number | null;
  viewer?: RegistryAppViewerMeta;
}

interface LocalPackageElizaConfig {
  kind?: string;
  app?: LocalPackageAppMeta;
}

interface LocalPackageJson {
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string | { type?: string; url?: string };
  elizaos?: LocalPackageElizaConfig;
}

interface LocalPluginManifest {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string | { type?: string; url?: string };
  kind?: string;
  app?: LocalPackageAppMeta;
}

interface LocalAppOverride {
  displayName?: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  capabilities?: string[];
  viewer?: RegistryAppViewerMeta;
}

const LOCAL_APP_OVERRIDES: Readonly<Record<string, LocalAppOverride>> = {
  "@elizaos/app-babylon": {
    launchType: "url",
    launchUrl: "http://localhost:3000",
    viewer: {
      url: "http://localhost:3000",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-hyperscape": {
    launchType: "connect",
    launchUrl: "http://localhost:3333",
    viewer: {
      url: "http://localhost:3333",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        quality: "medium",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-hyperfy": {
    launchType: "connect",
    launchUrl: "http://localhost:3003",
    viewer: {
      url: "http://localhost:3003",
      sandbox: LOCAL_APP_DEFAULT_SANDBOX,
    },
  },
  "@elizaos/app-2004scape": {
    launchType: "connect",
    launchUrl: "http://localhost:8880",
    viewer: {
      url: "http://localhost:8880",
      embedParams: { bot: "{RS_SDK_BOT_NAME}" },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-agent-town": {
    launchType: "url",
    launchUrl: "http://localhost:5173/ai-town/index.html",
    viewer: {
      url: "http://localhost:5173/ai-town/index.html",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-dungeons": {
    launchType: "local",
    launchUrl: "http://localhost:3345",
    viewer: {
      url: "http://localhost:3345",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
};

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      ordered.push(resolved);
    }
  }
  return ordered;
}

function resolveWorkspaceRoots(): string[] {
  const envRoot = process.env.MILADY_WORKSPACE_ROOT?.trim();
  if (envRoot) return uniquePaths([envRoot]);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, "..", "..");
  const cwd = process.cwd();
  const roots = [
    packageRoot,
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return uniquePaths(roots);
}

function repoString(
  repo: LocalPackageJson["repository"] | LocalPluginManifest["repository"],
): string | null {
  if (!repo) return null;
  if (typeof repo === "string") return repo;
  if (typeof repo.url === "string" && repo.url.length > 0) return repo.url;
  return null;
}

function normaliseGitHubRepo(repo: string | null): string | null {
  if (!repo) return null;
  const cleaned = repo
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .trim();
  if (!cleaned.includes("/")) return null;
  return cleaned;
}

function mergeViewer(
  base: RegistryAppViewerMeta | undefined,
  patch: RegistryAppViewerMeta | undefined,
): RegistryAppViewerMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    embedParams: {
      ...(base.embedParams ?? {}),
      ...(patch.embedParams ?? {}),
    },
  };
}

function mergeAppMeta(
  base: RegistryAppMeta | undefined,
  patch: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    capabilities:
      patch.capabilities.length > 0 ? patch.capabilities : base.capabilities,
    viewer: mergeViewer(base.viewer, patch.viewer),
  };
}

function cacheFilePath(): string {
  const base =
    process.env.MILADY_STATE_DIR?.trim() || path.join(os.homedir(), ".milady");
  return path.join(base, "cache", "registry.json");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toLocalAppMeta(
  app: LocalPackageAppMeta | undefined,
  fallbackDisplayName: string,
): RegistryAppMeta | undefined {
  if (!app) return undefined;
  const launchType = app.launchType ?? "url";
  return {
    displayName: app.displayName ?? fallbackDisplayName,
    category: app.category ?? "game",
    launchType,
    launchUrl: app.launchUrl ?? null,
    icon: app.icon ?? null,
    capabilities: app.capabilities ?? [],
    minPlayers: app.minPlayers ?? null,
    maxPlayers: app.maxPlayers ?? null,
    viewer: app.viewer,
  };
}

function toDisplayNameFromDirName(dirName: string): string {
  return dirName
    .replace(/^app-/, "")
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseRepositoryMetadata(
  repository:
    | LocalPackageJson["repository"]
    | LocalPluginManifest["repository"]
    | undefined,
): { gitRepo: string; gitUrl: string } {
  const repoValue = repoString(repository);
  const gitRepo = normaliseGitHubRepo(repoValue) ?? "local/workspace";
  return {
    gitRepo,
    gitUrl: `https://github.com/${gitRepo}.git`,
  };
}

function resolveAppOverride(
  packageName: string,
  appMeta: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  const override = LOCAL_APP_OVERRIDES[packageName];
  if (!override) return appMeta;
  const base: RegistryAppMeta = appMeta ?? {
    displayName:
      override.displayName ?? packageName.replace(/^@elizaos\/app-/, ""),
    category: override.category ?? "game",
    launchType: override.launchType ?? "url",
    launchUrl: override.launchUrl ?? null,
    icon: null,
    capabilities: override.capabilities ?? [],
    minPlayers: null,
    maxPlayers: null,
    viewer: override.viewer,
  };
  return {
    ...base,
    displayName: override.displayName ?? base.displayName,
    category: override.category ?? base.category,
    launchType: override.launchType ?? base.launchType,
    launchUrl:
      override.launchUrl !== undefined ? override.launchUrl : base.launchUrl,
    capabilities:
      override.capabilities !== undefined
        ? override.capabilities
        : base.capabilities,
    viewer: mergeViewer(base.viewer, override.viewer),
  };
}

function buildDiscoveredEntry(
  packageDir: string,
  dirName: string,
  packageJson: LocalPackageJson,
  manifest: LocalPluginManifest | null,
): RegistryPluginInfo | null {
  if (!packageJson?.name || packageJson.name.length === 0) return null;

  const packageAppMeta = toLocalAppMeta(
    packageJson.elizaos?.app,
    toDisplayNameFromDirName(dirName),
  );
  const manifestAppMeta = toLocalAppMeta(
    manifest?.app,
    toDisplayNameFromDirName(dirName),
  );
  const mergedMeta = mergeAppMeta(manifestAppMeta, packageAppMeta);
  const overriddenMeta = resolveAppOverride(packageJson.name, mergedMeta);

  const kind =
    packageJson.elizaos?.kind === "app" || manifest?.kind === "app"
      ? "app"
      : overriddenMeta
        ? "app"
        : undefined;

  const repo = parseRepositoryMetadata(
    packageJson.repository ?? manifest?.repository,
  );
  const description = packageJson.description ?? manifest?.description ?? "";
  const homepage =
    packageJson.homepage ??
    manifest?.homepage ??
    overriddenMeta?.launchUrl ??
    null;
  const version = packageJson.version ?? manifest?.version ?? null;

  return {
    name: packageJson.name,
    gitRepo: repo.gitRepo,
    gitUrl: repo.gitUrl,
    description,
    homepage,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: packageJson.name,
      v0Version: null,
      v1Version: null,
      v2Version: version,
    },
    git: {
      v0Branch: null,
      v1Branch: null,
      v2Branch: "main",
    },
    supports: { v0: false, v1: false, v2: true },
    localPath: packageDir,
    kind,
    appMeta: overriddenMeta ?? undefined,
  };
}

async function discoverLocalWorkspaceApps(): Promise<
  Map<string, RegistryPluginInfo>
> {
  const discovered = new Map<string, RegistryPluginInfo>();

  // 1. Scan workspace plugins/ directories for app-* folders
  for (const workspaceRoot of resolveWorkspaceRoots()) {
    const pluginsDir = path.join(workspaceRoot, "plugins");
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (
        (!entry.isDirectory() && !entry.isSymbolicLink()) ||
        !entry.name.startsWith("app-")
      )
        continue;
      const packageDir = path.join(pluginsDir, entry.name);
      const packageJson = await readJsonFile<LocalPackageJson>(
        path.join(packageDir, "package.json"),
      );
      if (!packageJson) continue;

      const manifest = await readJsonFile<LocalPluginManifest>(
        path.join(packageDir, "elizaos.plugin.json"),
      );
      const info = buildDiscoveredEntry(
        packageDir,
        entry.name,
        packageJson,
        manifest,
      );
      if (info) discovered.set(info.name, info);
    }
  }

  // 2. Scan user-installed plugins (~/.milady/plugins/installed/) for kind: "app"
  const stateDir =
    process.env.MILADY_STATE_DIR?.trim() || path.join(os.homedir(), ".milady");
  const installedBase = path.join(stateDir, "plugins", "installed");
  try {
    const installedEntries = await fs.readdir(installedBase, {
      withFileTypes: true,
    });
    for (const entry of installedEntries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const installDir = path.join(installedBase, entry.name);
      // Installed plugins nest inside node_modules — find the actual package
      const nmDir = path.join(installDir, "node_modules");
      const pkgDirs: string[] = [];
      try {
        const nmEntries = await fs.readdir(nmDir, { withFileTypes: true });
        for (const nm of nmEntries) {
          if (nm.name.startsWith("@")) {
            // Scoped package — read one level deeper
            const scopeDir = path.join(nmDir, nm.name);
            try {
              const scopeEntries = await fs.readdir(scopeDir, {
                withFileTypes: true,
              });
              for (const se of scopeEntries) {
                pkgDirs.push(path.join(scopeDir, se.name));
              }
            } catch {
              /* skip */
            }
          } else if (nm.isDirectory() || nm.isSymbolicLink()) {
            pkgDirs.push(path.join(nmDir, nm.name));
          }
        }
      } catch {
        continue;
      }

      for (const pkgDir of pkgDirs) {
        const pkgJson = await readJsonFile<LocalPackageJson>(
          path.join(pkgDir, "package.json"),
        );
        if (!pkgJson?.name) continue;
        // Only include if this is an app-kind plugin
        if (pkgJson.elizaos?.kind !== "app") continue;
        // Skip if already discovered from workspace
        if (discovered.has(pkgJson.name)) continue;

        const manifest = await readJsonFile<LocalPluginManifest>(
          path.join(pkgDir, "elizaos.plugin.json"),
        );
        const dirName = pkgJson.name
          .replace(/^@[^/]+\//, "")
          .replace(/^plugin-/, "app-");
        const info = buildDiscoveredEntry(pkgDir, dirName, pkgJson, manifest);
        if (info) discovered.set(info.name, info);
      }
    }
  } catch {
    // installed dir may not exist
  }

  return discovered;
}

async function applyLocalWorkspaceApps(
  plugins: Map<string, RegistryPluginInfo>,
): Promise<void> {
  const localApps = await discoverLocalWorkspaceApps();
  if (localApps.size === 0) return;

  for (const [name, localInfo] of localApps.entries()) {
    const existing = plugins.get(name);
    if (!existing) {
      plugins.set(name, localInfo);
      continue;
    }

    plugins.set(name, {
      ...existing,
      localPath: localInfo.localPath,
      kind: localInfo.kind ?? existing.kind,
      appMeta: mergeAppMeta(existing.appMeta, localInfo.appMeta),
      description: localInfo.description || existing.description,
      homepage: localInfo.homepage ?? existing.homepage,
      npm: {
        ...existing.npm,
        package: existing.npm.package || localInfo.npm.package,
        v2Version: existing.npm.v2Version ?? localInfo.npm.v2Version,
      },
      git: {
        v0Branch: existing.git.v0Branch ?? localInfo.git.v0Branch,
        v1Branch: existing.git.v1Branch ?? localInfo.git.v1Branch,
        v2Branch: existing.git.v2Branch ?? localInfo.git.v2Branch,
      },
    });
  }
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
              viewer?: {
                url: string;
                embedParams?: Record<string, string>;
                postMessageAuth?: boolean;
                sandbox?: string;
              };
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

        if (e.kind === "app" || e.app) {
          info.kind = "app";
        }
        if (e.app) {
          info.appMeta = {
            displayName: e.app.displayName,
            category: e.app.category,
            launchType: e.app.launchType,
            launchUrl: e.app.launchUrl,
            icon: e.app.icon,
            capabilities: e.app.capabilities || [],
            minPlayers: e.app.minPlayers ?? null,
            maxPlayers: e.app.maxPlayers ?? null,
            viewer: e.app.viewer,
          };
        }

        plugins.set(name, info);
      }
      await applyLocalWorkspaceApps(plugins);
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
  await applyLocalWorkspaceApps(plugins);
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
    await applyLocalWorkspaceApps(fromFile);
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
  const viewer = meta?.viewer
    ? {
        url: meta.viewer.url,
        embedParams: meta.viewer.embedParams,
        postMessageAuth: meta.viewer.postMessageAuth,
        sandbox: meta.viewer.sandbox ?? LOCAL_APP_DEFAULT_SANDBOX,
      }
    : meta?.launchType === "connect" || meta?.launchType === "local"
      ? {
          url: meta?.launchUrl ?? "",
          sandbox: LOCAL_APP_DEFAULT_SANDBOX,
        }
      : undefined;

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
    viewer,
  };
}

function toAppEntry(p: RegistryPluginInfo): RegistryPluginInfo | null {
  if (p.kind === "app" || p.appMeta) {
    return {
      ...p,
      kind: "app",
      appMeta: p.appMeta,
    };
  }

  const appMeta = resolveAppOverride(p.name, undefined);
  if (!appMeta) return null;
  return {
    ...p,
    kind: "app",
    appMeta,
  };
}

/** List all registered apps. */
export async function listApps(): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const apps: RegistryAppInfo[] = [];

  for (const p of registry.values()) {
    const appEntry = toAppEntry(p);
    if (!appEntry) continue;
    apps.push(toAppInfo(appEntry));
  }

  apps.sort((a, b) => b.stars - a.stars);
  return apps;
}

/** Look up a specific app by name. */
export async function getAppInfo(
  name: string,
): Promise<RegistryAppInfo | null> {
  const info = await getPluginInfo(name);
  if (!info) return null;
  const appEntry = toAppEntry(info);
  if (!appEntry) return null;
  return toAppInfo(appEntry);
}

/** Search apps by query. */
export async function searchApps(
  query: string,
  limit = 15,
): Promise<RegistryAppInfo[]> {
  const registry = await getRegistryPlugins();
  const appEntries: RegistryPluginInfo[] = [];
  for (const p of registry.values()) {
    const appEntry = toAppEntry(p);
    if (appEntry) appEntries.push(appEntry);
  }

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
