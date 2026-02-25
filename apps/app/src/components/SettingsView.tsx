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

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, THEMES } from "../AppContext";
import {
  client,
  type PluginParamDef,
  type OnboardingOptions,
  type SubscriptionProviderStatus,
} from "../api-client";
import { ConfigPageView } from "./ConfigPageView";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { VoiceConfigView } from "./VoiceConfigView";
import { PermissionsSection } from "./PermissionsSection";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { autoLabel } from "./shared/labels";
import { formatByteSize } from "./shared/format";
import { createTranslator } from "../i18n";

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
    >
      <div className="w-full max-w-md border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{title}</div>
          <button
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

/* ── Section anchors for sticky nav ──────────────────────────────────── */

const SETTINGS_SECTIONS = [
  { id: "settings-appearance", labelKey: "settings.appearance", fallback: "Appearance", short: "Look" },
  { id: "settings-ai-model", labelKey: "settings.aiModel", fallback: "AI Model", short: "AI" },
  { id: "settings-wallet", labelKey: "settings.walletRpc", fallback: "Wallet / RPC", short: "Wallet" },
  { id: "settings-media", labelKey: "settings.media", fallback: "Media", short: "Media" },
  { id: "settings-speech", labelKey: "settings.speech", fallback: "Speech", short: "Voice" },
  { id: "settings-permissions", labelKey: "settings.permissions", fallback: "Permissions", short: "Perms" },
  { id: "settings-updates", labelKey: "settings.updates", fallback: "Updates", short: "Update" },
  { id: "settings-extension", labelKey: "settings.extension", fallback: "Extension", short: "Ext" },
  { id: "settings-export", labelKey: "settings.exportImport", fallback: "Export / Import", short: "Export" },
  { id: "settings-danger", labelKey: "settings.dangerZone", fallback: "Danger Zone", short: "Danger" },
] as const;

/* SVG icons for each settings section (16×16 viewBox) */
const SECTION_ICON_PATHS: Record<string, React.ReactNode> = {
  "settings-appearance": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>,
  "settings-ai-model": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" /><circle cx="16" cy="10" r="1.5" fill="currentColor" stroke="none" /></svg>,
  "settings-wallet": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /><path d="M16 12h6v4h-6a2 2 0 0 1 0-4z" /></svg>,
  "settings-media": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>,
  "settings-speech": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" /></svg>,
  "settings-permissions": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  "settings-updates": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>,
  "settings-extension": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></svg>,
  "settings-export": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  "settings-danger": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
};

