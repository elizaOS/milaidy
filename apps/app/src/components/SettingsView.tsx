/**
 * Settings view — unified scrollable preferences panel.
 *
 * Sections:
 *   1. Appearance — theme picker
 *   2. AI Model — provider selection + config
 *   3. Media Generation — image, video, audio, vision provider selection
 *   4. Speech (TTS / STT) — provider + transcription config
 *   5. Updates — software update channel + check
 *   6. Advanced (collapsible) — Logs, Core Plugins, Database, Secrets,
 *      Chrome Extension, Export/Import, Danger Zone
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { THEMES, useApp } from "../AppContext";
import {
  client,
  type OnboardingOptions,
  type PluginParamDef,
} from "../api-client";
import type { ConfigUiHint } from "../types";
import { ConfigPageView } from "./ConfigPageView";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { PermissionsSection } from "./PermissionsSection";
import { formatByteSize } from "./shared/format";
import { autoLabel } from "./shared/labels";
import { VoiceConfigView } from "./VoiceConfigView";

/* ── Modal shell ─────────────────────────────────────────────────────── */

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{title}</div>
          <button
            type="button"
            className="text-[var(--muted)] hover:text-[var(--txt)] text-lg leading-none px-1"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Auto-detection helpers ────────────────────────────────────────── */

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView() {
  const {
    // Cloud
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudUserId,
    cloudLoginBusy,
    cloudLoginError,
    cloudDisconnecting,
    // Plugins
    plugins,
    pluginSaving,
    pluginSaveSuccess,
    // Theme
    currentTheme,
    // Updates
    updateStatus,
    updateLoading,
    updateChannelSaving: _updateChannelSaving,
    // Extension
    extensionStatus,
    extensionChecking,
    // Wallet
    walletExportVisible,
    walletExportData,
    // Export/Import
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importError,
    importSuccess,
    // Actions
    loadPlugins,
    handlePluginToggle,
    setTheme,
    setTab,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    handlePluginConfigSave,
    handleAgentExport,
    handleAgentImport,
    handleCloudLogin,
    handleCloudDisconnect,
    handleReset,
    handleExportKeys,
    copyToClipboard,
    setState,
  } = useApp();

  /* ── Model selection state ─────────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<
    OnboardingOptions["models"] | null
  >(null);

  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  useEffect(() => {
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();

    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
      } catch {
        /* ignore */
      }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        const cloudEnabledCfg = cloud?.enabled === true;
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";
        setCurrentSmallModel(
          models?.small || (cloudEnabledCfg ? defaultSmall : ""),
        );
        setCurrentLargeModel(
          models?.large || (cloudEnabledCfg ? defaultLarge : ""),
        );
      } catch {
        /* ignore */
      }
    })();
  }, [loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => (cloudEnabled ? "__cloud__" : null),
  );

  const hasManualSelection = useRef(false);
  useEffect(() => {
    if (hasManualSelection.current) return;

    if (cloudEnabled) {
      if (selectedProviderId !== "__cloud__")
        setSelectedProviderId("__cloud__");
      return;
    }
  }, [cloudEnabled, selectedProviderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve the actually-selected provider: accept __cloud__ or fall back */
  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId &&
          allAiProviders.some((p) => p.id === selectedProviderId)
        ? selectedProviderId
        : cloudEnabled
          ? "__cloud__"
          : (enabledAiProviders[0]?.id ?? null);

  const selectedProvider =
    resolvedSelectedId && resolvedSelectedId !== "__cloud__"
      ? (allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null)
      : null;

  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      /* Turn off cloud mode when switching to a local provider */
      try {
        await client.updateConfig({
          cloud: { enabled: false },
          agents: { defaults: { model: { primary: null } } },
        });
        setState("cloudEnabled", false);
      } catch {
        /* non-fatal */
      }
      if (!target.enabled) {
        await handlePluginToggle(newId, true);
      }
      for (const p of enabledAiProviders) {
        if (p.id !== newId) {
          await handlePluginToggle(p.id, false);
        }
      }
    },
    [allAiProviders, enabledAiProviders, handlePluginToggle, setState],
  );

  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    try {
      await client.updateConfig({
        cloud: { enabled: true },
        agents: { defaults: { model: { primary: null } } },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      setState("cloudEnabled", true);
    } catch {
      /* non-fatal */
    }
  }, [currentSmallModel, currentLargeModel, setState]);

  const ext = extensionStatus;
  const relayOk = ext?.relayReachable === true;

  /* ── Export / Import modal state ─────────────────────────────────── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportEstimateLoading, setExportEstimateLoading] = useState(false);
  const [exportEstimateError, setExportEstimateError] = useState<string | null>(
    null,
  );
  const [exportEstimate, setExportEstimate] = useState<{
    estimatedBytes: number;
    memoriesCount: number;
    entitiesCount: number;
    roomsCount: number;
    worldsCount: number;
    tasksCount: number;
  } | null>(null);

  const openExportModal = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
    setExportEstimate(null);
    setExportEstimateError(null);
    setExportEstimateLoading(true);
    setExportModalOpen(true);
    void (async () => {
      try {
        const estimate = await client.getExportEstimate();
        setExportEstimate(estimate);
      } catch (err) {
        setExportEstimateError(
          err instanceof Error
            ? err.message
            : "Failed to estimate export size.",
        );
      } finally {
        setExportEstimateLoading(false);
      }
    })();
  }, [setState]);

  const openImportModal = useCallback(() => {
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
    setImportModalOpen(true);
  }, [setState]);

  /* ── Fetch Models state ────────────────────────────────────────── */
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetchResult, setModelsFetchResult] = useState<string | null>(
    null,
  );

  const handleFetchModels = useCallback(
    async (providerId: string) => {
      setModelsFetching(true);
      setModelsFetchResult(null);
      try {
        const result = await client.fetchModels(providerId, true);
        const count = Array.isArray(result?.models) ? result.models.length : 0;
        setModelsFetchResult(`Loaded ${count} models`);
        // Reload plugins so configUiHints are refreshed with new model options
        await loadPlugins();
        setTimeout(() => setModelsFetchResult(null), 3000);
      } catch (err) {
        setModelsFetchResult(
          `Error: ${err instanceof Error ? err.message : "failed"}`,
        );
        setTimeout(() => setModelsFetchResult(null), 5000);
      }
      setModelsFetching(false);
    },
    [loadPlugins],
  );

  /* ── Plugin config local state for collecting field values ──────── */
  const [pluginFieldValues, setPluginFieldValues] = useState<
    Record<string, Record<string, string>>
  >({});

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

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">Settings</h2>
      <p className="text-[13px] text-[var(--muted)] mb-5">
        Appearance, AI provider, updates, and app preferences.
      </p>

      {/* ═══════════════════════════════════════════════════════════════
          1. APPEARANCE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-2">Appearance</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`theme-btn py-2 px-2 ${currentTheme === t.id ? "active" : ""}`}
              onClick={() => setTheme(t.id)}
            >
              <div className="text-xs font-bold text-[var(--text)] whitespace-nowrap text-center">
                {t.label}
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5 text-center whitespace-nowrap">
                {t.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          2. AI MODEL
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">AI Model</div>

        {(() => {
          const totalCols = allAiProviders.length + 1; /* +1 for Eliza Cloud */
          const isCloudSelected = resolvedSelectedId === "__cloud__";
          const providerChoices = [
            { id: "__cloud__", label: "Eliza Cloud", disabled: false },
            ...allAiProviders.map((provider) => ({
              id: provider.id,
              label: provider.name,
              disabled: false,
            })),
          ];

          if (totalCols === 0) {
            return (
              <div className="p-4 border border-[var(--warning,#f39c12)] bg-[var(--card)]">
                <div className="text-xs text-[var(--warning,#f39c12)]">
                  No AI providers available. Install a provider plugin from the{" "}
                  <button
                    type="button"
                    className="text-[var(--accent)] underline bg-transparent border-0 p-0 cursor-pointer"
                    onClick={() => {
                      setTab("plugins");
                    }}
                  >
                    Plugins
                  </button>{" "}
                  page.
                </div>
              </div>
            );
          }

          return (
            <>
              <div className="lg:hidden mb-3">
                <span className="block text-xs font-semibold mb-1.5">
                  Provider
                </span>
                <select
                  className="w-full px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
                  value={resolvedSelectedId ?? "__cloud__"}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId === "__cloud__") {
                      void handleSelectCloud();
                      return;
                    }
                    void handleSwitchProvider(nextId);
                  }}
                >
                  {providerChoices.map((choice) => (
                    <option
                      key={choice.id}
                      value={choice.id}
                      disabled={choice.disabled}
                    >
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="hidden lg:grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}
              >
                <button
                  type="button"
                  className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                    isCloudSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                  }`}
                  onClick={() => void handleSelectCloud()}
                >
                  <div
                    className={`text-xs font-bold whitespace-nowrap ${isCloudSelected ? "" : "text-[var(--text)]"}`}
                  >
                    Eliza Cloud
                  </div>
                </button>

                {allAiProviders.map((provider) => {
                  const isSelected =
                    !isCloudSelected && provider.id === resolvedSelectedId;
                  return (
                    <button
                      type="button"
                      key={provider.id}
                      className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                      }`}
                      onClick={() => void handleSwitchProvider(provider.id)}
                    >
                      <div
                        className={`text-xs font-bold whitespace-nowrap ${isSelected ? "" : "text-[var(--text)]"}`}
                      >
                        {provider.name}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Eliza Cloud settings */}
              {isCloudSelected && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  {cloudConnected ? (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                          <span className="text-xs font-semibold">
                            Logged into Eliza Cloud
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                          onClick={() => void handleCloudDisconnect()}
                          disabled={cloudDisconnecting}
                        >
                          {cloudDisconnecting
                            ? "Disconnecting..."
                            : "Disconnect"}
                        </button>
                      </div>

                      <div className="text-xs mb-4">
                        {cloudUserId && (
                          <span className="text-[var(--muted)] mr-3">
                            <code className="font-[var(--mono)] text-[11px]">
                              {cloudUserId}
                            </code>
                          </span>
                        )}
                        {cloudCredits !== null && (
                          <span>
                            <span className="text-[var(--muted)]">
                              Credits:
                            </span>{" "}
                            <span
                              className={
                                cloudCreditsCritical
                                  ? "text-[var(--danger,#e74c3c)] font-bold"
                                  : cloudCreditsLow
                                    ? "text-[#b8860b] font-bold"
                                    : ""
                              }
                            >
                              ${cloudCredits.toFixed(2)}
                            </span>
                            <a
                              href={cloudTopUpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] ml-2 text-[var(--accent)]"
                            >
                              Top up
                            </a>
                          </span>
                        )}
                      </div>

                      {modelOptions &&
                        (() => {
                          const modelSchema = {
                            type: "object" as const,
                            properties: {
                              small: {
                                type: "string",
                                enum: modelOptions.small.map((m) => m.id),
                                description: "Fast model for simple tasks",
                              },
                              large: {
                                type: "string",
                                enum: modelOptions.large.map((m) => m.id),
                                description:
                                  "Powerful model for complex reasoning",
                              },
                            },
                            required: [] as string[],
                          };
                          const modelHints: Record<string, ConfigUiHint> = {
                            small: { label: "Small Model", width: "half" },
                            large: { label: "Large Model", width: "half" },
                          };
                          const modelValues: Record<string, unknown> = {};
                          const modelSetKeys = new Set<string>();
                          if (currentSmallModel) {
                            modelValues.small = currentSmallModel;
                            modelSetKeys.add("small");
                          }
                          if (currentLargeModel) {
                            modelValues.large = currentLargeModel;
                            modelSetKeys.add("large");
                          }

                          return (
                            <ConfigRenderer
                              schema={modelSchema as JsonSchemaObject}
                              hints={modelHints}
                              values={modelValues}
                              setKeys={modelSetKeys}
                              registry={defaultRegistry}
                              onChange={(key, value) => {
                                const val = String(value);
                                if (key === "small") setCurrentSmallModel(val);
                                if (key === "large") setCurrentLargeModel(val);
                                const updated = {
                                  small:
                                    key === "small" ? val : currentSmallModel,
                                  large:
                                    key === "large" ? val : currentLargeModel,
                                };
                                void (async () => {
                                  setModelSaving(true);
                                  try {
                                    await client.updateConfig({
                                      models: updated,
                                    });
                                    setModelSaveSuccess(true);
                                    setTimeout(
                                      () => setModelSaveSuccess(false),
                                      2000,
                                    );
                                  } catch {
                                    /* ignore */
                                  }
                                  setModelSaving(false);
                                })();
                              }}
                            />
                          );
                        })()}

                      <div className="flex items-center justify-end gap-2 mt-3">
                        {modelSaving && (
                          <span className="text-[11px] text-[var(--muted)]">
                            Saving &amp; restarting...
                          </span>
                        )}
                        {modelSaveSuccess && (
                          <span className="text-[11px] text-[var(--ok,#16a34a)]">
                            Saved — restarting agent
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {cloudLoginBusy ? (
                        <div className="text-xs text-[var(--muted)]">
                          Waiting for browser authentication... A new tab should
                          have opened.
                        </div>
                      ) : (
                        <>
                          {cloudLoginError && (
                            <div className="text-xs text-[var(--danger,#e74c3c)] mb-2">
                              {cloudLoginError}
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn text-xs py-[5px] px-3.5 font-bold !mt-0"
                            onClick={() => void handleCloudLogin()}
                          >
                            Log in to Eliza Cloud
                          </button>
                          <div className="text-[11px] text-[var(--muted)] mt-1.5">
                            Opens a browser window to authenticate.
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Local provider settings ──────────────────────────── */}
              {!isCloudSelected &&
                selectedProvider &&
                selectedProvider.parameters.length > 0 &&
                (() => {
                  const isSaving = pluginSaving.has(selectedProvider.id);
                  const saveSuccess = pluginSaveSuccess.has(
                    selectedProvider.id,
                  );
                  const params = selectedProvider.parameters;
                  const setCount = params.filter(
                    (p: PluginParamDef) => p.isSet,
                  ).length;

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
                              borderColor: selectedProvider.configured
                                ? "#2d8a4e"
                                : "var(--warning,#f39c12)",
                              color: selectedProvider.configured
                                ? "#2d8a4e"
                                : "var(--warning,#f39c12)",
                            }}
                          >
                            {selectedProvider.configured
                              ? "Configured"
                              : "Needs Setup"}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const properties: Record<
                          string,
                          Record<string, unknown>
                        > = {};
                        const required: string[] = [];
                        const hints: Record<string, ConfigUiHint> = {};
                        const serverHints =
                          selectedProvider.configUiHints ?? {};
                        for (const p of params) {
                          const prop: Record<string, unknown> = {};
                          if (p.type === "boolean") prop.type = "boolean";
                          else if (p.type === "number") prop.type = "number";
                          else prop.type = "string";
                          if (p.description) prop.description = p.description;
                          if (p.default != null) prop.default = p.default;
                          if (p.options?.length) prop.enum = p.options;
                          const k = p.key.toUpperCase();
                          if (k.includes("URL") || k.includes("ENDPOINT"))
                            prop.format = "uri";
                          properties[p.key] = prop;
                          if (p.required) required.push(p.key);
                          hints[p.key] = {
                            label: autoLabel(p.key, selectedProvider.id),
                            sensitive: p.sensitive ?? false,
                            ...serverHints[p.key],
                          };
                          if (p.description && !hints[p.key].help)
                            hints[p.key].help = p.description;
                        }
                        const schema = {
                          type: "object",
                          properties,
                          required,
                        } as JsonSchemaObject;
                        const values: Record<string, unknown> = {};
                        const setKeys = new Set<string>();
                        for (const p of params) {
                          const cv =
                            pluginFieldValues[selectedProvider.id]?.[p.key];
                          if (cv !== undefined) {
                            values[p.key] = cv;
                          } else if (
                            p.isSet &&
                            !p.sensitive &&
                            p.currentValue != null
                          ) {
                            values[p.key] = p.currentValue;
                          }
                          if (p.isSet) setKeys.add(p.key);
                        }
                        return (
                          <ConfigRenderer
                            schema={schema}
                            hints={hints}
                            values={values}
                            setKeys={setKeys}
                            registry={defaultRegistry}
                            pluginId={selectedProvider.id}
                            onChange={(key, value) =>
                              handlePluginFieldChange(
                                selectedProvider.id,
                                key,
                                String(value ?? ""),
                              )
                            }
                          />
                        );
                      })()}

                      <div className="flex justify-between items-center mt-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)] hover:!text-[var(--text)] hover:!border-[var(--accent)]"
                            onClick={() =>
                              void handleFetchModels(selectedProvider.id)
                            }
                            disabled={modelsFetching}
                          >
                            {modelsFetching ? "Fetching..." : "Fetch Models"}
                          </button>
                          {modelsFetchResult && (
                            <span
                              className={`text-[11px] ${modelsFetchResult.startsWith("Error") ? "text-[var(--danger,#e74c3c)]" : "text-[var(--ok,#16a34a)]"}`}
                            >
                              {modelsFetchResult}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`btn text-xs py-[5px] px-4 !mt-0 ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                          onClick={() => handlePluginSave(selectedProvider.id)}
                          disabled={isSaving}
                        >
                          {isSaving
                            ? "Saving..."
                            : saveSuccess
                              ? "Saved"
                              : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          3. WALLET / RPC / SECRETS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6">
        <ConfigPageView embedded />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          4. MEDIA GENERATION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">Media Generation</div>
        <MediaSettingsSection />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          5. SPEECH (TTS / STT)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">Speech (TTS / STT)</div>
        <VoiceConfigView />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          6. PERMISSIONS & CAPABILITIES
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">Permissions & Capabilities</div>
        <PermissionsSection />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          7. UPDATES
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-bold text-sm">Software Updates</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {updateStatus ? (
                <>Version {updateStatus.currentVersion}</>
              ) : (
                <>Loading...</>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            disabled={updateLoading}
            onClick={() => void loadUpdateStatus(true)}
          >
            {updateLoading ? "Checking..." : "Check Now"}
          </button>
        </div>

        {updateStatus ? (
          <>
            <div className="mb-4">
              <ConfigRenderer
                schema={{
                  type: "object",
                  properties: {
                    channel: {
                      type: "string",
                      enum: ["stable", "beta", "nightly"],
                    },
                  },
                }}
                hints={{
                  channel: {
                    label: "Release Channel",
                    type: "radio",
                    width: "full",
                    options: [
                      {
                        value: "stable",
                        label: "Stable",
                        description: "Recommended — production-ready releases",
                      },
                      {
                        value: "beta",
                        label: "Beta",
                        description:
                          "Preview — early access to upcoming features",
                      },
                      {
                        value: "nightly",
                        label: "Nightly",
                        description:
                          "Bleeding edge — latest development builds",
                      },
                    ],
                  },
                }}
                values={{ channel: updateStatus.channel }}
                registry={defaultRegistry}
                onChange={(key, value) => {
                  if (key === "channel")
                    void handleChannelChange(
                      value as "stable" | "beta" | "nightly",
                    );
                }}
              />
            </div>

            {updateStatus.updateAvailable && updateStatus.latestVersion && (
              <div className="mt-3 py-2.5 px-3 border border-[var(--accent)] bg-[rgba(255,255,255,0.03)] rounded flex justify-between items-center">
                <div>
                  <div className="text-[13px] font-bold text-[var(--accent)]">
                    Update available
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {updateStatus.currentVersion} &rarr;{" "}
                    {updateStatus.latestVersion}
                  </div>
                </div>
                <div className="text-[11px] text-[var(--muted)] text-right">
                  Run{" "}
                  <code className="bg-[var(--bg-hover,rgba(255,255,255,0.05))] px-1.5 py-0.5 rounded-sm">
                    milady update
                  </code>
                </div>
              </div>
            )}

            {updateStatus.error && (
              <div className="mt-2 text-[11px] text-[var(--danger,#e74c3c)]">
                {updateStatus.error}
              </div>
            )}

            {updateStatus.lastCheckAt && (
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                Last checked:{" "}
                {new Date(updateStatus.lastCheckAt).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-3 text-[var(--muted)] text-xs">
            {updateLoading
              ? "Checking for updates..."
              : "Unable to load update status."}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          4. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">Chrome Extension</div>
          <button
            type="button"
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            onClick={() => void checkExtensionStatus()}
            disabled={extensionChecking}
          >
            {extensionChecking ? "Checking..." : "Check Connection"}
          </button>
        </div>

        {ext && (
          <div className="p-3 border border-[var(--border)] bg-[var(--bg-muted)] mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: relayOk
                    ? "var(--ok, #16a34a)"
                    : "var(--danger, #e74c3c)",
                }}
              />
              <span className="text-[13px] font-bold">
                Relay Server: {relayOk ? "Connected" : "Not Reachable"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] font-[var(--mono)]">
              ws://127.0.0.1:{ext.relayPort}/extension
            </div>
            {!relayOk && (
              <div className="text-xs text-[var(--danger,#e74c3c)] mt-1.5">
                The browser relay server is not running. Start the agent with
                browser control enabled, then check again.
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <div className="font-bold text-[13px] mb-2">
            Install Chrome Extension
          </div>
          <div className="text-xs text-[var(--muted)] leading-relaxed">
            <ol className="m-0 pl-5">
              <li className="mb-1.5">
                Open Chrome and navigate to{" "}
                <code className="text-[11px] px-1 border border-[var(--border)] bg-[var(--bg-muted)]">
                  chrome://extensions
                </code>
              </li>
              <li className="mb-1.5">
                Enable <strong>Developer mode</strong> (toggle in the top-right
                corner)
              </li>
              <li className="mb-1.5">
                Click <strong>&quot;Load unpacked&quot;</strong> and select the
                extension folder:
                {ext?.extensionPath ? (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1 break-all">
                      {ext.extensionPath}
                    </code>
                  </>
                ) : (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1">
                      apps/chrome-extension/
                    </code>
                    <span className="italic">
                      {" "}
                      (relative to milady package root)
                    </span>
                  </>
                )}
              </li>
              <li className="mb-1.5">
                Pin the extension icon in Chrome&apos;s toolbar
              </li>
              <li>
                Click the extension icon on any tab to attach/detach the Milady
                browser relay
              </li>
            </ol>
          </div>
        </div>

        {ext?.extensionPath && (
          <div className="mt-3 py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all">
            Extension path: {ext.extensionPath}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          11. EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center">
          <div className="font-bold text-sm">Agent Export / Import</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openImportModal}
            >
              Import
            </button>
            <button
              type="button"
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openExportModal}
            >
              Export
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          12. DANGER ZONE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-8 pt-6 border-t border-[var(--border)]">
        <h3 className="text-lg font-bold text-[var(--danger,#e74c3c)]">
          Danger Zone
        </h3>
        <p className="text-[13px] text-[var(--muted)] mb-5">
          Irreversible actions. Proceed with caution.
        </p>

        <div className="border border-[var(--danger,#e74c3c)] p-4 mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">Export Private Keys</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Reveal your EVM and Solana private keys. Never share these with
                anyone.
              </div>
            </div>
            <button
              type="button"
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
              style={{
                background: "var(--danger, #e74c3c)",
                borderColor: "var(--danger, #e74c3c)",
              }}
              onClick={() => void handleExportKeys()}
            >
              {walletExportVisible ? "Hide Keys" : "Export Keys"}
            </button>
          </div>
          {walletExportVisible && walletExportData && (
            <div className="mt-3 p-3 border border-[var(--danger,#e74c3c)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all leading-relaxed">
              {walletExportData.evm && (
                <div className="mb-2">
                  <strong>EVM Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">
                    ({walletExportData.evm.address})
                  </span>
                  <br />
                  <span>{walletExportData.evm.privateKey}</span>
                  <button
                    type="button"
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() =>
                      void copyToClipboard(walletExportData.evm?.privateKey)
                    }
                  >
                    copy
                  </button>
                </div>
              )}
              {walletExportData.solana && (
                <div>
                  <strong>Solana Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">
                    ({walletExportData.solana.address})
                  </span>
                  <br />
                  <span>{walletExportData.solana.privateKey}</span>
                  <button
                    type="button"
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() =>
                      void copyToClipboard(walletExportData.solana?.privateKey)
                    }
                  >
                    copy
                  </button>
                </div>
              )}
              {!walletExportData.evm && !walletExportData.solana && (
                <div className="text-[var(--muted)]">
                  No wallet keys configured.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border border-[var(--danger,#e74c3c)] p-4 flex justify-between items-center">
          <div>
            <div className="font-bold text-sm">Reset Agent</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Wipe all config, memory, and data. Returns to the onboarding
              wizard.
            </div>
          </div>
          <button
            type="button"
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
            style={{
              background: "var(--danger, #e74c3c)",
              borderColor: "var(--danger, #e74c3c)",
            }}
            onClick={() => void handleReset()}
          >
            Reset Everything
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Agent"
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Your character, memories, chats, secrets, and relationships will be
            downloaded as a single file. Exports are encrypted and require a
            password.
          </div>
          {exportEstimateLoading && (
            <div className="text-[11px] text-[var(--muted)]">
              Estimating export size…
            </div>
          )}
          {!exportEstimateLoading && exportEstimate && (
            <div className="text-[11px] text-[var(--muted)] border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2">
              <div>
                Estimated file size:{" "}
                {formatByteSize(exportEstimate.estimatedBytes)}
              </div>
              <div>
                Contains {exportEstimate.memoriesCount} memories,{" "}
                {exportEstimate.entitiesCount} entities,{" "}
                {exportEstimate.roomsCount} rooms, {exportEstimate.worldsCount}{" "}
                worlds, {exportEstimate.tasksCount} tasks.
              </div>
            </div>
          )}
          {!exportEstimateLoading && exportEstimateError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              Could not estimate export size: {exportEstimateError}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-xs">Encryption Password</span>
            <input
              type="password"
              placeholder="Enter password (minimum 4 characters)"
              value={exportPassword}
              onChange={(e) => setState("exportPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="text-[11px] text-[var(--muted)]">
              Password must be at least 4 characters.
            </div>
          </div>
          <span className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={exportIncludeLogs}
              onChange={(e) => setState("exportIncludeLogs", e.target.checked)}
            />
            Include logs in export
          </span>
          {exportError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              {exportError}
            </div>
          )}
          {exportSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">
              {exportSuccess}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
              onClick={() => setExportModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={exportBusy}
              onClick={() => void handleAgentExport()}
            >
              {exportBusy ? "Exporting..." : "Download Export"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Agent"
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Select an <code className="text-[11px]">.eliza-agent</code> export
            file and enter the password used during export.
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-xs">Export File</span>
            <input
              ref={importFileRef}
              type="file"
              accept=".eliza-agent"
              onChange={(e) => {
                setState("importFile", e.target.files?.[0] ?? null);
                setState("importError", null);
                setState("importSuccess", null);
              }}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-xs">Decryption Password</span>
            <input
              type="password"
              placeholder="Enter password (minimum 4 characters)"
              value={importPassword}
              onChange={(e) => setState("importPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="text-[11px] text-[var(--muted)]">
              Password must be at least 4 characters.
            </div>
          </div>
          {importError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              {importError}
            </div>
          )}
          {importSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">
              {importSuccess}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
              onClick={() => setImportModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={importBusy}
              onClick={() => void handleAgentImport()}
            >
              {importBusy ? "Importing..." : "Import Agent"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
