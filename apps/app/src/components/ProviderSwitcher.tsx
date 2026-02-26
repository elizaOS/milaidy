/**
 * ProviderSwitcher — Provider grid, cloud settings, and switching logic.
 *
 * Extracted from SettingsView.tsx for decomposition (P2 §10).
 * Composes SubscriptionStatus and ApiKeyConfig sub-components.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  client,
  type OnboardingOptions,
  type PluginParamDef,
} from "../api-client";
import type { ConfigUiHint } from "../types";
import { ApiKeyConfig } from "./ApiKeyConfig";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { SubscriptionStatus } from "./SubscriptionStatus";

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
  handlePluginConfigSave: (
    pluginId: string,
    values: Record<string, string>,
  ) => void;
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
  const [modelOptions, setModelOptions] = useState<
    OnboardingOptions["models"] | null
  >(null);
  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  /* ── Subscription state ────────────────────────────────────────── */
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    Array<{
      provider: string;
      configured: boolean;
      valid: boolean;
      expiresAt: number | null;
    }>
  >([]);
  const [anthropicConnected, setAnthropicConnected] = useState(false);
  const [openaiConnected, setOpenaiConnected] = useState(false);

  /* ── pi-ai state ──────────────────────────────────────────────── */
  const [piAiEnabled, setPiAiEnabled] = useState(false);
  const [piAiModelSpec, setPiAiModelSpec] = useState("");
  const [piAiModelOptions, setPiAiModelOptions] = useState<
    OnboardingOptions["piAiModels"]
  >([]);
  const [piAiDefaultModelSpec, setPiAiDefaultModelSpec] = useState("");
  const [piAiSaving, setPiAiSaving] = useState(false);
  const [piAiSaveSuccess, setPiAiSaveSuccess] = useState(false);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const res = await client.getSubscriptionStatus();
      setSubscriptionStatus(res.providers ?? []);
    } catch (err) {
      console.warn("[milady] Failed to load subscription status", err);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptionStatus();
    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
        setPiAiModelOptions(opts.piAiModels ?? []);
        setPiAiDefaultModelSpec(
          typeof opts.piAiDefaultModel === "string"
            ? opts.piAiDefaultModel
            : "",
        );
      } catch (err) {
        console.warn("[milady] Failed to load onboarding options", err);
      }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        const cloudEnabledCfg = cloud?.enabled === true;
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";

        // Environment variables — needed both for model fallback and pi-ai
        const env = cfg.env as Record<string, unknown> | undefined;
        const vars = (env?.vars as Record<string, unknown> | undefined) ?? {};

        // Fall back to SMALL_MODEL / LARGE_MODEL env vars when cfg.models
        // is empty.  Local providers (e.g. Ollama) store the active model
        // names as env vars rather than in cfg.models.
        const envSmall =
          typeof vars.SMALL_MODEL === "string" ? vars.SMALL_MODEL : "";
        const envLarge =
          typeof vars.LARGE_MODEL === "string" ? vars.LARGE_MODEL : "";
        setCurrentSmallModel(
          models?.small || envSmall || (cloudEnabledCfg ? defaultSmall : ""),
        );
        setCurrentLargeModel(
          models?.large || envLarge || (cloudEnabledCfg ? defaultLarge : ""),
        );
        const rawPiAi =
          (typeof vars.MILAIDY_USE_PI_AI === "string"
            ? vars.MILAIDY_USE_PI_AI
            : undefined) ||
          (typeof env?.MILAIDY_USE_PI_AI === "string"
            ? env.MILAIDY_USE_PI_AI
            : "");
        const piAiOn = ["1", "true", "yes"].includes(
          rawPiAi.trim().toLowerCase(),
        );
        setPiAiEnabled(piAiOn);

        const agents = cfg.agents as Record<string, unknown> | undefined;
        const defaults = agents?.defaults as
          | Record<string, unknown>
          | undefined;
        const model = defaults?.model as Record<string, unknown> | undefined;
        setPiAiModelSpec(
          typeof model?.primary === "string" ? model.primary : "",
        );
      } catch (err) {
        console.warn("[milady] Failed to load config", err);
      }
    })();
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const anthStatus = subscriptionStatus.find(
      (s) => s.provider === "anthropic-subscription",
    );
    const oaiStatus = subscriptionStatus.find(
      (s) =>
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
    if (piAiEnabled) {
      if (selectedProviderId !== "pi-ai") setSelectedProviderId("pi-ai");
      return;
    }
    if (cloudEnabled) {
      if (selectedProviderId !== "__cloud__")
        setSelectedProviderId("__cloud__");
    }
  }, [cloudEnabled, piAiEnabled, selectedProviderId]);

  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId === "pi-ai"
        ? "pi-ai"
        : selectedProviderId &&
            (allAiProviders.some((p) => p.id === selectedProviderId) ||
              isSubscriptionId(selectedProviderId))
          ? selectedProviderId
          : cloudEnabled
            ? "__cloud__"
            : piAiEnabled
              ? "pi-ai"
              : anthropicConnected
                ? "anthropic-subscription"
                : openaiConnected
                  ? "openai-subscription"
                  : (enabledAiProviders[0]?.id ?? null);

  const selectedProvider =
    resolvedSelectedId &&
    resolvedSelectedId !== "__cloud__" &&
    resolvedSelectedId !== "pi-ai" &&
    !isSubscriptionId(resolvedSelectedId)
      ? (allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null)
      : null;

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      // Direct providers require API keys. The UI does not have access to stored
      // secrets, so we avoid calling /api/provider/switch here and instead rely
      // on enabling/disabling provider plugins + saving provider config.
      const willTogglePlugins =
        !target.enabled || enabledAiProviders.some((p) => p.id !== newId);
      if (cloudEnabled || piAiEnabled) {
        try {
          await client.updateConfig({
            cloud: { enabled: false },
            env: { vars: { MILAIDY_USE_PI_AI: "" } },
          });
          setState("cloudEnabled", false);
          setPiAiEnabled(false);
          if (!willTogglePlugins) {
            await client.restartAgent();
          }
        } catch (err) {
          console.warn(
            "[milady] Failed to disable cloud/pi-ai config during provider switch",
            err,
          );
        }
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
    [
      allAiProviders,
      enabledAiProviders,
      handlePluginToggle,
      setState,
      cloudEnabled,
      piAiEnabled,
    ],
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
        await client.updateConfig({
          cloud: { enabled: false },
          env: { vars: { MILAIDY_USE_PI_AI: "" } },
        });
        const switchId =
          providerId === "anthropic-subscription"
            ? "anthropic-subscription"
            : "openai-codex";
        await client.switchProvider(switchId);
        setState("cloudEnabled", false);
        setPiAiEnabled(false);
      } catch (err) {
        console.warn("[milady] Provider switch failed", err);
      }
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
        env: { vars: { MILAIDY_USE_PI_AI: "" } },
        agents: { defaults: { model: { primary: null } } },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      setState("cloudEnabled", true);
      setPiAiEnabled(false);
      await client.restartAgent();
    } catch (err) {
      console.warn("[milady] Failed to select cloud provider", err);
    }
  }, [currentSmallModel, currentLargeModel, setState]);

  const handlePiAiSave = useCallback(async () => {
    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      await client.updateConfig({
        cloud: { enabled: false },
        env: { vars: { MILAIDY_USE_PI_AI: "1" } },
        agents: {
          defaults: {
            model: {
              primary: piAiModelSpec.trim() || null,
            },
          },
        },
      });
      setState("cloudEnabled", false);
      setPiAiEnabled(true);
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
      await client.restartAgent();
    } catch (err) {
      console.warn("[milady] Failed to enable pi-ai", err);
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiModelSpec, setState]);

  const handleSelectPiAi = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("pi-ai");
    await handlePiAiSave();
  }, [handlePiAiSave]);

  const normalizedPiAiModelSpec = piAiModelSpec.trim();
  const hasKnownPiAiModel = (piAiModelOptions ?? []).some(
    (model) => model.id === normalizedPiAiModelSpec,
  );
  const piAiModelSelectValue =
    normalizedPiAiModelSpec.length === 0
      ? ""
      : hasKnownPiAiModel
        ? normalizedPiAiModelSpec
        : "__custom__";

  /* ── Render ───────────────────────────────────────────────────── */
  const totalCols = allAiProviders.length + 2 + subscriptionProviders.length;
  const isCloudSelected = resolvedSelectedId === "__cloud__";
  const isPiAiSelected = resolvedSelectedId === "pi-ai";
  const isSubscriptionSelected =
    resolvedSelectedId === "anthropic-subscription" ||
    resolvedSelectedId === "openai-subscription";
  const providerChoices = [
    { id: "__cloud__", label: "Eliza Cloud", disabled: false },
    { id: "pi-ai", label: "Pi (pi-ai)", disabled: false },
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
          <button
            type="button"
            className="text-[var(--accent)] underline"
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
      {/* Provider dropdown - fixes overflow issue with grid layout */}
      <div className="mb-3">
        <label
          htmlFor="provider-switcher-select"
          className="block text-xs font-semibold mb-1.5 text-[var(--muted)]"
        >
          Select AI Provider
        </label>
        <select
          id="provider-switcher-select"
          className="w-full px-3 py-2.5 border border-[var(--border)] bg-[var(--card)] text-[13px] rounded-lg transition-all duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none hover:border-[var(--border-hover)]"
          value={resolvedSelectedId ?? "__cloud__"}
          onChange={(e) => {
            const nextId = e.target.value;
            if (nextId === "__cloud__") {
              void handleSelectCloud();
              return;
            }
            if (nextId === "pi-ai") {
              void handleSelectPiAi();
              return;
            }
            if (
              nextId === "anthropic-subscription" ||
              nextId === "openai-subscription"
            ) {
              void handleSelectSubscription(nextId);
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
        <p className="text-[11px] text-[var(--muted)] mt-1.5">
          Choose your preferred AI provider. This affects how the agent
          processes and responds to messages.
        </p>
      </div>

      {/* Cloud settings */}
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
                  {cloudDisconnecting ? "Disconnecting..." : "Disconnect"}
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
                          } catch (err) {
                            console.warn(
                              "[milady] Failed to save cloud model config",
                              err,
                            );
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
                  Waiting for browser authentication... A new tab should have
                  opened.
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

      {/* pi-ai settings */}
      {!isCloudSelected && isPiAiSelected && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-xs font-semibold mb-2">Pi (pi-ai) Settings</div>
          <div className="text-[11px] text-[var(--muted)] mb-2">
            Uses local credentials from ~/.pi/agent/auth.json.
          </div>
          <label
            htmlFor="pi-ai-model-override"
            className="block text-[11px] text-[var(--muted)] mb-1"
          >
            Primary model override (optional)
          </label>

          {piAiModelOptions && piAiModelOptions.length > 0 ? (
            <>
              <select
                id="pi-ai-model-override"
                value={piAiModelSelectValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "__custom__") {
                    if (piAiModelSelectValue !== "__custom__") {
                      setPiAiModelSpec("");
                    }
                    return;
                  }
                  setPiAiModelSpec(next);
                }}
                className="w-full px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">
                  Use pi default model
                  {piAiDefaultModelSpec ? ` (${piAiDefaultModelSpec})` : ""}
                </option>
                {piAiModelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
                <option value="__custom__">Custom model spec…</option>
              </select>

              {piAiModelSelectValue === "__custom__" && (
                <input
                  type="text"
                  value={piAiModelSpec}
                  onChange={(e) => setPiAiModelSpec(e.target.value)}
                  placeholder="provider/model (e.g. anthropic/claude-sonnet-4.5)"
                  className="w-full mt-2 px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
                />
              )}
            </>
          ) : (
            <input
              id="pi-ai-model-override"
              type="text"
              value={piAiModelSpec}
              onChange={(e) => setPiAiModelSpec(e.target.value)}
              placeholder="provider/model (e.g. anthropic/claude-sonnet-4.5)"
              className="w-full px-2.5 py-[8px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
            />
          )}
          <div className="flex items-center justify-end gap-2 mt-3">
            {piAiSaving && (
              <span className="text-[11px] text-[var(--muted)]">
                Saving &amp; restarting...
              </span>
            )}
            {piAiSaveSuccess && (
              <span className="text-[11px] text-[var(--ok,#16a34a)]">
                Saved — restarting agent
              </span>
            )}
            <button
              type="button"
              className="btn text-xs py-[5px] px-3.5 !mt-0"
              onClick={() => void handlePiAiSave()}
              disabled={piAiSaving}
            >
              {piAiSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
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