function SettingsNav({
  activeId,
  t,
  inModal,
}: {
  activeId: string;
  t: (key: string) => string;
  inModal?: boolean;
}) {
  return (
    <nav className="hidden md:block sticky top-6 w-[160px] shrink-0 self-start">
      <ul className="space-y-0.5">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block px-2.5 py-1.5 text-xs rounded transition-all duration-300 ${activeId === s.id
                ? inModal
                  ? "s-bg-subtle s-text-accent font-bold border-l-2 border-[var(--s-accent)] shadow-[inset_10px_0_20px_var(--s-accent-subtle)]"
                  : "bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold"
                : inModal
                  ? "s-text-muted s-hover-text s-hover-bg border-l-2 border-transparent"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]"
                }`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t(s.labelKey) === s.labelKey ? s.fallback : t(s.labelKey)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView({ inModal }: { inModal?: boolean } = {}) {
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
    uiLanguage,
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
    setUiLanguage,
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
    setActionNotice,
    setState,
  } = useApp();
  const t = createTranslator(uiLanguage);

  /* ── Model selection state ─────────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<OnboardingOptions["models"] | null>(null);
  const [piModels, setPiModels] = useState<NonNullable<OnboardingOptions["piModels"]>>([]);
  const [piDefaultModel, setPiDefaultModel] = useState<string>("");

  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  /* ── Loading state for initial model fetch ─────────────────────────── */
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  /* ── pi-ai provider state ─────────────────────────────────────────── */
  const [piAiEnabled, setPiAiEnabled] = useState(false);
  const [piAiSmallModel, setPiAiSmallModel] = useState("");
  const [piAiLargeModel, setPiAiLargeModel] = useState("");
  const [piAiSaving, setPiAiSaving] = useState(false);
  const [piAiSaveSuccess, setPiAiSaveSuccess] = useState(false);

  useEffect(() => {
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();

    void (async () => {
      setIsLoadingModels(true);
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
        setPiModels(opts.piModels ?? []);
        setPiDefaultModel(opts.piDefaultModel ?? "");
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

        // pi-ai enabled flag + optional primary model
        const env = cfg.env as Record<string, unknown> | undefined;
        const vars = (env?.vars as Record<string, unknown> | undefined) ?? {};
        const rawPiAi = vars.MILADY_USE_PI_AI;
        const piAiOn = typeof rawPiAi === "string" && ["1", "true", "yes"].includes(rawPiAi.trim().toLowerCase());
        setPiAiEnabled(piAiOn);

        const agents = cfg.agents as Record<string, unknown> | undefined;
        const defaults = agents?.defaults as Record<string, unknown> | undefined;
        const modelCfg = defaults?.model as Record<string, unknown> | undefined;
        const primary = typeof modelCfg?.primary === "string" ? modelCfg.primary : "";

        const modelsCfg = (cfg.models as Record<string, unknown> | undefined) ?? {};
        const small = typeof modelsCfg.piAiSmall === "string" ? (modelsCfg.piAiSmall as string) : "";
        const large = typeof modelsCfg.piAiLarge === "string" ? (modelsCfg.piAiLarge as string) : primary;

        setPiAiSmallModel(small);
        setPiAiLargeModel(large);
      } catch { /* ignore */ } finally {
        setIsLoadingModels(false);
      }
    })();
  }, [loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  /* ── Sticky nav: track which section is visible ─────────────────── */
  const [activeSection, setActiveSection] = useState<string>(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    if (inModal) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const section of SETTINGS_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [inModal]);

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
      if (selectedProviderId !== "__cloud__") setSelectedProviderId("__cloud__");
      return;
    }

    if (piAiEnabled) {
      if (selectedProviderId !== "pi-ai") setSelectedProviderId("pi-ai");
      return;
    }
  }, [cloudEnabled, piAiEnabled, selectedProviderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve the actually-selected provider: accept __cloud__ / pi-ai or fall back */
  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId === "pi-ai"
        ? "pi-ai"
        : selectedProviderId && allAiProviders.some((p) => p.id === selectedProviderId)
          ? selectedProviderId
          : cloudEnabled
            ? "__cloud__"
            : piAiEnabled
              ? "pi-ai"
              : enabledAiProviders[0]?.id ?? null;

  const selectedProvider =
    resolvedSelectedId && resolvedSelectedId !== "__cloud__" && resolvedSelectedId !== "pi-ai"
      ? allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null
      : null;

  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      setPiAiEnabled(false);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;
      const defaultPrimaryModel =
        newId === "openai"
          ? "openai/gpt-5-mini"
          : newId === "anthropic"
            ? "anthropic/claude-sonnet-4.5"
            : null;

      /* Turn off cloud mode (and pi-ai mode) when switching to a local provider */
      try {
        await client.updateConfig({
          cloud: { enabled: false },
          env: { vars: { MILADY_USE_PI_AI: "" } },
          agents: { defaults: { model: { primary: defaultPrimaryModel } } },
          ...(defaultPrimaryModel ? { models: { large: defaultPrimaryModel } } : {}),
        });
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
    [allAiProviders, enabledAiProviders, handlePluginToggle],
  );

  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    setPiAiEnabled(false);
    try {
      await client.updateConfig({
        cloud: { enabled: true },
        // Ensure local pi-ai mode is disabled when switching to cloud.
        env: { vars: { MILADY_USE_PI_AI: "" } },
        agents: { defaults: { model: { primary: null } } },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      await client.restartAgent();
    } catch { /* non-fatal */ }
  }, [currentSmallModel, currentLargeModel]);

  const piAiAvailable = piModels.length > 0 || Boolean(piDefaultModel);

  const handleSelectPiAi = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("pi-ai");
    setPiAiEnabled(true);

    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      await client.updateConfig({
        cloud: { enabled: false },
        env: { vars: { MILADY_USE_PI_AI: "1" } },
        models: {
          piAiSmall: piAiSmallModel.trim() || null,
          piAiLarge: piAiLargeModel.trim() || null,
        },
        agents: {
          defaults: {
            model: {
              // Keep primary aligned with the pi-ai large model override so
              // any code that reads MODEL_PROVIDER as a modelSpec still works.
              primary: piAiLargeModel.trim() || null,
            },
          },
        },
      });
      await client.restartAgent();
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiSmallModel, piAiLargeModel]);

  const handlePiAiSave = useCallback(async () => {
    // Save pi-ai small/large overrides; keep pi-ai enabled.
    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      await client.updateConfig({
        cloud: { enabled: false },
        env: { vars: { MILADY_USE_PI_AI: "1" } },
        models: {
          piAiSmall: piAiSmallModel.trim() || null,
          piAiLarge: piAiLargeModel.trim() || null,
        },
        agents: {
          defaults: {
            model: {
              primary: piAiLargeModel.trim() || null,
            },
          },
        },
      });
      await client.restartAgent();
      setPiAiEnabled(true);
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiSmallModel, piAiLargeModel]);

  const ext = extensionStatus;
  const relayOk = ext?.relayReachable === true;

  /* ── Export / Import modal state ─────────────────────────────────── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportEstimateLoading, setExportEstimateLoading] = useState(false);
  const [exportEstimateError, setExportEstimateError] = useState<string | null>(null);
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
          err instanceof Error ? err.message : t("settings.export.estimateFailed"),
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
  const [modelsFetchResult, setModelsFetchResult] = useState<string | null>(null);

  const handleFetchModels = useCallback(
    async (providerId: string) => {
      setModelsFetching(true);
      setModelsFetchResult(null);
      try {
        const result = await client.fetchModels(providerId, true);
        const count = Array.isArray(result?.models) ? result.models.length : 0;
        setModelsFetchResult(t("settings.ai.fetchModelsLoaded", { count: String(count) }));
        // Reload plugins so configUiHints are refreshed with new model options
        await loadPlugins();
        setTimeout(() => setModelsFetchResult(null), 3000);
      } catch (err) {
        setModelsFetchResult(
          t("settings.ai.fetchModelsError", {
            error: err instanceof Error ? err.message : t("settings.ai.fetchModelsFailed"),
          }),
        );
        setTimeout(() => setModelsFetchResult(null), 5000);
      }
      setModelsFetching(false);
    },
    [loadPlugins],
  );

  /* ── Plugin config local state for collecting field values ──────── */
  const [pluginFieldValues, setPluginFieldValues] = useState<Record<string, Record<string, string>>>({});

  /* ── OpenAI subscription auth state ─────────────────────────────── */
  const [subscriptionProviders, setSubscriptionProviders] = useState<SubscriptionProviderStatus[]>([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [openAIAuthorizing, setOpenAIAuthorizing] = useState(false);
  const [openAIExchanging, setOpenAIExchanging] = useState(false);
  const [openAIDisconnecting, setOpenAIDisconnecting] = useState(false);
  const [openAIAuthStarted, setOpenAIAuthStarted] = useState(false);
  const [openAICallbackUrl, setOpenAICallbackUrl] = useState("");
  const [openAIAuthError, setOpenAIAuthError] = useState("");
  const [openAIAuthInstructions, setOpenAIAuthInstructions] = useState("");

  const refreshSubscriptionStatus = useCallback(async () => {
    setSubscriptionLoading(true);
    try {
      const response = await client.getSubscriptionStatus();
      setSubscriptionProviders(response.providers);
    } catch {
      setSubscriptionProviders([]);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSubscriptionStatus();
  }, [refreshSubscriptionStatus]);

  const openAIPlanProvider = subscriptionProviders.find((p) => p.provider === "openai-codex");
  const isOpenAIPlanConnected = Boolean(openAIPlanProvider && openAIPlanProvider.configured);
  const isOpenAIPlanUsable = Boolean(
    openAIPlanProvider && openAIPlanProvider.configured && openAIPlanProvider.valid,
  );
  const isOpenAIProviderSelected = Boolean(
    resolvedSelectedId &&
      selectedProvider &&
      (selectedProvider.id.toLowerCase().includes("openai") ||
        selectedProvider.name.toLowerCase().includes("openai")),
  );

  const handleOpenAIStart = useCallback(async () => {
    setOpenAIAuthError("");
    setOpenAIAuthorizing(true);
    try {
      const result = await client.startOpenAILogin();
      if (result?.authUrl) {
        window.open(result.authUrl, "openai-oauth", "width=500,height=700,top=50,left=200");
        setOpenAIAuthStarted(true);
        setOpenAIAuthInstructions(result.instructions);
        setOpenAIAuthError("");
        return;
      }
      setOpenAIAuthError(t("settings.openaiStartMissingUrl"));
    } catch (err) {
      setOpenAIAuthError(
        err instanceof Error
          ? err.message
          : t("settings.openaiStartFailed"),
      );
    } finally {
      setOpenAIAuthorizing(false);
    }
  }, [t]);

  const handleOpenAIExchange = useCallback(async () => {
    if (!openAICallbackUrl.trim()) {
      setOpenAIAuthError(t("settings.openaiPasteRequired"));
      return;
    }

    setOpenAIAuthError("");
    setOpenAIExchanging(true);
    try {
      const result = await client.exchangeOpenAICode(openAICallbackUrl.trim());
      if (result?.success) {
        setOpenAIAuthStarted(false);
        setOpenAICallbackUrl("");
        setOpenAIAuthInstructions("");
        setOpenAIAuthError("");
        if (isOpenAIProviderSelected) {
          await client.restartAndWait();
        }
        await refreshSubscriptionStatus();
        setActionNotice(t("settings.openaiConnected"), "success", 2500);
        return;
      }

      const errorText = result?.error ?? t("settings.openaiExchangeFailed");
      setOpenAIAuthError(errorText);
    } catch (err) {
      setOpenAIAuthError(
        err instanceof Error
          ? err.message
          : t("settings.openaiExchangeFailed"),
      );
    } finally {
      setOpenAIExchanging(false);
    }
  }, [
    isOpenAIProviderSelected,
    openAICallbackUrl,
    refreshSubscriptionStatus,
    setActionNotice,
    t,
  ]);

  const handleOpenAIDisconnect = useCallback(async () => {
    setOpenAIAuthError("");
    setOpenAIDisconnecting(true);
    try {
      await client.disconnectOpenAICredentials();
      if (isOpenAIProviderSelected) {
        await client.restartAndWait();
      }
      await refreshSubscriptionStatus();
      setOpenAIAuthStarted(false);
      setOpenAIAuthInstructions("");
      setOpenAICallbackUrl("");
      setActionNotice(t("settings.openaiDisconnected"), "success", 2500);
    } catch (err) {
      setOpenAIAuthError(
        err instanceof Error
          ? err.message
          : t("settings.openaiDisconnectFailed"),
      );
    } finally {
      setOpenAIDisconnecting(false);
    }
  }, [isOpenAIProviderSelected, refreshSubscriptionStatus, setActionNotice, t]);

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
    <div className={inModal ? "settings-modal-layout" : `flex gap-6`}>
      {inModal ? (
        /* HSR Icon Sidebar */
        <nav className="settings-icon-sidebar">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`settings-icon-btn ${activeSection === s.id ? "is-active" : ""}`}
              onClick={() => setActiveSection(s.id)}
              title={s.fallback}
            >
              {SECTION_ICON_PATHS[s.id]}
              <span className="settings-icon-label">{s.short}</span>
            </button>
          ))}
        </nav>
      ) : (
        <SettingsNav activeId={activeSection} t={t} inModal={inModal} />
      )}
      <div className={inModal ? "settings-content-area" : "min-w-0 flex-1"}>
        {!inModal && <h2 className="text-lg font-bold mb-1">{t("nav.settings")}</h2>}
        {!inModal && <p className="text-[13px] mb-5 text-[var(--muted)]">{t("settings.languageHint")}</p>}

        {/* ═══════════════════════════════════════════════════════════════
          1. APPEARANCE
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-appearance"
          className={inModal ? "settings-section-pane" : "p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-appearance" ? { display: "none" } : undefined}
        >

          {/* HSR Section Header */}
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.appearance").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="font-bold text-sm mb-2">{t("settings.appearance")}</div>
          )}

          {/* Language Setting Row */}
          <div className={inModal ? "settings-hsr-row" : "mb-3"}>
            <div className={inModal ? "settings-hsr-row-left" : "text-[12px] font-semibold text-[var(--text)] mb-1.5"}>
              <div className={inModal ? "settings-hsr-row-title" : ""}>{t("settings.language")}</div>
              {inModal && <div className="settings-hsr-row-desc">{t("settings.languageRowDescription")}</div>}
            </div>

            <div className={inModal ? "settings-hsr-row-right" : "inline-flex gap-1.5 border border-[var(--border)] rounded-md p-1"}>
              {inModal ? (
                <div className="inline-flex gap-1.5 p-1">
                  <button
                    className={`px-2.5 py-1 text-xs rounded transition-colors duration-200 ${uiLanguage === "en"
                      ? "s-bg-subtle s-text border s-border"
                      : "s-text-muted s-hover-text"
                      }`}
                    onClick={() => {
                      setUiLanguage("en");
                      setActionNotice(t("settings.languageSaved"), "success", 2200);
                    }}
                  >
                    {t("settings.languageEnglish")}
                  </button>
                  <button
                    className={`px-2.5 py-1 text-xs rounded transition-colors duration-200 ${uiLanguage === "zh-CN"
                      ? "s-bg-subtle s-text border s-border"
                      : "s-text-muted s-hover-text"
                      }`}
                    onClick={() => {
                      setUiLanguage("zh-CN");
                      setActionNotice(t("settings.languageSaved"), "success", 2200);
                    }}
                  >
                    {t("settings.languageChineseSimplified")}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className={`px-2.5 py-1 text-xs rounded transition-colors duration-200 ${uiLanguage === "en"
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--text)] hover:bg-[var(--bg-hover)]"
                      }`}
                    onClick={() => {
                      setUiLanguage("en");
                      setActionNotice(t("settings.languageSaved"), "success", 2200);
                    }}
                  >
                    {t("settings.languageEnglish")}
                  </button>
                  <button
                    className={`px-2.5 py-1 text-xs rounded transition-colors duration-200 ${uiLanguage === "zh-CN"
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--text)] hover:bg-[var(--bg-hover)]"
                      }`}
                    onClick={() => {
                      setUiLanguage("zh-CN");
                      setActionNotice(t("settings.languageSaved"), "success", 2200);
                    }}
                  >
                    {t("settings.languageChineseSimplified")}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Theme Carousel */}
          {inModal && <div className="settings-hsr-row-title mt-4 mb-2 ml-2">{t("settings.themeStyle")}</div>}
          <div className={inModal ? "settings-hsr-theme-carousel" : "grid grid-cols-3 sm:grid-cols-6 gap-1.5"}>
            {THEMES.map((th) => {
              const THEME_COLORS: Record<string, string> = {
                default: "#6366f1",
                dark: "#1f2937",
                milady: "#f5c842",
                psycho: "#ef4444",
                light: "#e5e7eb",
                midnight: "#0f172a",
                qt314: "#f9a8d4",
                web2000: "#22c55e",
                programmer: "#1e1e1e",
                haxor: "#00ff41",
              };
              const swatchColor = THEME_COLORS[th.id] ?? "#888888";

              if (inModal) {
                return (
                  <div
                    key={th.id}
                    className={`settings-hsr-theme-card ${currentTheme === th.id ? "is-active" : ""}`}
                    onClick={() => setTheme(th.id)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-block w-3 h-3 rounded-full border s-border" style={{ background: swatchColor }} />
                      <span className="text-xs font-bold s-text uppercase tracking-wider">{th.label}</span>
                    </div>
                    <div className="text-[10px] s-text-muted leading-tight pr-4">
                      {th.hint}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={th.id}
                  className={`theme-btn py-2 px-2 ${currentTheme === th.id ? "active" : ""}`}
                  onClick={() => setTheme(th.id)}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-bold text-[var(--text)] whitespace-nowrap">
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-border/50 shrink-0"
                      style={{ background: swatchColor }}
                    />
                    {th.label}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-0.5 text-center whitespace-nowrap">
                    {th.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          2. AI MODEL
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-ai-model"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-ai-model" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.aiComputeCore")}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className={`flex items-center gap-3 mb-4`}>
              <div className="font-bold text-sm">{t("settings.aiModel")}</div>
              {isLoadingModels && (
                <span className="text-[11px] text-[var(--muted)] animate-pulse">{t("settings.loadingModels")}</span>
              )}
            </div>
          )}

          {isLoadingModels && inModal && (
            <span className="text-[11px] text-[var(--accent)] animate-pulse ml-2 mb-2 block">{t("settings.synchronizingCore")}</span>
          )}

          {(() => {
            const totalCols = allAiProviders.length + 2; /* +2 for Eliza Cloud + Pi */
            const isCloudSelected = resolvedSelectedId === "__cloud__";
            const isPiAiSelected = resolvedSelectedId === "pi-ai";

            if (totalCols === 0) {
              return (
                <div className="p-4 border border-[var(--warning,#f39c12)] bg-[var(--card)]">
                  <div className="text-xs text-[var(--warning,#f39c12)]">
                    {t("settings.noAiProvidersPrefix")}{" "}
                    <a
                      href="#"
                      className="text-[var(--accent)] underline"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        setTab("plugins");
                      }}
                    >
                      {t("advanced.plugins")}
                    </a>{" "}
                    {t("settings.noAiProvidersSuffix")}
                  </div>
                </div>
              );
            }

            return (
              <>
                <div className={inModal ? "settings-hsr-nav-bar" : "grid gap-1.5"} style={!inModal ? { gridTemplateColumns: `repeat(${totalCols}, 1fr)` } : {}}>
                  <div
                    className={inModal
                      ? `settings-hsr-nav-item ${isCloudSelected ? "is-active" : ""}`
                      : `text-center px-2 py-2 border cursor-pointer transition-colors ${isCloudSelected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"}`
                    }
                    onClick={() => void handleSelectCloud()}
                  >
                    {inModal ? "Eliza Cloud" : (
                      <div className={`text-xs font-bold whitespace-nowrap ${isCloudSelected ? "" : "text-[var(--text)]"}`}>
                        Eliza Cloud
                      </div>
                    )}
                  </div>

                  {/* pi-ai (local credentials) */}
                  <div
                    className={inModal
                      ? `settings-hsr-nav-item ${isPiAiSelected ? "is-active" : ""} ${!piAiAvailable && !isPiAiSelected ? "opacity-50 cursor-not-allowed" : ""}`
                      : `text-center px-2 py-2 border cursor-pointer transition-colors ${isPiAiSelected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"} ${!piAiAvailable && !isPiAiSelected ? "opacity-50 cursor-not-allowed" : ""}`
                    }
                    onClick={() => {
                      if (!piAiAvailable && !isPiAiSelected) return;
                      void handleSelectPiAi();
                    }}
                    title={
                      piAiAvailable
                        ? "Use local Pi credentials (~/.pi/agent)"
                        : isPiAiSelected
                          ? "Using pi-ai (model list still loading)"
                          : "pi-ai is not available (no models detected)"
                    }
                  >
                    {inModal ? "Pi (pi-ai)" : (
                      <div className={`text-xs font-bold whitespace-nowrap ${isPiAiSelected ? "" : "text-[var(--text)]"}`}>
                        Pi (pi-ai)
                      </div>
                    )}
                  </div>

                  {allAiProviders.map((provider) => {
                    const isSelected = !isCloudSelected && !isPiAiSelected && provider.id === resolvedSelectedId;
                    return (
                      <div
                        key={provider.id}
                        className={inModal
                          ? `settings-hsr-nav-item ${isSelected ? "is-active" : ""}`
                          : `text-center px-2 py-2 border cursor-pointer transition-colors ${isSelected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"}`
                        }
                        onClick={() => void handleSwitchProvider(provider.id)}
                      >
                        {inModal ? provider.name : (
                          <div className={`text-xs font-bold whitespace-nowrap ${isSelected ? "" : "text-[var(--text)]"}`}>
                            {provider.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Eliza Cloud settings */}
                {isCloudSelected && (
                  <div className={inModal ? "mt-4" : "mt-4 pt-4 border-t border-[var(--border)]"}>
                    {cloudConnected ? (
                      <div>
                        <div className={inModal ? "settings-hsr-status-card mb-6" : "flex justify-between items-center mb-3"}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {inModal ? (
                                <>
                                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)] shadow-[0_0_8px_var(--ok,#16a34a)]" />
                                  <span className="text-xs font-bold tracking-wider text-[var(--ok,#16a34a)] uppercase">{t("settings.cloud.connected")}</span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                                  <span className="text-xs font-semibold">{t("settings.cloud.loggedIn")}</span>
                                </>
                              )}
                            </div>
                            <button
                              className={inModal
                                ? "px-4 py-1.5 border s-border s-bg-inset s-text-secondary s-hover-text s-hover-border s-hover-bg-subtle text-xs font-bold uppercase tracking-wider rounded transition-all"
                                : "btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                              }
                              onClick={() => void handleCloudDisconnect()}
                              disabled={cloudDisconnecting}
                            >
                              {cloudDisconnecting ? t("settings.cloud.disconnecting") : t("settings.cloud.disconnect")}
                            </button>
                          </div>

                          <div className={inModal ? "text-xs font-mono" : "text-xs mb-4"}>
                            {cloudUserId && (
                              <div className="text-[var(--muted)] mb-1">
                                <span className={inModal ? "uppercase tracking-wider text-[10px]" : ""}>{t("settings.cloud.idLabel")}</span> <code className="text-[11px]">{cloudUserId}</code>
                              </div>
                            )}
                            {cloudCredits !== null && (
                              <div className="flex items-center gap-3">
                                <span className={inModal ? "uppercase tracking-wider text-[10px] s-text-muted" : "text-[var(--muted)]"}>{t("settings.cloud.creditsLabel")}</span>{" "}
                                <span
                                  className={
                                    cloudCreditsCritical
                                      ? "text-[var(--danger,#e74c3c)] font-bold text-sm"
                                      : cloudCreditsLow
                                        ? "text-[#b8860b] font-bold text-sm"
                                        : "text-[var(--accent)] font-bold text-sm"
                                  }
                                >
                                  ${cloudCredits.toFixed(2)}
                                </span>
                                <a
                                  href={cloudTopUpUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={inModal ? "text-[10px] uppercase font-bold s-text-secondary s-hover-text underline" : "text-[11px] text-[var(--accent)]"}
                                >
                                  {t("settings.cloud.topUp")}
                                </a>
                              </div>
                            )}
                          </div>
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
                          {modelSaving && <span className="text-[11px] text-[var(--muted)]">{t("settings.modelSavingRestarting")}</span>}
                          {modelSaveSuccess && <span className="text-[11px] text-[var(--ok,#16a34a)]">{t("settings.modelSavedRestarting")}</span>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        {cloudLoginBusy ? (
                          <div className="text-xs text-[var(--muted)]">
                            {t("settings.cloud.waitingAuth")}
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
                              {t("settings.cloud.login")}
                            </button>
                            <div className="text-[11px] text-[var(--muted)] mt-1.5">
                              {t("settings.cloud.loginHint")}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── OpenAI plan auth (alternative to API key) ───────── */}
                {!isCloudSelected && isOpenAIProviderSelected && (
                  <div className={inModal ? "mt-4" : "mt-4 pt-4 border-t border-[var(--border)]"}>
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-semibold">{t("settings.openaiAuthTitle")}</div>
                      <div
                        className="text-[11px] px-2 py-[3px] border"
                        style={{
                          borderColor: isOpenAIPlanUsable
                            ? "var(--ok,#16a34a)"
                            : isOpenAIPlanConnected
                              ? "#f59e0b"
                              : "var(--warning,#f59e0b)",
                          color: isOpenAIPlanUsable
                            ? "var(--ok,#16a34a)"
                            : isOpenAIPlanConnected
                              ? "#f59e0b"
                              : "var(--warning,#f59e0b)",
                        }}
                      >
                        {isOpenAIPlanUsable
                          ? t("settings.openaiStatusConnected")
                          : isOpenAIPlanConnected
                            ? t("settings.openaiStatusExpiring")
                            : t("settings.openaiStatusDisconnected")}
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
                      {isOpenAIPlanUsable || isOpenAIPlanConnected
                        ? t("settings.openaiConnectedHint")
                        : t("settings.openaiNotConnectedHint")}
                    </div>

                    {isOpenAIPlanConnected && openAIPlanProvider?.expiresAt ? (
                      <div className="text-[11px] text-[var(--muted)] mt-2">
                        {t("settings.openaiExpiresAt")}: {new Date(openAIPlanProvider.expiresAt).toLocaleString()}
                      </div>
                    ) : null}

                    {openAIAuthError && (
                      <div className="mt-2 text-xs text-[var(--danger,#e74c3c)]">
                        {openAIAuthError}
                      </div>
                    )}

                    {!isOpenAIPlanConnected && !openAIAuthStarted && (
                      <button
                        className="btn text-xs py-[5px] px-3.5 !mt-3"
                        onClick={() => void handleOpenAIStart()}
                        disabled={subscriptionLoading || openAIAuthorizing}
                      >
                        {subscriptionLoading
                          ? t("common.loading")
                          : openAIAuthorizing
                            ? t("settings.openaiConnecting")
                            : t("settings.openaiLogin")}
                      </button>
                    )}

                    {!isOpenAIPlanConnected && (
                      <>
                        {!openAIAuthStarted ? (
                          <div className="text-[10px] text-[var(--muted)] mt-2">
                            {t("settings.openaiRequirements")}
                          </div>
                        ) : (
                          <div className="mt-3">
                            <div className="text-xs text-[var(--muted)]">
                              {openAIAuthInstructions || t("settings.openaiInstructions")}
                            </div>
                            <input
                              className={`w-full px-2.5 py-[7px] text-[13px] mt-2 font-[var(--mono)] transition-colors focus:outline-none ${inModal
                                ? ""
                                : "border border-[var(--border)] bg-[var(--card)] focus:border-[var(--accent)]"
                                }`}
                              type="text"
                              value={openAICallbackUrl}
                              placeholder={t("settings.openaiCallbackPlaceholder")}
                              onChange={(e) => {
                                setOpenAIAuthError("");
                                setOpenAICallbackUrl(e.target.value);
                              }}
                            />
                            <div className="flex items-center justify-end gap-2 mt-2">
                              <button
                                className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)] hover:!text-[var(--text)] hover:!border-[var(--accent)]"
                                onClick={() => {
                                  setOpenAIAuthStarted(false);
                                  setOpenAIAuthInstructions("");
                                  setOpenAIAuthError("");
                                  setOpenAICallbackUrl("");
                                }}
                              >
                                {t("settings.openaiStartOver")}
                              </button>
                              <button
                                className="btn text-xs py-[5px] px-4 !mt-0"
                                onClick={() => void handleOpenAIExchange()}
                                disabled={openAIExchanging || !openAICallbackUrl.trim()}
                              >
                                {openAIExchanging ? t("settings.openaiCompleting") : t("settings.openaiConnect")}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {isOpenAIPlanConnected && (
                      <button
                        className="btn text-xs py-[5px] px-3.5 !mt-3 !bg-transparent !border-[var(--border)] !text-[var(--muted)] hover:!text-[var(--text)] hover:!border-[var(--accent)]"
                        onClick={() => void handleOpenAIDisconnect()}
                        disabled={openAIDisconnecting}
                      >
                        {openAIDisconnecting ? t("settings.openaiDisconnecting") : t("settings.openaiDisconnect")}
                      </button>
                    )}
                  </div>
                )}

                {/* ── pi-ai settings (local credentials) ───────────────── */}
                {!isCloudSelected && isPiAiSelected && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-xs font-semibold">{t("settings.pi.title")}</div>
                      <span
                        className={`text-[11px] px-2 py-[3px] border ${piAiEnabled ? "" : "opacity-70"}`}
                        style={{
                          borderColor: piAiEnabled ? "#2d8a4e" : "var(--warning,#f39c12)",
                          color: piAiEnabled ? "#2d8a4e" : "var(--warning,#f39c12)",
                        }}
                    >
                        {piAiEnabled ? t("settings.enabled") : t("settings.disabled")}
                      </span>
                    </div>

                    <div className="text-[11px] text-[var(--muted)] mb-3">
                      {t("settings.pi.credentialsHint")} <code className="font-[var(--mono)]">~/.pi/agent/auth.json</code>.
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">{t("settings.pi.smallModelOptional")}</label>
                      <div className="text-[10px] text-[var(--muted)]">
                        {t("settings.pi.smallModelHint")} {t("settings.pi.leaveBlankUseDefault")}{piDefaultModel ? ` (${piDefaultModel})` : ""}.
                      </div>
                      <input
                        className={`w-full px-2.5 py-[7px] text-[13px] font-[var(--mono)] transition-colors focus:outline-none ${inModal ? "" : "border border-[var(--border)] bg-[var(--card)] focus:border-[var(--accent)]"}`}
                        type="text"
                        value={piAiSmallModel}
                        onChange={(e) => setPiAiSmallModel(e.target.value)}
                        placeholder={piDefaultModel ? `${t("settings.pi.placeholderExample")} ${piDefaultModel}` : t("settings.pi.providerModelPlaceholder")}
                        list="pi-ai-models-config"
                      />
                      <datalist id="pi-ai-models-config">
                        {piModels.slice(0, 400).map((m) => (
                          <option key={m.id} value={m.id} />
                        ))}
                      </datalist>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs font-semibold">{t("settings.pi.largeModelOptional")}</label>
                      <div className="text-[10px] text-[var(--muted)]">
                        {t("settings.pi.largeModelHint")} {t("settings.pi.leaveBlankUseDefault")}{piDefaultModel ? ` (${piDefaultModel})` : ""}.
                      </div>
                      <input
                        className={`w-full px-2.5 py-[7px] text-[13px] font-[var(--mono)] transition-colors focus:outline-none ${inModal ? "" : "border border-[var(--border)] bg-[var(--card)] focus:border-[var(--accent)]"}`}
                        type="text"
                        value={piAiLargeModel}
                        onChange={(e) => setPiAiLargeModel(e.target.value)}
                        placeholder={piDefaultModel ? `${t("settings.pi.placeholderExample")} ${piDefaultModel}` : t("settings.pi.providerModelPlaceholder")}
                        list="pi-ai-models-config-large"
                      />
                      <datalist id="pi-ai-models-config-large">
                        {piModels.slice(0, 400).map((m) => (
                          <option key={m.id} value={m.id} />
                        ))}
                      </datalist>
                    </div>

                    <div className="flex justify-end mt-3">
                      <button
                        className={`btn text-xs py-[5px] px-4 !mt-0 ${piAiSaveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                        onClick={() => void handlePiAiSave()}
                        disabled={piAiSaving}
                      >
                        {piAiSaving ? t("settings.saving") : piAiSaveSuccess ? t("settings.saved") : t("settings.saveAndRestart")}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Local provider settings ──────────────────────────── */}
                {!isCloudSelected && selectedProvider && selectedProvider.parameters.length > 0 && (() => {
                  const isSaving = pluginSaving.has(selectedProvider.id);
                  const saveSuccess = pluginSaveSuccess.has(selectedProvider.id);
                  const params = selectedProvider.parameters;
                  const setCount = params.filter((p: PluginParamDef) => p.isSet).length;

                  return (
                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                      <div className="flex justify-between items-center mb-3">
                        <div className="text-xs font-semibold">
                          {selectedProvider.name} {t("common.settings")}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--muted)]">
                            {t("settings.providerConfiguredCount", { setCount: String(setCount), total: String(params.length) })}
                          </span>
                          <span
                            className="text-[11px] px-2 py-[3px] border"
                            style={{
                              borderColor: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                              color: selectedProvider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                            }}
                          >
                            {selectedProvider.configured ? t("settings.configured") : t("settings.needsSetup")}
                          </span>
                        </div>
                      </div>

                      {(() => {
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
                          <ConfigRenderer
                            schema={schema}
                            hints={hints}
                            values={values}
                            setKeys={setKeys}
                            registry={defaultRegistry}
                            pluginId={selectedProvider.id}
                            onChange={(key, value) => handlePluginFieldChange(selectedProvider.id, key, String(value ?? ""))}
                          />
                        );
                      })()}

                      <div className="flex justify-between items-center mt-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="btn text-xs py-[5px] px-3.5 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)] hover:!text-[var(--text)] hover:!border-[var(--accent)]"
                            onClick={() => void handleFetchModels(selectedProvider.id)}
                            disabled={modelsFetching}
                          >
                            {modelsFetching ? t("settings.fetching") : t("settings.fetchModels")}
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
                          {isSaving ? t("settings.saving") : saveSuccess ? t("settings.saved") : t("common.save")}
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
        <div id="settings-wallet"
          className={inModal ? "settings-section-pane" : "mt-6"}
          style={inModal && activeSection !== "settings-wallet" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.walletRpc").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="settings-section-title">{t("settings.walletRpc")}</div>
          )}
          <ConfigPageView embedded />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          4. MEDIA GENERATION
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-media"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-media" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.mediaGeneration").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="font-bold text-sm mb-4">{t("settings.mediaGeneration")}</div>
          )}
          <MediaSettingsSection />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          5. SPEECH (TTS / STT)
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-speech"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-speech" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.speechInterface").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="font-bold text-sm mb-4">{t("settings.speechInterface")}</div>
          )}
          <VoiceConfigView />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          6. PERMISSIONS & CAPABILITIES
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-permissions"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-permissions" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.permissionsCapabilities").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="font-bold text-sm mb-1">{t("settings.permissionsCapabilities")}</div>
          )}
          <div className={`text-[11px] mb-4 text-[var(--muted)]`}>{t("settings.desktopOnlyPermissionHint")}</div>
          <PermissionsSection />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          7. UPDATES
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-updates"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-updates" ? { display: "none" } : undefined}
        >
          {inModal && (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.softwareUpdates").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <div>
              {!inModal && <div className="font-bold text-sm">{t("settings.softwareUpdates")}</div>}
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {updateStatus ? <>{t("settings.versionPrefix")} {updateStatus.currentVersion}</> : <>{t("common.loading")}...</>}
              </div>
            </div>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              disabled={updateLoading}
              onClick={() => void loadUpdateStatus(true)}
            >
              {updateLoading ? t("settings.checking") : t("settings.checkNow")}
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
                        { value: "stable", label: "Stable", description: "Recommended — production-ready releases" },
                        { value: "beta", label: "Beta", description: "Preview — early access to upcoming features" },
                        { value: "nightly", label: "Nightly", description: "Bleeding edge — latest development builds" },
                      ],
                    },
                  }}
                  values={{ channel: updateStatus.channel }}
                  registry={defaultRegistry}
                  onChange={(key, value) => {
                    if (key === "channel") void handleChannelChange(value as "stable" | "beta" | "nightly");
                  }}
                />
              </div>

              {updateStatus.updateAvailable && updateStatus.latestVersion && (
                <div className="mt-3 py-2.5 px-3 border border-[var(--accent)] bg-[rgba(255,255,255,0.03)] rounded flex justify-between items-center">
                  <div>
                    <div className="text-[13px] font-bold text-[var(--accent)]">{t("settings.updateAvailable")}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {updateStatus.currentVersion} &rarr; {updateStatus.latestVersion}
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
                  {t("settings.lastChecked")} {new Date(updateStatus.lastCheckAt).toLocaleString()}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-3 text-[var(--muted)] text-xs">
              {updateLoading ? t("settings.checkingForUpdates") : t("settings.unableLoadUpdateStatus")}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          4. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-extension"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-extension" ? { display: "none" } : undefined}
        >
          {inModal && (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.chromeExtension").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <div>
              {!inModal && <div className="font-bold text-sm">{t("settings.chromeExtension")}</div>}
              <div className="text-[11px] text-[var(--muted)] mt-0.5">{t("settings.extensionDesktopHint")}</div>
            </div>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={() => void checkExtensionStatus()}
              disabled={extensionChecking}
            >
              {extensionChecking ? t("settings.checking") : t("settings.checkConnection")}
            </button>
          </div>

          {ext && (
            <div className="p-3 border border-[var(--border)] bg-[var(--bg-muted)] mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: relayOk ? "var(--ok, #16a34a)" : "var(--danger, #e74c3c)",
                  }}
                />
                <span className="text-[13px] font-bold">
                  {t("settings.relayServer")}: {relayOk ? t("settings.connected") : t("settings.notReachable")}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)] font-[var(--mono)]">
                ws://127.0.0.1:{ext.relayPort}/extension
              </div>
              {!relayOk && (
                <div className="text-xs text-[var(--danger,#e74c3c)] mt-1.5">
                  {t("settings.extension.relayNotRunning")}
                </div>
              )}
            </div>
          )}

          <div className="mt-3">
            <div className="font-bold text-[13px] mb-2">{t("settings.installChromeExtension")}</div>
            <div className="text-xs text-[var(--muted)] leading-relaxed">
              <ol className="m-0 pl-5">
                <li className="mb-1.5">
                  {t("settings.extension.stepOpenChrome")}{" "}
                  <code className="text-[11px] px-1 border border-[var(--border)] bg-[var(--bg-muted)]">
                    chrome://extensions
                  </code>
                </li>
                <li className="mb-1.5">
                  {t("settings.extension.stepEnableDeveloperModePrefix")}{" "}
                  <strong>{t("settings.extension.developerMode")}</strong>{" "}
                  {t("settings.extension.stepEnableDeveloperModeSuffix")}
                </li>
                <li className="mb-1.5">
                  {t("settings.extension.stepLoadUnpackedPrefix")}{" "}
                  <strong>{t("settings.extension.loadUnpacked")}</strong>{" "}
                  {t("settings.extension.stepLoadUnpackedSuffix")}
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
                        ({t("settings.extension.relativeToPackageRoot")})
                      </span>
                    </>
                  )}
                </li>
                <li className="mb-1.5">{t("settings.extension.stepPinIcon")}</li>
                <li>
                  {t("settings.extension.stepAttachRelay")}
                </li>
              </ol>
            </div>
          </div>

          {ext?.extensionPath && (
            <div className="mt-3 py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all">
              {t("settings.extension.pathLabel")}: {ext.extensionPath}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          11. EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-export"
          className={inModal ? "settings-section-pane" : "mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"}
          style={inModal && activeSection !== "settings-export" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header">
              <span className="settings-hsr-header-text">{t("settings.exportImportAgent").toUpperCase()}</span>
              <div className="settings-hsr-line"></div>
            </div>
          ) : (
            <div className="font-bold text-sm mb-1">{t("settings.exportImportAgent")}</div>
          )}
          <div className={`text-[11px] mb-4 text-[var(--muted)]`}>{t("settings.exportImportAgent")}</div>
          <div className="flex items-center gap-2">
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openImportModal}
            >
              {t("settings.import")}
            </button>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openExportModal}
            >
              {t("settings.export")}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
          12. DANGER ZONE
          ═══════════════════════════════════════════════════════════════ */}
        <div id="settings-danger"
          className={`${inModal ? "settings-section-pane border-t border-[var(--danger,#e74c3c)] bg-transparent pt-4" : "mt-6 border border-[var(--danger,#e74c3c)] bg-[rgba(231,76,60,0.05)] rounded-xl p-4"}`}
          style={inModal && activeSection !== "settings-danger" ? { display: "none" } : undefined}
        >
          {inModal ? (
            <div className="settings-hsr-header mb-4">
              <span className="settings-hsr-header-text text-[var(--danger,#e74c3c)]">{t("settings.dangerZone").toUpperCase()}</span>
              <div className="settings-hsr-line !bg-[var(--danger,#e74c3c)] opacity-20"></div>
            </div>
          ) : (
            <h3 className="text-lg font-bold text-[var(--danger,#e74c3c)]">{t("settings.dangerZone")}</h3>
          )}
          <p className="text-[13px] text-[var(--muted)] mb-5">
            {t("settings.irreversibleActions")}
          </p>

          <div className="border border-[var(--danger,#e74c3c)] p-4 mb-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-sm">{t("settings.exportPrivateKeys")}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  {t("settings.exportPrivateKeysHint")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <p className="text-[12px] text-amber-500 mb-2 text-right max-w-[220px]">
                  {t("settings.privateKeysWarning")}
                </p>
                <button
                  className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
                  style={{
                    background: "var(--danger, #e74c3c)",
                    borderColor: "var(--danger, #e74c3c)",
                  }}
                  onClick={() => void handleExportKeys()}
                >
                  {walletExportVisible ? t("settings.hideKeys") : t("settings.exportKeys")}
                </button>
              </div>
            </div>
            {walletExportVisible && walletExportData && (
              <div className="mt-3 p-3 border border-[var(--danger,#e74c3c)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all leading-relaxed">
                {walletExportData.evm && (
                  <div className="mb-2">
                    <strong>{t("settings.evmPrivateKey")}</strong>{" "}
                    <span className="text-[var(--muted)]">({walletExportData.evm.address})</span>
                    <br />
                    <span>{walletExportData.evm.privateKey}</span>
                    <button
                      className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      onClick={() => void copyToClipboard(walletExportData.evm!.privateKey)}
                    >
                      {t("wallet.copy")}
                    </button>
                  </div>
                )}
                {walletExportData.solana && (
                  <div>
                    <strong>{t("settings.solanaPrivateKey")}</strong>{" "}
                    <span className="text-[var(--muted)]">({walletExportData.solana.address})</span>
                    <br />
                    <span>{walletExportData.solana.privateKey}</span>
                    <button
                      className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      onClick={() => void copyToClipboard(walletExportData.solana!.privateKey)}
                    >
                      {t("wallet.copy")}
                    </button>
                  </div>
                )}
                {!walletExportData.evm && !walletExportData.solana && (
                  <div className="text-[var(--muted)]">{t("settings.noWalletKeysConfigured")}</div>
                )}
              </div>
            )}
          </div>

          <div className="border border-[var(--danger,#e74c3c)] p-4 flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">{t("settings.resetAgent")}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {t("settings.resetAgentHint")}
              </div>
            </div>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-4"
              style={{
                background: "var(--danger, #e74c3c)",
                borderColor: "var(--danger, #e74c3c)",
              }}
              onClick={() => {
                const confirmed = window.confirm(
                  t("settings.resetConfirmMessage"),
                );
                if (confirmed) void handleReset();
              }}
            >
              {t("settings.resetEverything")}
            </button>
          </div>
        </div>

        {/* ── Modals ── */}
        <Modal open={exportModalOpen} onClose={() => setExportModalOpen(false)} title={t("settings.exportAgent")}>
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[var(--muted)]">
              {t("settings.exportAgentHint")}
            </div>
            {exportEstimateLoading && (
              <div className="text-[11px] text-[var(--muted)]">{t("settings.estimatingExportSize")}</div>
            )}
            {!exportEstimateLoading && exportEstimate && (
              <div className="text-[11px] text-[var(--muted)] border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2">
                <div>{t("settings.estimatedFileSize")} {formatByteSize(exportEstimate.estimatedBytes)}</div>
                <div>
                  {t("settings.exportContainsCount", {
                    memories: String(exportEstimate.memoriesCount),
                    entities: String(exportEstimate.entitiesCount),
                    rooms: String(exportEstimate.roomsCount),
                    worlds: String(exportEstimate.worldsCount),
                    tasks: String(exportEstimate.tasksCount),
                  })}
                </div>
              </div>
            )}
            {!exportEstimateLoading && exportEstimateError && (
              <div className="text-[11px] text-[var(--danger,#e74c3c)]">
                {t("settings.couldNotEstimateExportSize")} {exportEstimateError}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">{t("settings.encryptionPassword")}</label>
              <input
                type="password"
                placeholder={t("settings.passwordPlaceholder")}
                value={exportPassword}
                onChange={(e) => setState("exportPassword", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="text-[11px] text-[var(--muted)]">
                {t("settings.passwordMinLength")}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={exportIncludeLogs}
                onChange={(e) => setState("exportIncludeLogs", e.target.checked)}
              />
              {t("settings.includeLogsInExport")}
            </label>
            {exportError && (
              <div className="text-[11px] text-[var(--danger,#e74c3c)]">{exportError}</div>
            )}
            {exportSuccess && (
              <div className="text-[11px] text-[var(--ok,#16a34a)]">{exportSuccess}</div>
            )}
            <div className="flex justify-end gap-2 mt-1">
              <button
                className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
                onClick={() => setExportModalOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn text-xs py-1.5 px-4 !mt-0"
                disabled={exportBusy}
                onClick={() => void handleAgentExport()}
              >
                {exportBusy ? t("settings.exporting") : t("settings.downloadExport")}
              </button>
            </div>
          </div>
        </Modal>

        <Modal open={importModalOpen} onClose={() => setImportModalOpen(false)} title={t("settings.importAgent")}>
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[var(--muted)]">
              {t("settings.importAgentHint")}
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">{t("settings.exportFile")}</label>
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
              <label className="font-semibold text-xs">{t("settings.decryptionPassword")}</label>
              <input
                type="password"
                placeholder={t("settings.passwordPlaceholder")}
                value={importPassword}
                onChange={(e) => setState("importPassword", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
              />
              <div className="text-[11px] text-[var(--muted)]">
                {t("settings.passwordMinLength")}
              </div>
            </div>
            {importError && (
              <div className="text-[11px] text-[var(--danger,#e74c3c)]">{importError}</div>
            )}
            {importSuccess && (
              <div className="text-[11px] text-[var(--ok,#16a34a)]">{importSuccess}</div>
            )}
            <div className="flex justify-end gap-2 mt-1">
              <button
                className="btn text-xs py-1.5 px-4 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--txt)]"
                onClick={() => setImportModalOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn text-xs py-1.5 px-4 !mt-0"
                disabled={importBusy}
                onClick={() => void handleAgentImport()}
              >
                {importBusy ? t("settings.importing") : t("settings.importAgent")}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
