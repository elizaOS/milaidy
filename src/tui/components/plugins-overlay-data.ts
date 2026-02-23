import { loadMiladyConfig, saveMiladyConfig } from "../../config/config.js";
import { installPlugin } from "../../services/plugin-installer.js";
import { getRegistryPlugins } from "../../services/registry-client.js";
import type { PluginListItem } from "./plugins-installed-tab.js";
import {
  buildPluginCatalogIndex,
  inferRequiredKey,
  inferSensitiveKey,
  type PluginCatalogParam,
  readInstalledPluginMetadata,
} from "./plugins-overlay-catalog.js";
import { installPluginViaApiRequest } from "./plugins-overlay-data-api.js";
import {
  API_MASKED_SENTINEL,
  type ApiInstalledPluginInfo,
  type ApiPluginEntry,
  matchesInstalledPluginName,
  type PluginsOverlayOptions,
  registerPluginNameVariants,
} from "./plugins-overlay-data-shared.js";
import type { StorePluginItem } from "./plugins-store-tab.js";

export type { PluginsOverlayOptions } from "./plugins-overlay-data-shared.js";

export class PluginsOverlayDataBridge {
  private apiInstalledPluginNames = new Set<string>();

  constructor(private readonly options: PluginsOverlayOptions) {}

  getApiBaseUrl(): string | null {
    const base =
      this.options.apiBaseUrl?.trim() ||
      process.env.MILADY_API_BASE_URL?.trim() ||
      process.env.MILADY_API_BASE?.trim();
    if (!base) return null;
    return base.replace(/\/+$/, "");
  }

  private getApiToken(): string | null {
    const token = process.env.MILADY_API_TOKEN?.trim();
    return token ? token : null;
  }

