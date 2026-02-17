/**
 * ProviderSwitcher — Provider grid, cloud settings, and switching logic.
 *
 * Extracted from SettingsView.tsx for decomposition (P2 §10).
 * Composes SubscriptionStatus and ApiKeyConfig sub-components.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client, type OnboardingOptions, type PluginParamDef } from "../api-client";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { SubscriptionStatus } from "./SubscriptionStatus";
import { ApiKeyConfig } from "./ApiKeyConfig";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";

interface PluginInfo {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  parameters: PluginParamDef[];
  configUiHints?: Record<string, ConfigUiHint>;
}

export interface ProviderSwitcherProps {
  // Cloud state
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number | null;
  cloudCreditsLow: boolean;
  cloudCreditsCritical: boolean;
  cloudTopUpUrl: string;
  cloudUserId: string | null;
  cloudLoginBusy: boolean;
  cloudLoginError: string | null;
  cloudDisconnecting: boolean;
  // Plugins
  plugins: PluginInfo[];
  pluginSaving: Set<string>;
  pluginSaveSuccess: Set<string>;
  // Actions
  loadPlugins: () => Promise<void>;
  handlePluginToggle: (id: string, enabled: boolean) => Promise<void>;
  handlePluginConfigSave: (pluginId: string, values: Record<string, string>) => void;
  handleCloudLogin: () => Promise<void>;
  handleCloudDisconnect: () => Promise<void>;
  setState: (key: "cloudEnabled", value: boolean) => void;
  setTab: (tab: "plugins") => void;
}

export function ProviderSwitcher({
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
  plugins,
  pluginSaving,
  pluginSaveSuccess,
  loadPlugins,
  handlePluginToggle,
  handlePluginConfigSave,
  handleCloudLogin,
  handleCloudDisconnect,
  setState,
  setTab,
}: ProviderSwitcherProps) {
  /* ── Model selection state ─────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<OnboardingOptions["models"] | null>(null);
  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  /* ── Subscription state ────────────────────────────────────────── */
  const [subscriptionStatus, setSubscriptionStatus] = useState<Array<{
    provider: string;
    configured: boolean;
    valid: boolean;
    expiresAt: number | null;
  }>>([]);
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [openaiConnected, setOpenaiConnected] = useState(false);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const res = await client.getSubscriptionStatus();
      setSubscriptionStatus(res.providers ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadSubscriptionStatus();
    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
      } catch { /* ignore */ }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        const cloudEnabledCfg = cloud?.enabled === true;
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";
        setCurrentSmallModel(models?.small || (cloudEnabledCfg ? defaultSmall : ""));
        setCurrentLargeModel(models?.large || (cloudEnabledCfg ? defaultLarge : ""));
      } catch { /* ignore */ }
    })();
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const anthStatus = subscriptionStatus.find((s) => s.provider === "anthropic-subscription");
    const oaiStatus = subscriptionStatus.find((s) =>
      s.provider === "openai-subscription" || s.provider === "openai-codex",
    );
    setAnthropicConnected(Boolean(anthStatus?.configured && anthStatus?.valid));
    setOpenaiConnected(Boolean(oaiStatus?.configured && oaiStatus?.valid));
  }, [subscriptionStatus]);

  /* ── Derived ──────────────────────────────────────────────────── */
  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);
  const subscriptionProviders = [
    { id: "anthropic-subscription", label: "Claude Subscription" },
    { id: "openai-subscription", label: "ChatGPT Subscription" },
  ];
  const isSubscriptionId = (id: string | null) =>
    id === "anthropic-subscription" || id === "openai-subscription";

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => (cloudEnabled ? "__cloud__" : null),
  );
  const hasManualSelection = useRef(false);

  useEffect(() => {
    if (hasManualSelection.current) return;
    if (cloudEnabled) {
      if (selectedProviderId !== "__cloud__") setSelectedProviderId("__cloud__");
    }
  }, [cloudEnabled, selectedProviderId]);

  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId && (allAiProviders.some((p) => p.id === selectedProviderId) || isSubscriptionId(selectedProviderId))
        ? selectedProviderId
        : cloudEnabled
          ? "__cloud__"
          : anthropicConnected
            ? "anthropic-subscription"
            : openaiConnected
              ? "openai-subscription"
              : enabledAiProviders[0]?.id ?? null;

  const selectedProvider =
    resolvedSelectedId && resolvedSelectedId !== "__cloud__" && !isSubscriptionId(resolvedSelectedId)
      ? allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null
      : null;

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      try {
        const providerMap: Record<string, string> = {
          "@elizaos/plugin-openai": "openai",
          "@elizaos/plugin-anthropic": "anthropic",
          "@elizaos/plugin-google-genai": "google",
          "@elizaos/plugin-groq": "groq",
          "@elizaos/plugin-xai": "xai",
          "@elizaos/plugin-openrouter": "openrouter",
        };
        const switchId = providerMap[newId] ?? newId;
        await client.switchProvider(switchId);
        setState("cloudEnabled", false);
      } catch { /* non-fatal */ }
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

  const handleSelectSubscription = useCallback(
    async (providerId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(providerId);
      const pluginId =
        providerId === "anthropic-subscription"
          ? "@elizaos/plugin-anthropic"
          : "@elizaos/plugin-openai";
      const target = allAiProviders.find((p) => p.id === pluginId);
      if (!target) return;

      try {
        const switchId = providerId === "anthropic-subscription"
          ? "anthropic-subscription"
          : "openai-codex";
        await client.switchProvider(switchId);
        setState("cloudEnabled", false);
      } catch { /* non-fatal */ }
      if (!target.enabled) {
        await handlePluginToggle(target.id, true);
      }
      for (const p of enabledAiProviders) {
        if (p.id !== target.id) {
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
      await client.restartAgent();
    } catch { /* non-fatal */ }
  }, [currentSmallModel, currentLargeModel, setState]);

  /* ── Render ───────────────────────────────────────────────────── */
  const totalCols = allAiProviders.length + 1 + subscriptionProviders.length;
  const isCloudSelected = resolvedSelectedId === "__cloud__";
  const isSubscriptionSelected = resolvedSelectedId === "anthropic-subscription" || resolvedSelectedId === "openai-subscription";
  const providerChoices = [
    { id: "__cloud__", label: "Eliza Cloud", disabled: false },
    ...subscriptionProviders.map((provider) => ({
      id: provider.id,
      label: provider.label,
      disabled: false,
    })),
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
          <a
            href="#"
            className="text-[var(--accent)] underline"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              setTab("plugins");
            }}
          >
            Plugins
          </a>{" "}
          page.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile dropdown */}
      <div className="lg:hidden mb-3">
        <label className="block text-xs font-semibold mb-1.5">Provider</label>
        <select
          className="w-full px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
          value={resolvedSelectedId ?? "__cloud__"}
          onChange={(e) => {
            const nextId = e.target.value;
            if (nextId === "__cloud__") {
              void handleSelectCloud();
              return;
            }
            if (nextId === "anthropic-subscription" || nextId === "openai-subscription") {
              void handleSelectSubscription(nextId);
              return;
            }
            void handleSwitchProvider(nextId);
          }}
        >
          {providerChoices.map((choice) => (
            <option key={choice.id} value={choice.id} disabled={choice.disabled}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop grid */}
      <div
        className="hidden lg:grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}
      >
        <button
          className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
            isCloudSelected
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
              : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
          }`}
          onClick={() => void handleSelectCloud()}
        >
          <div className={`text-xs font-bold whitespace-nowrap ${isCloudSelected ? "" : "text-[var(--text)]"}`}>
            Eliza Cloud
          </div>
        </button>

        {subscriptionProviders.map((provider) => {
          const isSelected = !isCloudSelected && provider.id === resolvedSelectedId;
          return (
            <button
              key={provider.id}
              className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
              }`}
              onClick={() => void handleSelectSubscription(provider.id)}
            >
              <div className={`text-xs font-bold whitespace-nowrap ${isSelected ? "" : "text-[var(--text)]"}`}>
                {provider.label}
              </div>
            </button>
          );
        })}

        {allAiProviders.map((provider) => {
          const isSelected = !isCloudSelected && provider.id === resolvedSelectedId;
          return (
            <button
              key={provider.id}
              className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
              }`}
              onClick={() => void handleSwitchProvider(provider.id)}
            >
              <div className={`text-xs font-bold whitespace-nowrap ${isSelected ? "" : "text-[var(--text)]"}`}>
                {provider.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Cloud settings */}
      {isCloudSelected && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          {cloudConnected ? (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                  <span className="text-xs font-semibold">Logged into Eliza Cloud</span>
                </div>
                <button
                  className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                  onClick={() => void handleCloudDisconnect()}
                  disabled={cloudDisconnecting}
                >
                  {cloudDisconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>

              <div className="text-xs mb-4">
                {cloudUserId && (
                  <span className="text-[var(--muted)] mr-3">
                    <code className="font-[var(--mono)] text-[11px]">{cloudUserId}</code>
                  </span>
                )}
                {cloudCredits !== null && (
                  <span>
                    <span className="text-[var(--muted)]">Credits:</span>{" "}
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

              {modelOptions && (() => {
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
                      description: "Powerful model for complex reasoning",
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
                if (currentSmallModel) { modelValues.small = currentSmallModel; modelSetKeys.add("small"); }
                if (currentLargeModel) { modelValues.large = currentLargeModel; modelSetKeys.add("large"); }

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
                        small: key === "small" ? val : currentSmallModel,
                        large: key === "large" ? val : currentLargeModel,
                      };
                      void (async () => {
                        setModelSaving(true);
                        try {
                          await client.updateConfig({ models: updated });
                          setModelSaveSuccess(true);
                          setTimeout(() => setModelSaveSuccess(false), 2000);
                          await client.restartAgent();
                        } catch { /* ignore */ }
                        setModelSaving(false);
                      })();
                    }}
                  />
                );
              })()}

              <div className="flex items-center justify-end gap-2 mt-3">
                {modelSaving && <span className="text-[11px] text-[var(--muted)]">Saving &amp; restarting...</span>}
                {modelSaveSuccess && <span className="text-[11px] text-[var(--ok,#16a34a)]">Saved — restarting agent</span>}
              </div>
            </div>
          ) : (
            <div>
              {cloudLoginBusy ? (
                <div className="text-xs text-[var(--muted)]">
                  Waiting for browser authentication... A new tab should have opened.
                </div>
              ) : (
                <>
                  {cloudLoginError && (
                    <div className="text-xs text-[var(--danger,#e74c3c)] mb-2">
                      {cloudLoginError}
                    </div>
                  )}
                  <button
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

      {/* Subscription provider settings */}
      {isSubscriptionSelected && (
        <SubscriptionStatus
          resolvedSelectedId={resolvedSelectedId}
          subscriptionStatus={subscriptionStatus}
          anthropicConnected={anthropicConnected}
          setAnthropicConnected={setAnthropicConnected}
          openaiConnected={openaiConnected}
          setOpenaiConnected={setOpenaiConnected}
          handleSelectSubscription={handleSelectSubscription}
          loadSubscriptionStatus={loadSubscriptionStatus}
        />
      )}

      {/* Local provider settings (API keys) */}
      {!isCloudSelected && (
        <ApiKeyConfig
          selectedProvider={selectedProvider}
          pluginSaving={pluginSaving}
          pluginSaveSuccess={pluginSaveSuccess}
          handlePluginConfigSave={handlePluginConfigSave}
          loadPlugins={loadPlugins}
        />
      )}
    </>
  );
}
