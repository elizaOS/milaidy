/**
 * Plugins management view — configure and enable/disable plugins.
 * Tailwind 1:1 mirror of the Lit `renderPlugins()` / `renderPluginCard()` UI.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.js";
import { client } from "../../ui/api-client.js";
import type { PluginInfo, PluginParamDef } from "../../ui/api-client.js";

/* ── Helpers ────────────────────────────────────────────────────────── */

const ACRONYMS = new Set([
  "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
  "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
]);

/** Strip plugin-id prefix and title-case the env-key into a human label. */
function autoLabel(key: string, pluginId: string): string {
  const prefixes = [
    pluginId.toUpperCase().replace(/-/g, "_") + "_",
    pluginId.toUpperCase().replace(/-/g, "") + "_",
  ];
  let remainder = key;
  for (const prefix of prefixes) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      remainder = key.slice(prefix.length);
      break;
    }
  }
  return remainder
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Infer the best input type from the parameter definition. */
function autoFieldType(param: PluginParamDef): "text" | "password" | "boolean" | "number" | "url" {
  if (param.type === "boolean") return "boolean";
  if (param.sensitive) return "password";
  const k = param.key.toUpperCase();
  if (k.includes("URL") || k.includes("ENDPOINT")) return "url";
  if (param.type === "number" || k.includes("PORT") || k.includes("TIMEOUT") || k.includes("DELAY")) return "number";
  return "text";
}

/** Detect advanced / debug parameters that should be collapsed by default. */
function isAdvancedParam(param: PluginParamDef): boolean {
  const k = param.key.toUpperCase();
  const d = (param.description ?? "").toLowerCase();
  return (
    k.includes("EXPERIMENTAL") ||
    k.includes("DEBUG") ||
    k.includes("VERBOSE") ||
    k.includes("TELEMETRY") ||
    k.includes("BROWSER_BASE") ||
    d.includes("experimental") ||
    d.includes("advanced") ||
    d.includes("debug")
  );
}

type Categories = "all" | "ai-provider" | "connector" | "feature";
const CATEGORIES: Categories[] = ["all", "ai-provider", "connector", "feature"];
const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  "ai-provider": "AI Provider",
  connector: "Connector",
  feature: "Feature",
};

type StatusFilter = "all" | "enabled";

/* ── Component ──────────────────────────────────────────────────────── */