  private async apiFetchJson<T>(
    apiBaseUrl: string,
    routePath: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = this.getApiToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${apiBaseUrl}${routePath}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as {
          error?: string;
          validationErrors?: Array<{ field?: string; message?: string }>;
        };
        if (typeof body.error === "string" && body.error.trim()) {
          message = body.error;
        } else if (Array.isArray(body.validationErrors)) {
          const first = body.validationErrors[0];
          if (first?.message) message = first.message;
        }
      } catch {
        // keep default message
      }
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  async getInstalledPlugins(): Promise<PluginListItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      try {
        return await this.getInstalledPluginsFromApi(apiBaseUrl);
      } catch {
        // Fall back to local config if API lookup fails.
      }
    }

    return this.getInstalledPluginsFromConfig();
  }

  private registerInstalledPluginName(name: string): void {
    registerPluginNameVariants(this.apiInstalledPluginNames, name);
  }

  private async loadApiInstalledPlugins(
    apiBaseUrl: string,
  ): Promise<ApiInstalledPluginInfo[]> {
    try {
      const response = await this.apiFetchJson<{
        plugins?: ApiInstalledPluginInfo[];
      }>(apiBaseUrl, "/api/plugins/installed");
      const plugins = response.plugins ?? [];

      this.apiInstalledPluginNames.clear();
      for (const plugin of plugins) {
        if (plugin.name) this.registerInstalledPluginName(plugin.name);
      }

      return plugins;
    } catch {
      return [];
    }
  }

  private async getInstalledPluginsFromApi(
    apiBaseUrl: string,
  ): Promise<PluginListItem[]> {
    const installed = await this.loadApiInstalledPlugins(apiBaseUrl);

    let response: { plugins: ApiPluginEntry[] };
    try {
      response = await this.apiFetchJson<{ plugins: ApiPluginEntry[] }>(
        apiBaseUrl,
        "/api/plugins",
      );
    } catch (err) {
      if (installed.length === 0) throw err;
      const fallbackItems: PluginListItem[] = [];
      for (const plugin of installed) {
        const name = plugin.name?.trim();
        if (!name) continue;
        const id = name.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");
        fallbackItems.push({
          id: id || name,
          name,
          description: "",
          enabled: true,
          category: "plugin",
          version: plugin.version ?? "unknown",
          configStatus: { set: 0, total: 0 },
          parameters: [],
        });
      }
      return fallbackItems;
    }

    const plugins = response.plugins ?? [];
    const matchedInstalled = new Set<string>();

    const items = plugins.map((plugin) => {
      const pluginId = plugin.id?.trim() || plugin.name?.trim() || "plugin";
      const npmName = plugin.npmName?.trim();
      if (npmName) this.registerInstalledPluginName(npmName);
      if (pluginId) this.registerInstalledPluginName(pluginId);

      const candidates = new Set<string>();
      if (pluginId) {
        candidates.add(pluginId);
        candidates.add(`plugin-${pluginId}`);
        candidates.add(`@elizaos/plugin-${pluginId}`);
      }
      if (npmName) {
        candidates.add(npmName);
      }

      let installedVersion: string | undefined;
      for (const entry of installed) {
        const installedName = entry.name?.trim();
        if (!installedName) continue;
        if (!matchesInstalledPluginName(candidates, installedName)) continue;
        matchedInstalled.add(installedName);
        installedVersion = entry.version ?? installedVersion;
      }

      const parameters = (plugin.parameters ?? []).map((param) => {
        const key = param.key;
        const hint = plugin.configUiHints?.[key];
        const options = Array.isArray(hint?.options)
          ? hint.options
              .map((opt) => {
                if (typeof opt === "string") return opt;
                if (typeof opt === "object" && opt !== null) {
                  const value = (opt as { value?: unknown }).value;
                  if (typeof value === "string") return value;
                }
                return null;
              })
              .filter((v): v is string => typeof v === "string")
          : undefined;

        return {
          key,
          label:
            typeof hint?.label === "string" && hint.label.trim()
              ? hint.label
              : key,
          value:
            param.sensitive && param.isSet
              ? API_MASKED_SENTINEL
              : (param.currentValue ?? ""),
          required: param.required,
          sensitive: param.sensitive,
          values: options,
        };
      });

      return {
        id: pluginId,
        name: plugin.name || pluginId,
        description: plugin.description ?? "",
        enabled: plugin.enabled !== false,
        category: plugin.category ?? "plugin",
        version: plugin.version ?? installedVersion ?? "unknown",
        configStatus: {
          set: (plugin.parameters ?? []).filter((p) => p.isSet).length,
          total: (plugin.parameters ?? []).length,
        },
        parameters,
      };
    });

    for (const entry of installed) {
      const installedName = entry.name?.trim();
      if (!installedName || matchedInstalled.has(installedName)) continue;
      const id = installedName
        .replace(/^@[^/]+\//, "")
        .replace(/^plugin-/, "")
        .trim();
      items.push({
        id: id || installedName,
        name: installedName,
        description: "",
        enabled: true,
        category: "plugin",
        version: entry.version ?? "unknown",
        configStatus: { set: 0, total: 0 },
        parameters: [],
      });
    }

    return items;
  }

  private async getInstalledPluginsFromConfig(): Promise<PluginListItem[]> {
    const cfg = loadMiladyConfig();
    const entries = cfg.plugins?.entries ?? {};
    const installs = cfg.plugins?.installs ?? {};
    const catalog = buildPluginCatalogIndex();
    const plugins: PluginListItem[] = [];

    const allIds = new Set([...Object.keys(entries), ...Object.keys(installs)]);

    for (const id of allIds) {
      const entry = entries[id];
      const install = installs[id];
      const config = (entry?.config ?? {}) as Record<string, unknown>;
      const catalogEntry = catalog.get(id);
      const installedMeta = readInstalledPluginMetadata(
        id,
        install?.installPath,
      );

      const mergedParamDefs: Record<string, PluginCatalogParam> = {
        ...(catalogEntry?.pluginParameters ?? {}),
        ...installedMeta.pluginParameters,
      };
      const mergedHints: Record<string, { label?: string }> = {
        ...(catalogEntry?.configUiHints ?? {}),
        ...installedMeta.configUiHints,
      };

      const declaredKeys = [
        ...(catalogEntry?.configKeys ?? []),
        ...installedMeta.configKeys,
        ...Object.keys(mergedParamDefs),
      ];
      const keySet = new Set([...declaredKeys, ...Object.keys(config)]);
      const keys = Array.from(keySet).sort((a, b) => a.localeCompare(b));

      const parameters = keys.map((key) => {
        const valueFromConfig = config[key];
        const value =
          valueFromConfig != null && valueFromConfig !== ""
            ? String(valueFromConfig)
            : (process.env[key] ?? "");
        const hint = mergedHints[key];
        const paramDef = mergedParamDefs[key];
        const sensitive =
          typeof paramDef?.sensitive === "boolean"
            ? paramDef.sensitive
            : inferSensitiveKey(key);
        const required =
          typeof paramDef?.required === "boolean"
            ? paramDef.required
            : inferRequiredKey(key, sensitive);

        return {
          key,
          label: hint?.label ?? key,
          value,
          required,
          sensitive,
        };
      });

      plugins.push({
        id,
        name: id,
        description: install?.spec ?? catalogEntry?.description ?? "",
        enabled: entry?.enabled !== false,
        category: id.includes("plugin-") ? "plugin" : "extension",
        version: install?.version ?? "unknown",
        configStatus: {
          set: parameters.filter((p) => p.value.trim() !== "").length,
          total: parameters.length,
        },
        parameters,
      });
    }

    return plugins;
  }

  async togglePluginEnabled(id: string, enabled: boolean): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.apiFetchJson<{ ok: boolean }>(
        apiBaseUrl,
        `/api/plugins/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        },
      );
      return;
    }

    const cfg = loadMiladyConfig();
    if (!cfg.plugins) cfg.plugins = {};
    if (!cfg.plugins.entries) cfg.plugins.entries = {};
    if (!cfg.plugins.entries[id]) cfg.plugins.entries[id] = {};
    cfg.plugins.entries[id].enabled = enabled;
    saveMiladyConfig(cfg);
  }

  async savePluginConfig(
    id: string,
    config: Record<string, string>,
  ): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      const filteredConfig = Object.fromEntries(
        Object.entries(config).filter(
          ([, value]) => value !== API_MASKED_SENTINEL,
        ),
      );
      await this.apiFetchJson<{ ok: boolean }>(
        apiBaseUrl,
        `/api/plugins/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ config: filteredConfig }),
        },
      );
      return;
    }

    const cfg = loadMiladyConfig();
    if (!cfg.plugins) cfg.plugins = {};
    if (!cfg.plugins.entries) cfg.plugins.entries = {};
    if (!cfg.plugins.entries[id]) cfg.plugins.entries[id] = {};
    cfg.plugins.entries[id].config = config;
    saveMiladyConfig(cfg);
  }

  async installPlugin(
    name: string,
  ): Promise<{ success: boolean; message: string }> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      return installPluginViaApiRequest(
        (routePath, init) => this.apiFetchJson(apiBaseUrl, routePath, init),
        name,
      );
    }

    const result = await installPlugin(name);
    if (!result.success) {
      return {
        success: false,
        message: result.error ?? `Failed to install ${name}`,
      };
    }

    const restartHint = result.requiresRestart
      ? " Restart milady to load it."
      : "";
    return {
      success: true,
      message: `${result.pluginName}@${result.version} installed.${restartHint}`,
    };
  }

  async getStorePlugins(): Promise<StorePluginItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.loadApiInstalledPlugins(apiBaseUrl);
    }

    const registry = await getRegistryPlugins();
    const cfg = loadMiladyConfig();
    const installs = cfg.plugins?.installs ?? {};

    const items: StorePluginItem[] = [];
    for (const [, p] of registry) {
      if (p.kind === "app") continue;
      items.push({
        name: p.name,
        description: p.description,
        latestVersion: p.npm.v2Version || p.npm.v1Version || p.npm.v0Version,
        stars: p.stars,
        supports: p.supports,
        installed: this.isPluginInstalled(p.name) || p.name in installs,
      });
    }

    items.sort((a, b) => b.stars - a.stars);
    return items;
  }

  async searchStore(query: string, limit = 15): Promise<StorePluginItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.loadApiInstalledPlugins(apiBaseUrl);
    }

    const { searchNonAppPlugins } = await import(
      "../../services/registry-client.js"
    );
    const results = await searchNonAppPlugins(query, limit);
    const cfg = loadMiladyConfig();
    const installs = cfg.plugins?.installs ?? {};

    return results.map((r) => ({
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      stars: r.stars,
      supports: r.supports,
      installed: this.isPluginInstalled(r.name) || r.name in installs,
    }));
  }

  isPluginInstalled(name: string): boolean {
    if (this.apiInstalledPluginNames.has(name)) {
      return true;
    }

    const normalized = name.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");
    if (normalized && this.apiInstalledPluginNames.has(normalized)) {
      return true;
    }

    try {
      const cfg = loadMiladyConfig();
      const installs = cfg.plugins?.installs ?? {};
      return name in installs;
    } catch {
      return false;
    }
  }
}
