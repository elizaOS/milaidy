/**
 * ApiKeyConfig — Local AI provider settings (API key input forms).
 *
 * Extracted from SettingsView.tsx for decomposition (P2 §10).
 */

import { useCallback, useState } from "react";
import { client, type PluginParamDef } from "../api-client";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { autoLabel } from "./shared/labels";

interface ProviderPlugin {
  id: string;
  name: string;
  parameters: PluginParamDef[];
  configured: boolean;
  configUiHints?: Record<string, ConfigUiHint>;
  enabled: boolean;
  category: string;
}

export interface ApiKeyConfigProps {
  selectedProvider: ProviderPlugin | null;
  pluginSaving: Set<string>;
  pluginSaveSuccess: Set<string>;
  handlePluginConfigSave: (pluginId: string, values: Record<string, string>) => void;
  loadPlugins: () => Promise<void>;
}

export function ApiKeyConfig({
  selectedProvider,
  pluginSaving,
  pluginSaveSuccess,
  handlePluginConfigSave,
  loadPlugins,
}: ApiKeyConfigProps) {
  const [pluginFieldValues, setPluginFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetchResult, setModelsFetchResult] = useState<string | null>(null);

  const handlePluginFieldChange = useCallback(
    (pluginId: string, key: string, value: string) => {
      setPluginFieldValues((prev) => ({
        ...prev,
        [pluginId]: { ...(prev[pluginId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const handlePluginSave = useCallback(
    (pluginId: string) => {
      const values = pluginFieldValues[pluginId] ?? {};
      void handlePluginConfigSave(pluginId, values);
    },
    [pluginFieldValues, handlePluginConfigSave],
  );

  const handleFetchModels = useCallback(
    async (providerId: string) => {
      setModelsFetching(true);
      setModelsFetchResult(null);
      try {
        const result = await client.fetchModels(providerId, true);
        const count = Array.isArray(result?.models) ? result.models.length : 0;
        setModelsFetchResult(`Loaded ${count} models`);
        await loadPlugins();
        setTimeout(() => setModelsFetchResult(null), 3000);
      } catch (err) {
        setModelsFetchResult(`Error: ${err instanceof Error ? err.message : "failed"}`);
        setTimeout(() => setModelsFetchResult(null), 5000);
      }
      setModelsFetching(false);
    },
    [loadPlugins],
  );

  if (!selectedProvider || selectedProvider.parameters.length === 0) return null;

  const isSaving = pluginSaving.has(selectedProvider.id);
  const saveSuccess = pluginSaveSuccess.has(selectedProvider.id);
  const params = selectedProvider.parameters;
  const setCount = params.filter((p: PluginParamDef) => p.isSet).length;

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const hints: Record<string, ConfigUiHint> = {};
  const serverHints = selectedProvider.configUiHints ?? {};
  for (const p of params) {
    const prop: Record<string, unknown> = {};
    if (p.type === "boolean") prop.type = "boolean";
    else if (p.type === "number") prop.type = "number";
    else prop.type = "string";
    if (p.description) prop.description = p.description;
    if (p.default != null) prop.default = p.default;
    if (p.options?.length) prop.enum = p.options;
    const k = p.key.toUpperCase();
    if (k.includes("URL") || k.includes("ENDPOINT")) prop.format = "uri";
    properties[p.key] = prop;
    if (p.required) required.push(p.key);
    hints[p.key] = {
      label: autoLabel(p.key, selectedProvider.id),
      sensitive: p.sensitive ?? false,
      ...serverHints[p.key],
    };
    if (p.description && !hints[p.key].help) hints[p.key].help = p.description;
  }
  const schema = { type: "object", properties, required } as JsonSchemaObject;
  const values: Record<string, unknown> = {};
  const setKeys = new Set<string>();
  for (const p of params) {
    const cv = pluginFieldValues[selectedProvider.id]?.[p.key];
    if (cv !== undefined) { values[p.key] = cv; }
    else if (p.isSet && !p.sensitive && p.currentValue != null) { values[p.key] = p.currentValue; }
    if (p.isSet) setKeys.add(p.key);
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs font-semibold">
          {selectedProvider.name} Settings
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--muted)]">
            {setCount}/{params.length} configured
          </span>
          <span
            className="text-[11px] px-2 py-[3px] border"
            style={{
              borderColor: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
              color: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
            }}
          >
            {selectedProvider.configured ? "Configured" : "Needs Setup"}
          </span>
        </div>
      </div>

      <ConfigRenderer
        schema={schema}
        hints={hints}
        values={values}
        setKeys={setKeys}
        registry={defaultRegistry}
        pluginId={selectedProvider.id}
        onChange={(key, value) => handlePluginFieldChange(selectedProvider.id, key, String(value ?? ""))}
      />

      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center gap-2">
          <button
            className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)] hover:!text-[var(--text)] hover:!border-[var(--accent)]"
            onClick={() => void handleFetchModels(selectedProvider.id)}
            disabled={modelsFetching}
          >
            {modelsFetching ? "Fetching..." : "Fetch Models"}
          </button>
          {modelsFetchResult && (
            <span className={`text-[11px] ${modelsFetchResult.startsWith("Error") ? "text-[var(--danger,#e74c3c)]" : "text-[var(--ok,#16a34a)]"}`}>
              {modelsFetchResult}
            </span>
          )}
        </div>
        <button
          className={`btn text-xs py-[5px] px-4 !mt-0 ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
          onClick={() => handlePluginSave(selectedProvider.id)}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