export function PluginsView() {
  const {
    plugins,
    pluginFilter,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginAdvancedOpen,
    pluginSaving,
    pluginSaveSuccess,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    setActionNotice,
    setState,
  } = useApp();

  const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, string>>>({});
  const [passwordVisible, setPasswordVisible] = useState<Set<string>>(new Set());
  const [addDirOpen, setAddDirOpen] = useState(false);
  const [addDirPath, setAddDirPath] = useState("");
  const [addDirLoading, setAddDirLoading] = useState(false);

  // Load plugins on mount
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // ── Derived data ───────────────────────────────────────────────────

  const nonDbPlugins = useMemo(() => plugins.filter((p: PluginInfo) => p.category !== "database"), [plugins]);

  const filtered = useMemo(() => {
    const searchLower = pluginSearch.toLowerCase();
    return nonDbPlugins.filter((p: PluginInfo) => {
      const matchesCategory = pluginFilter === "all" || p.category === pluginFilter;
      const matchesStatus =
        pluginStatusFilter === "all" ||
        (pluginStatusFilter === "enabled" && p.enabled) ||
        (pluginStatusFilter === "disabled" && !p.enabled);
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        (p.description ?? "").toLowerCase().includes(searchLower) ||
        p.id.toLowerCase().includes(searchLower);
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [nonDbPlugins, pluginFilter, pluginStatusFilter, pluginSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.enabled && b.enabled) {
        const aNeedsConfig = a.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ?? false;
        const bNeedsConfig = b.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ?? false;
        if (aNeedsConfig !== bNeedsConfig) return aNeedsConfig ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const enabledCount = useMemo(() => nonDbPlugins.filter((p: PluginInfo) => p.enabled).length, [nonDbPlugins]);

  // ── Handlers ───────────────────────────────────────────────────────

  const toggleSettings = (pluginId: string) => {
    const next = new Set(pluginSettingsOpen);
    if (next.has(pluginId)) next.delete(pluginId);
    else next.add(pluginId);
    setState("pluginSettingsOpen", next);
  };

  const toggleAdvanced = (pluginId: string) => {
    const next = new Set(pluginAdvancedOpen);
    if (next.has(pluginId)) next.delete(pluginId);
    else next.add(pluginId);
    setState("pluginAdvancedOpen", next);
  };

  const handleParamChange = (pluginId: string, paramKey: string, value: string) => {
    setPluginConfigs((prev) => ({
      ...prev,
      [pluginId]: { ...prev[pluginId], [paramKey]: value },
    }));
  };

  const handleConfigSave = async (pluginId: string) => {
    const config = pluginConfigs[pluginId] ?? {};
    await handlePluginConfigSave(pluginId, config);
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleConfigReset = (pluginId: string) => {
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setPasswordVisible((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  // ── Add from directory ──────────────────────────────────────────────

  const handleAddFromDirectory = async () => {
    const trimmed = addDirPath.trim();
    if (!trimmed) return;
    setAddDirLoading(true);
    try {
      await client.installRegistryPlugin(trimmed);
      await loadPlugins();
      setAddDirPath("");
      setAddDirOpen(false);
      setActionNotice(`Plugin installed from ${trimmed}`, "success");
    } catch (err) {
      setActionNotice(
        `Failed to add plugin: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
    }
    setAddDirLoading(false);
  };

  // ── Field renderers ────────────────────────────────────────────────

  const renderField = (plugin: PluginInfo, param: PluginParamDef) => {
    const fieldType = autoFieldType(param);
    const label = autoLabel(param.key, plugin.id);
    const configValue = pluginConfigs[plugin.id]?.[param.key];
    const currentValue =
      configValue !== undefined ? configValue : param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
    const effectiveValue = currentValue || (param.default ?? "");
    const pwKey = `${plugin.id}:${param.key}`;

    return (
      <div key={param.key} className="mb-4">
        {/* Label row */}
        <div className="flex items-center gap-1.5 text-[13px] font-semibold mb-1">
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
              param.isSet ? "bg-ok" : param.required ? "bg-destructive" : "bg-muted"
            }`}
          />
          <span>{label}</span>
          {param.required && (
            <span className="text-[10px] text-destructive font-normal">required</span>
          )}
          {param.isSet && (
            <span className="text-[10px] text-ok font-normal">configured</span>
          )}
        </div>

        {/* Env key */}
        <div className="font-mono text-[10px] text-muted mb-1.5">
          <code className="bg-bg-hover px-1 py-px border border-border">{param.key}</code>
        </div>

        {/* Input */}
        {fieldType === "boolean" ? (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="sr-only"
              checked={
                configValue !== undefined
                  ? configValue === "true" || configValue === "1"
                  : param.isSet
                    ? param.currentValue === "true" || param.currentValue === "1"
                    : String(param.default) === "true" || String(param.default) === "1"
              }
              onChange={(e) =>
                handleParamChange(plugin.id, param.key, e.target.checked ? "true" : "false")
              }
            />
            <div
              className={`relative w-9 h-[18px] transition-colors duration-150 ${
                (configValue !== undefined
                  ? configValue === "true" || configValue === "1"
                  : param.isSet
                    ? param.currentValue === "true" || param.currentValue === "1"
                    : String(param.default) === "true" || String(param.default) === "1")
                  ? "bg-accent"
                  : "bg-muted"
              }`}
            >
              <div
                className={`absolute w-3.5 h-3.5 bg-white top-[2px] transition-[left] duration-150 ${
                  (configValue !== undefined
                    ? configValue === "true" || configValue === "1"
                    : param.isSet
                      ? param.currentValue === "true" || param.currentValue === "1"
                      : String(param.default) === "true" || String(param.default) === "1")
                    ? "left-5"
                    : "left-[2px]"
                }`}
              />
            </div>
            <span className="text-xs text-muted">
              {(configValue !== undefined
                ? configValue === "true" || configValue === "1"
                : param.isSet
                  ? param.currentValue === "true" || param.currentValue === "1"
                  : String(param.default) === "true" || String(param.default) === "1")
                ? "Enabled"
                : "Disabled"}
            </span>
          </label>
        ) : fieldType === "password" ? (
          <div className="flex">
            <input
              type={passwordVisible.has(pwKey) ? "text" : "password"}
              className="flex-1 w-full px-2.5 py-[7px] border border-border border-r-0 bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
              value={configValue ?? ""}
              onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
              placeholder={param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}
            />
            <button
              type="button"
              className="px-3 py-[7px] border border-border bg-bg-hover text-[11px] text-muted whitespace-nowrap min-w-[48px] text-center transition-colors duration-150 hover:bg-surface hover:text-txt cursor-pointer"
              onClick={() => togglePasswordVisibility(pwKey)}
            >
              {passwordVisible.has(pwKey) ? "Hide" : "Show"}
            </button>
          </div>
        ) : param.options && param.options.length > 0 ? (
          <select
            className="w-full px-2.5 py-[7px] border border-border bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none"
            value={effectiveValue}
            onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
          >
            {!param.required && <option value="">— none —</option>}
            {param.options.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={fieldType === "number" ? "number" : fieldType === "url" ? "url" : "text"}
            className="w-full px-2.5 py-[7px] border border-border bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
            value={currentValue}
            onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
            placeholder={param.default ? `Default: ${param.default}` : "Enter value..."}
          />
        )}

        {/* Help text */}
        {param.description && (
          <div className="text-[11px] text-muted mt-1 leading-relaxed">
            {param.description}
            {param.default != null && (
              <span className="opacity-70"> (default: {String(param.default)})</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Card renderer ──────────────────────────────────────────────────

  const renderCard = (p: PluginInfo) => {
    const hasParams = p.parameters && p.parameters.length > 0;
    const settingsOpen = pluginSettingsOpen.has(p.id);
    const setCount = hasParams ? p.parameters.filter((param: PluginParamDef) => param.isSet).length : 0;
    const totalCount = hasParams ? p.parameters.length : 0;
    const allParamsSet = !hasParams || setCount === totalCount;
    const progress = totalCount > 0 ? (setCount / totalCount) * 100 : 100;
    const categoryLabel = p.category === "ai-provider" ? "ai provider" : p.category;
    const generalParams = hasParams ? p.parameters.filter((param: PluginParamDef) => !isAdvancedParam(param)) : [];
    const advancedParams = hasParams ? p.parameters.filter((param: PluginParamDef) => isAdvancedParam(param)) : [];
    const advancedOpen = pluginAdvancedOpen.has(p.id);
    const isSaving = pluginSaving.has(p.id);
    const saveSuccess = pluginSaveSuccess.has(p.id);

    const enabledBorder = p.enabled
      ? p.enabled && !allParamsSet && hasParams
        ? "border-l-[3px] border-l-warn"
        : "border-l-[3px] border-l-accent"
      : "";

    return (
      <div
        key={p.id}
        className={`border border-border bg-card flex flex-col transition-colors duration-150 ${enabledBorder}`}
        data-plugin-id={p.id}
      >
        {/* Header */}
        <div
          className={`flex flex-col p-[14px_18px] gap-2.5 flex-1 ${hasParams ? "cursor-pointer hover:bg-bg-hover" : ""}`}
          onClick={hasParams ? () => toggleSettings(p.id) : undefined}
        >
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm">{p.name}</span>
              <span className="text-[10px] px-1.5 py-px border border-border bg-surface text-muted lowercase tracking-wide whitespace-nowrap">
                {categoryLabel}
              </span>
              {!allParamsSet && hasParams && (
                <span className="text-[10px] px-1.5 py-px border border-warn bg-warn-subtle text-warn lowercase tracking-wide whitespace-nowrap">
                  {setCount}/{totalCount}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="text-xs text-muted mt-[3px] line-clamp-3">
              {p.description || "No description available"}
            </div>

            {/* Version / npm meta */}
            {(p.version || p.npmName) && (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {p.version && (
                  <span className="text-[10px] font-mono text-muted opacity-70">v{p.version}</span>
                )}
                {p.npmName && (
                  <span className="text-[10px] font-mono text-muted opacity-60">{p.npmName}</span>
                )}
              </div>
            )}

            {/* Dependencies */}
            {p.pluginDeps && p.pluginDeps.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                <span className="text-[9px] text-muted opacity-70">depends on:</span>
                {p.pluginDeps.map((dep: string) => (
                  <span
                    key={dep}
                    className="text-[9px] px-[5px] py-px border border-border bg-accent-subtle text-muted tracking-wide"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div
            className="flex items-center justify-end gap-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            {hasParams && (
              <div
                className="w-[52px] h-[5px] bg-surface border border-border overflow-hidden"
                title={`${setCount}/${totalCount} configured`}
              >
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Toggle switch */}
            <label className="relative inline-flex cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={p.enabled}
                onChange={(e) => handlePluginToggle(p.id, e.target.checked)}
              />
              <div
                className={`relative w-9 h-[18px] transition-colors duration-150 ${
                  p.enabled ? "bg-accent" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute w-3.5 h-3.5 bg-white top-[2px] transition-[left] duration-150 ${
                    p.enabled ? "left-5" : "left-[2px]"
                  }`}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Settings bar */}
        {hasParams && (
          <div
            className="flex items-center gap-2 px-[18px] pb-2.5 cursor-pointer text-xs font-semibold select-none hover:opacity-80"
            role="button"
            tabIndex={0}
            onClick={() => toggleSettings(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleSettings(p.id);
              }
            }}
          >
            <span
              className={`inline-block text-[10px] transition-transform duration-150 ${
                settingsOpen ? "rotate-90" : ""
              }`}
            >
              &#9654;
            </span>
            <span
              className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
                allParamsSet ? "bg-ok" : "bg-destructive"
              }`}
            />
            <span>Settings</span>
            <span className="font-normal text-muted">
              ({setCount}/{totalCount} configured)
            </span>
          </div>
        )}

        {/* Settings panel */}
        {settingsOpen && hasParams && (
          <div className="border-t border-border p-[18px] bg-surface animate-[pc-slide-in_200ms_ease]">
            {generalParams.map((param: PluginParamDef) => renderField(p, param))}

            {advancedParams.length > 0 && (
              <>
                <div
                  className="flex items-center gap-1.5 text-xs text-muted cursor-pointer py-2 my-1 mb-2 border-t border-dashed border-border select-none hover:text-txt"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleAdvanced(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleAdvanced(p.id);
                    }
                  }}
                >
                  <span
                    className={`inline-block text-[10px] transition-transform duration-150 ${
                      advancedOpen ? "rotate-90" : ""
                    }`}
                  >
                    &#9654;
                  </span>
                  Advanced ({advancedParams.length})
                </div>
                {advancedOpen && advancedParams.map((param: PluginParamDef) => renderField(p, param))}
              </>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
              <button
                type="button"
                className="bg-transparent border border-border text-muted cursor-pointer text-xs px-4 py-[5px] hover:text-txt hover:bg-bg-hover"
                onClick={() => handleConfigReset(p.id)}
              >
                Reset
              </button>
              <button
                type="button"
                className={`text-xs px-4 py-[5px] cursor-pointer border transition-colors duration-150 ${
                  saveSuccess
                    ? "!bg-ok !text-white !border-ok"
                    : "bg-accent text-accent-fg border-accent hover:bg-accent-hover"
                }`}
                onClick={() => handleConfigSave(p.id)}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Validation errors */}
        {p.enabled && p.validationErrors && p.validationErrors.length > 0 && (
          <div className="px-[18px] py-2 border-t border-destructive bg-[rgba(153,27,27,0.04)] text-xs">
            {p.validationErrors.map((err: { field: string; message: string }, i: number) => (
              <div key={i} className="text-destructive mb-0.5">
                {err.field}: {err.message}
              </div>
            ))}
          </div>
        )}

        {/* Validation warnings */}
        {p.enabled && p.validationWarnings && p.validationWarnings.length > 0 && (
          <div className="px-[18px] py-1 pb-2">
            {p.validationWarnings.map((w: { field: string; message: string }, i: number) => (
              <div key={i} className="text-warn text-[11px]">
                {w.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar: search + category filters + status toggle — all one row */}
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            className="w-full py-[5px] px-3 pr-8 border border-border bg-card text-[13px] transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:italic"
            placeholder="Search plugins..."
            value={pluginSearch}
            onChange={(e) => setState("pluginSearch", e.target.value)}
          />
          {pluginSearch && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted cursor-pointer text-sm px-1.5 py-px leading-none hover:text-txt"
              onClick={() => setState("pluginSearch", "")}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Category filters */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`px-2.5 py-[3px] border text-[11px] cursor-pointer transition-colors duration-150 ${
                pluginFilter === cat
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-txt border-border hover:bg-bg-hover"
              }`}
              onClick={() => setState("pluginFilter", cat)}
            >
              {CATEGORY_LABELS[cat]} (
              {cat === "all"
                ? nonDbPlugins.length
                : nonDbPlugins.filter((p: PluginInfo) => p.category === cat).length}
              )
            </button>
          ))}
        </div>

        {/* Status toggle: All / Enabled */}
        <div className="flex gap-1 shrink-0">
          {(["all", "enabled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-2.5 py-[3px] border text-[11px] cursor-pointer transition-colors duration-150 ${
                pluginStatusFilter === s
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-txt border-border hover:bg-bg-hover"
              }`}
              onClick={() => setState("pluginStatusFilter", s as StatusFilter)}
            >
              {s === "all" ? "All" : `Enabled (${enabledCount})`}
            </button>
          ))}
        </div>

        {/* Add plugin button */}
        <button
          type="button"
          className="px-2.5 py-[3px] border border-accent bg-accent text-accent-fg text-[11px] cursor-pointer shrink-0 hover:bg-accent-hover hover:border-accent-hover"
          onClick={() => setAddDirOpen(true)}
        >
          + Add Plugin
        </button>
      </div>

      {/* Plugin grid */}
      <div className="overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-10 px-5 text-muted border border-dashed border-border">
            {pluginSearch ? "No plugins match your search." : "No plugins in this category."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {sorted.map((p: PluginInfo) => renderCard(p))}
          </div>
        )}
      </div>

      {/* Add from directory modal */}
      {addDirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAddDirOpen(false);
              setAddDirPath("");
            }
          }}
        >
          <div className="w-full max-w-md border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-sm">Add Plugin</div>
              <button
                className="text-muted hover:text-txt text-lg leading-none px-1"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-muted mb-3">
              Enter the path to a local plugin directory or package name.
            </p>

            <input
              type="text"
              className="w-full py-2 px-3 border border-border bg-bg text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
              placeholder="/path/to/plugin or package-name"
              value={addDirPath}
              onChange={(e) => setAddDirPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFromDirectory();
              }}
              autoFocus
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-[5px] border border-border bg-transparent text-muted text-xs cursor-pointer hover:text-txt hover:bg-bg-hover"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-[5px] border border-accent bg-accent text-accent-fg text-xs cursor-pointer hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleAddFromDirectory}
                disabled={addDirLoading || !addDirPath.trim()}
              >
                {addDirLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
