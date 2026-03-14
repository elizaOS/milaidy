import type {
  RegistryAppInfo,
  RegistryPluginInfo,
  RegistryPluginListItem,
  RegistrySearchResult,
} from "./registry-client.js";

export function normalizePluginLookupAlias(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  if (lower === "obsidan") return "obsidian";
  if (lower === "plugin-obsidan") return "plugin-obsidian";
  if (lower === "@elizaos/plugin-obsidan") return "@elizaos/plugin-obsidian";

  return trimmed;
}

export function getPluginInfoFromRegistry(
  registry: Map<string, RegistryPluginInfo>,
  name: string,
): RegistryPluginInfo | null {
  let pluginInfo = registry.get(name);
  if (pluginInfo) return pluginInfo;

  if (!name.startsWith("@")) {
    pluginInfo = registry.get(`@elizaos/${name}`);
    if (pluginInfo) return pluginInfo;

    pluginInfo = registry.get(`@elizaos/plugin-${name}`);
    if (pluginInfo) return pluginInfo;
  }

  const bare = name.replace(/^@[^/]+\//, "");
  for (const [key, value] of registry) {
    if (key.endsWith(`/${bare}`)) return value;
  }

  return null;
}

export function scoreEntries(
  entries: Iterable<RegistryPluginInfo>,
  query: string,
  limit: number,
  extraNames?: (plugin: RegistryPluginInfo) => string[],
  extraTerms?: (plugin: RegistryPluginInfo) => string[],
): Array<{ plugin: RegistryPluginInfo; score: number }> {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter((term) => term.length > 1);
  const scored: Array<{ plugin: RegistryPluginInfo; score: number }> = [];

  for (const plugin of entries) {
    const lowerName = plugin.name.toLowerCase();
    const lowerDescription = plugin.description.toLowerCase();
    const aliases = extraNames?.(plugin) ?? [];
    let score = 0;

    if (
      lowerName === lowerQuery ||
      lowerName === `@elizaos/${lowerQuery}` ||
      aliases.some((alias) => alias === lowerQuery)
    )
      score += 100;
    else if (
      lowerName.includes(lowerQuery) ||
      aliases.some((alias) => alias.includes(lowerQuery))
    )
      score += 50;
    if (lowerDescription.includes(lowerQuery)) score += 30;
    for (const topic of plugin.topics)
      if (topic.toLowerCase().includes(lowerQuery)) score += 25;
    for (const term of extraTerms?.(plugin) ?? [])
      if (term.toLowerCase().includes(lowerQuery)) score += 25;
    for (const term of terms) {
      if (lowerName.includes(term) || aliases.some((alias) => alias.includes(term)))
        score += 15;
      if (lowerDescription.includes(term)) score += 10;
      for (const topic of plugin.topics)
        if (topic.toLowerCase().includes(term)) score += 8;
    }
    if (score > 0) {
      if (plugin.stars > 100) score += 3;
      if (plugin.stars > 500) score += 3;
      if (plugin.stars > 1000) score += 4;
      scored.push({ plugin, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.plugin.stars - a.plugin.stars);
  return scored.slice(0, limit);
}

export function toSearchResults(
  results: Array<{ plugin: RegistryPluginInfo; score: number }>,
): RegistrySearchResult[] {
  const maxScore = results[0]?.score || 1;
  return results.map(({ plugin, score }) => ({
    name: plugin.name,
    description: plugin.description,
    score: score / maxScore,
    tags: plugin.topics,
    latestVersion: plugin.npm.v2Version || plugin.npm.v1Version || plugin.npm.v0Version,
    stars: plugin.stars,
    supports: plugin.supports,
    repository: `https://github.com/${plugin.gitRepo}`,
  }));
}

export function toAppInfo(
  plugin: RegistryPluginInfo,
  sanitizeSandbox: (value?: string) => string,
  defaultSandbox: string,
): RegistryAppInfo {
  const meta = plugin.appMeta;
  const viewer = meta?.viewer
    ? {
        url: meta.viewer.url,
        embedParams: meta.viewer.embedParams,
        postMessageAuth: meta.viewer.postMessageAuth,
        sandbox: sanitizeSandbox(meta.viewer.sandbox),
      }
    : meta?.launchType === "connect" || meta?.launchType === "local"
      ? {
          url: meta?.launchUrl ?? "",
          sandbox: defaultSandbox,
        }
      : undefined;

  return {
    name: plugin.name,
    displayName: meta?.displayName ?? plugin.name.replace(/^@elizaos\/app-/, ""),
    description: plugin.description,
    category: meta?.category ?? "game",
    launchType: meta?.launchType ?? "url",
    launchUrl: meta?.launchUrl ?? plugin.homepage,
    icon: meta?.icon ?? null,
    capabilities: meta?.capabilities ?? [],
    stars: plugin.stars,
    repository: `https://github.com/${plugin.gitRepo}`,
    latestVersion: plugin.npm.v2Version || plugin.npm.v1Version || plugin.npm.v0Version,
    supports: plugin.supports,
    npm: plugin.npm,
    viewer,
  };
}

export function toAppEntry(
  plugin: RegistryPluginInfo,
  resolveAppOverride: (
    packageName: string,
    appMeta: RegistryPluginInfo["appMeta"],
  ) => RegistryPluginInfo["appMeta"],
): RegistryPluginInfo | null {
  if (plugin.kind === "app" || plugin.appMeta) {
    return {
      ...plugin,
      kind: "app",
      appMeta: plugin.appMeta,
    };
  }

  const appMeta = resolveAppOverride(plugin.name, undefined);
  if (!appMeta) return null;
  return {
    ...plugin,
    kind: "app",
    appMeta,
  };
}

export function toPluginListItem(
  plugin: RegistryPluginInfo,
): RegistryPluginListItem {
  return {
    name: plugin.name,
    description: plugin.description,
    stars: plugin.stars,
    repository: `https://github.com/${plugin.gitRepo}`,
    topics: plugin.topics,
    latestVersion: plugin.npm.v2Version || plugin.npm.v1Version || plugin.npm.v0Version,
    supports: plugin.supports,
    npm: plugin.npm,
  };
}
