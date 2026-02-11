/**
 * Config view component — admin settings.
 *
 * Section order:
 *   1. Theme
 *   2. Model Provider  (onboarding-style provider selector)
 *   3. Model Provider Settings  (detailed plugin config)
 *   4. Wallet Providers & API Keys
 *   5. Connectors
 *   6. Software Updates
 *   7. Chrome Extension
 *   8. Agent Export / Import
 *   9. Danger Zone
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, THEMES } from "../AppContext";
import { client, type PluginInfo, type PluginParamDef, type OnboardingOptions } from "../api-client";

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

const ACRONYMS = new Set([
  "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
  "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
]);

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

function autoFieldType(param: PluginParamDef): "text" | "password" | "boolean" | "number" | "url" {
  if (param.type === "boolean") return "boolean";
  if (param.sensitive) return "password";
  const k = param.key.toUpperCase();
  if (k.includes("URL") || k.includes("ENDPOINT")) return "url";
  if (param.type === "number" || k.includes("PORT") || k.includes("TIMEOUT") || k.includes("DELAY"))
    return "number";
  return "text";
}

/* ── Plugin field sub-components ──────────────────────────────────────── */

function PluginBooleanField({
  param,
  onChange,
}: {
  param: PluginParamDef;
  onChange: (value: string) => void;
}) {
  const serverVal = param.currentValue === "true" || param.currentValue === "1";
  const defaultVal = String(param.default) === "true" || String(param.default) === "1";
  const initialVal = param.isSet ? serverVal : defaultVal;

  const [localVal, setLocalVal] = useState(initialVal);

  const handleToggle = () => {
    const next = !localVal;
    setLocalVal(next);
    onChange(next ? "true" : "false");
  };

  return (
    <button
      type="button"
      className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0"
      onClick={handleToggle}
    >
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          localVal ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            localVal ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-xs text-[var(--muted)]">{localVal ? "Enabled" : "Disabled"}</span>
    </button>
  );
}

function PluginPasswordField({
  param,
  onChange,
}: {
  param: PluginParamDef;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex">
      <input
        className="flex-1 px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
        type={visible ? "text" : "password"}
        defaultValue={param.isSet ? "" : (param.default ?? "")}
        placeholder={param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="px-3 border border-l-0 border-[var(--border)] bg-[var(--bg-muted,transparent)] text-xs cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)]"
        onClick={() => setVisible(!visible)}
        type="button"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function PluginSelectField({
  param,
  onChange,
}: {
  param: PluginParamDef;
  onChange: (value: string) => void;
}) {
  const currentValue = param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
  const effectiveValue = currentValue || (param.default ?? "");

  return (
    <select
      className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
      defaultValue={effectiveValue}
      onChange={(e) => onChange(e.target.value)}
    >
      {!param.required && <option value="">— none —</option>}
      {(param.options ?? []).map((opt: string) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function PluginTextField({
  param,
  fieldType,
  onChange,
}: {
  param: PluginParamDef;
  fieldType: string;
  onChange: (value: string) => void;
}) {
  const inputType = fieldType === "number" ? "number" : fieldType === "url" ? "url" : "text";
  const currentValue = param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
  const effectiveValue = currentValue || (param.default ?? "");

  return (
    <input
      className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
      type={inputType}
      defaultValue={effectiveValue}
      placeholder="Enter value..."
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PluginField({
  plugin,
  param,
  onChange,
}: {
  plugin: PluginInfo;
  param: PluginParamDef;
  onChange: (key: string, value: string) => void;
}) {
  const fieldType = autoFieldType(param);
  const label = autoLabel(param.key, plugin.id);
  const handleChange = (value: string) => onChange(param.key, value);

  /* Boolean fields — ultra-compact single row */
  if (fieldType === "boolean") {
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0 py-1.5 border-b border-[var(--border)] last:border-b-0">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span
            className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${
              param.isSet ? "bg-[var(--ok,#16a34a)]" : "bg-[var(--muted)]"
            }`}
          />
          <span className="font-semibold truncate">{label}</span>
          <code className="text-[10px] text-[var(--muted)] font-[var(--mono)] hidden sm:inline">{param.key}</code>
        </div>
        <PluginBooleanField param={param} onChange={handleChange} />
      </div>
    );
  }

  /* All other field types — compact 2-column row */
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-start gap-x-4 gap-y-0.5 py-2 border-b border-[var(--border)] last:border-b-0">
      {/* Left: label + env key + description */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${
              param.isSet
                ? "bg-[var(--ok,#16a34a)]"
                : param.required
                  ? "bg-[var(--warning,#f39c12)]"
                  : "bg-[var(--muted)]"
            }`}
          />
          <span className="font-semibold truncate">{label}</span>
          {param.required && (
            <span className="shrink-0 text-[10px] text-[var(--warning,#f39c12)] font-medium">required</span>
          )}
          {param.isSet && (
            <span className="shrink-0 text-[10px] text-[var(--ok,#16a34a)] font-medium">configured</span>
          )}
        </div>
        <code className="text-[10px] text-[var(--muted)] font-[var(--mono)] truncate">{param.key}</code>
        {param.description && (
          <div className="text-[10px] text-[var(--muted)] leading-snug mt-0.5">
            {param.description}
            {param.default != null && (
              <span className="opacity-70"> (default: {param.default})</span>
            )}
          </div>
        )}
      </div>

      {/* Right: input */}
      <div className="min-w-0">
        {fieldType === "password" ? (
          <PluginPasswordField param={param} onChange={handleChange} />
        ) : param.options?.length ? (
          <PluginSelectField param={param} onChange={handleChange} />
        ) : (
          <PluginTextField param={param} fieldType={fieldType} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}

/* ── ConfigView ───────────────────────────────────────────────────────── */

type InventoryProvider = "alchemy" | "helius" | "birdeye";

export function ConfigView() {
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
    updateChannelSaving,
    // Extension
    extensionStatus,
    extensionChecking,
    // Wallet
    walletConfig,
    walletApiKeySaving,
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
    importFile,
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
    handleWalletApiKeySave,
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
  const [modelOptions, setModelOptions] = useState<OnboardingOptions["models"] | null>(null);
  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  useEffect(() => {
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();

    /* Load model options and current model config */
    void (async () => {
      try {
        const opts = await client.getOnboardingOptions();
        setModelOptions(opts.models);
      } catch { /* ignore */ }
      try {
        const cfg = await client.getConfig();
        const models = cfg.models as Record<string, string> | undefined;
        const cloud = cfg.cloud as Record<string, unknown> | undefined;
        const cloudEnabled = cloud?.enabled === true;
        const defaultSmall = "moonshotai/kimi-k2-turbo";
        const defaultLarge = "moonshotai/kimi-k2-0905";
        setCurrentSmallModel(models?.small || (cloudEnabled ? defaultSmall : ""));
        setCurrentLargeModel(models?.large || (cloudEnabled ? defaultLarge : ""));
      } catch { /* ignore */ }
    })();
  }, [loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  const handleModelSave = useCallback(async () => {
    setModelSaving(true);
    setModelSaveSuccess(false);
    try {
      await client.updateConfig({
        models: { small: currentSmallModel, large: currentLargeModel },
      });
      await client.restartAgent();
      setModelSaveSuccess(true);
      setTimeout(() => setModelSaveSuccess(false), 2000);
    } catch { /* ignore */ }
    setModelSaving(false);
  }, [currentSmallModel, currentLargeModel]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);

  /* Track which provider is selected for showing settings inline.
   * Initialise to __cloud__ when cloud is the active model provider so the
   * selection survives component remounts (e.g. tab switches). */
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => (cloudEnabled ? "__cloud__" : null),
  );

  /* Keep in sync: when cloudEnabled changes (e.g. after onboarding or
   * disconnect), update the local selection if the user hasn't already
   * picked something manually. */
  const hasManualSelection = useRef(false);
  useEffect(() => {
    if (hasManualSelection.current) return;
    if (cloudEnabled && selectedProviderId !== "__cloud__") {
      setSelectedProviderId("__cloud__");
    }
  }, [cloudEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve the actually-selected provider: accept __cloud__ or fall back to first enabled */
  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId && allAiProviders.some((p) => p.id === selectedProviderId)
        ? selectedProviderId
        : enabledAiProviders[0]?.id ?? null;

  const selectedProvider = resolvedSelectedId && resolvedSelectedId !== "__cloud__"
    ? allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null
    : null;

  /* Switch to a local provider: enable the new one, disable all others,
   * and turn off cloud mode so the runtime picks up the correct plugin. */
  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      /* Turn off cloud mode when switching to a local provider */
      try {
        await client.updateConfig({ cloud: { enabled: false } });
      } catch { /* non-fatal */ }

      /* Enable the new provider if not already */
      if (!target.enabled) {
        await handlePluginToggle(newId, true);
      }

      /* Disable all other enabled ai-providers */
      for (const p of enabledAiProviders) {
        if (p.id !== newId) {
          await handlePluginToggle(p.id, false);
        }
      }
    },
    [allAiProviders, enabledAiProviders, handlePluginToggle],
  );

  /* Switch to Eliza Cloud: persist the selection to config and restart
   * the runtime so the cloud plugin loads with the saved API key.
   * Also ensures sensible model defaults are present in config. */
  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    try {
      await client.updateConfig({
        cloud: { enabled: true },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      await client.restartAgent();
    } catch { /* non-fatal */ }
  }, [currentSmallModel, currentLargeModel]);

  const ext = extensionStatus;
  const relayOk = ext?.relayReachable === true;

  /* ── Wallet key save (collects all 3 inputs) ────────────────────── */
  const handleWalletSaveAll = useCallback(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>("[data-wallet-config]");
    const config: Record<string, string> = {};
    inputs.forEach((input) => {
      const key = input.dataset.walletConfig;
      if (key && input.value) {
        config[key] = input.value;
      }
    });
    void handleWalletApiKeySave(config);
  }, [handleWalletApiKeySave]);


  /* ── RPC provider selection state ────────────────────────────────── */
  const [selectedEvmRpc, setSelectedEvmRpc] = useState<"eliza-cloud" | "alchemy" | "infura" | "ankr">("eliza-cloud");
  const [selectedSolanaRpc, setSelectedSolanaRpc] = useState<"eliza-cloud" | "helius-birdeye">("eliza-cloud");
  const [walletProviderModal, setWalletProviderModal] = useState<InventoryProvider | null>(null);

  const walletProviderModalContent: {
    title: string;
    configured: boolean;
    description: string;
    configKey: string;
    placeholder: string;
    steps: React.ReactNode;
  } | null = (() => {
    if (walletProviderModal === "alchemy") {
      return {
        title: "Alchemy",
        configured: walletConfig?.alchemyKeySet ?? false,
        description: "EVM chain data for Ethereum, Base, Arbitrum, Optimism, and Polygon.",
        configKey: "ALCHEMY_API_KEY",
        placeholder: walletConfig?.alchemyKeySet ? "Already set - leave blank to keep" : "Paste your Alchemy API key",
        steps: (
          <ol className="pl-4 list-decimal space-y-1">
            <li>Create a free account at <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener" className="text-[var(--accent)]">dashboard.alchemy.com</a></li>
            <li>Create an app and enable the networks you use</li>
            <li>Copy the API key and paste it below</li>
          </ol>
        ),
      };
    }
    if (walletProviderModal === "helius") {
      return {
        title: "Helius",
        configured: walletConfig?.heliusKeySet ?? false,
        description: "Solana chain data for tokens, NFTs, and enhanced RPC endpoints.",
        configKey: "HELIUS_API_KEY",
        placeholder: walletConfig?.heliusKeySet ? "Already set - leave blank to keep" : "Paste your Helius API key",
        steps: (
          <ol className="pl-4 list-decimal space-y-1">
            <li>Create a free account at <a href="https://dev.helius.xyz/dashboard/app" target="_blank" rel="noopener" className="text-[var(--accent)]">dev.helius.xyz</a></li>
            <li>Copy the API key from your dashboard</li>
            <li>Paste it below</li>
          </ol>
        ),
      };
    }
    if (walletProviderModal === "birdeye") {
      return {
        title: "Birdeye",
        configured: walletConfig?.birdeyeKeySet ?? false,
        description: "Optional Solana price data provider used for USD token valuations.",
        configKey: "BIRDEYE_API_KEY",
        placeholder: walletConfig?.birdeyeKeySet
          ? "Already set - leave blank to keep"
          : "Paste your Birdeye API key (optional)",
        steps: (
          <ol className="pl-4 list-decimal space-y-1">
            <li>Create a free account at <a href="https://birdeye.so/user/api-management" target="_blank" rel="noopener" className="text-[var(--accent)]">birdeye.so</a></li>
            <li>Open the API section in your profile</li>
            <li>Copy the API key and paste it below</li>
          </ol>
        ),
      };
    }
    return null;
  })();

  /* ── Export / Import modal state ─────────────────────────────────── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const openExportModal = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
    setExportModalOpen(true);
  }, [setState]);

  const openImportModal = useCallback(() => {
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
    setImportModalOpen(true);
  }, [setState]);

  /* ── Plugin config local state for collecting field values ──────── */
  const [pluginFieldValues, setPluginFieldValues] = useState<Record<string, Record<string, string>>>({});

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
      <h2 className="text-lg font-bold mb-5">Config</h2>

      {/* ═══════════════════════════════════════════════════════════════
          1. THEME
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-2">Theme</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {THEMES.map((t) => (
            <button
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
          3. MODEL PROVIDER  (onboarding-style selector)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">Model Provider</div>

        {/* Provider cards (cloud + local in one row) */}
        {(() => {
          const totalCols = allAiProviders.length + 1; /* +1 for Eliza Cloud, always shown */
          const isCloudSelected = resolvedSelectedId === "__cloud__";

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
                      setTab("features");
                    }}
                  >
                    Features
                  </a>{" "}
                  page.
                </div>
              </div>
            );
          }

          return (
            <>
              {/* Button row */}
              <div
                className="grid gap-1.5"
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

              {/* ── Eliza Cloud settings ──────────────────────────────── */}
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

                      {/* Cloud model selection */}
                      {modelOptions && (() => {
                        // Group models by provider for cleaner optgroup display
                        const groupByProvider = (models: typeof modelOptions.small) => {
                          const groups: Record<string, typeof models> = {};
                          for (const m of models) {
                            const key = m.provider || "Other";
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(m);
                          }
                          return groups;
                        };
                        const smallGroups = groupByProvider(modelOptions.small);
                        const largeGroups = groupByProvider(modelOptions.large);

                        return (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold">Small Model</label>
                              <div className="text-[10px] text-[var(--muted)]">Fast model for simple tasks</div>
                              <select
                                value={currentSmallModel}
                                onChange={(e) => setCurrentSmallModel(e.target.value)}
                                className="px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
                              >
                                <option value="">Select model...</option>
                                {Object.entries(smallGroups).map(([provider, models]) => (
                                  <optgroup key={provider} label={provider}>
                                    {models.map((m) => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold">Large Model</label>
                              <div className="text-[10px] text-[var(--muted)]">Powerful model for complex reasoning</div>
                              <select
                                value={currentLargeModel}
                                onChange={(e) => setCurrentLargeModel(e.target.value)}
                                className="px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
                              >
                                <option value="">Select model...</option>
                                {Object.entries(largeGroups).map(([provider, models]) => (
                                  <optgroup key={provider} label={provider}>
                                    {models.map((m) => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex justify-end mt-3">
                        <button
                          className={`btn text-xs py-[5px] px-4 !mt-0 ${modelSaveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                          onClick={() => void handleModelSave()}
                          disabled={modelSaving}
                        >
                          {modelSaving ? "Saving..." : modelSaveSuccess ? "Saved" : "Save"}
                        </button>
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

                    {params.map((param: PluginParamDef) => (
                      <PluginField
                        key={param.key}
                        plugin={selectedProvider}
                        param={param}
                        onChange={(key, value) =>
                          handlePluginFieldChange(selectedProvider.id, key, value)
                        }
                      />
                    ))}

                    <div className="flex justify-end mt-3">
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
              })()}
            </>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          5. RPC & DATA PROVIDERS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-4">RPC &amp; Data Providers</div>

        <div className="grid grid-cols-2 gap-6">
          {/* ── EVM ─────────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold mb-1">EVM</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Ethereum, Base, Arbitrum, Optimism, Polygon</div>

            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "alchemy" as const, label: "Alchemy" },
                { id: "infura" as const, label: "Infura" },
                { id: "ankr" as const, label: "Ankr" },
              ]).map((p) => {
                const active = selectedEvmRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedEvmRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline settings for selected EVM provider */}
            {selectedEvmRpc === "eliza-cloud" && (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {selectedEvmRpc === "alchemy" && (
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">Alchemy API Key</span>
                  {walletConfig?.alchemyKeySet && <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>}
                  <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                </div>
                <button
                  className="btn text-xs py-1.5 px-3 !mt-0 self-start"
                  onClick={() => setWalletProviderModal("alchemy")}
                >
                  Open setup
                </button>
              </div>
            )}
            {selectedEvmRpc === "infura" && (
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">Infura API Key</span>
                  {walletConfig?.infuraKeySet && <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>}
                  <a href="https://app.infura.io/" target="_blank" rel="noopener" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                </div>
                <input type="password" data-wallet-config="INFURA_API_KEY" placeholder={walletConfig?.infuraKeySet ? "Already set — leave blank to keep" : "Enter API key"} className="w-full py-1.5 px-2 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] box-border focus:border-[var(--accent)] focus:outline-none" />
              </div>
            )}
            {selectedEvmRpc === "ankr" && (
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">Ankr API Key</span>
                  {walletConfig?.ankrKeySet && <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>}
                  <a href="https://www.ankr.com/rpc/" target="_blank" rel="noopener" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                </div>
                <input type="password" data-wallet-config="ANKR_API_KEY" placeholder={walletConfig?.ankrKeySet ? "Already set — leave blank to keep" : "Enter API key"} className="w-full py-1.5 px-2 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] box-border focus:border-[var(--accent)] focus:outline-none" />
              </div>
            )}
          </div>

          {/* ── Solana ──────────────────────────────────── */}
          <div>
            <div className="text-xs font-bold mb-1">Solana</div>
            <div className="text-[11px] text-[var(--muted)] mb-2">Solana mainnet tokens and NFTs</div>

            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "eliza-cloud" as const, label: "Eliza Cloud" },
                { id: "helius-birdeye" as const, label: "Helius + Birdeye" },
              ]).map((p) => {
                const active = selectedSolanaRpc === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setSelectedSolanaRpc(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline settings for selected Solana provider */}
            {selectedSolanaRpc === "eliza-cloud" && (
              <div className="mt-3">
                {cloudConnected ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                    <span className="font-semibold">Connected to Eliza Cloud</span>
                    {cloudCredits !== null && (
                      <span className="text-[var(--muted)] ml-auto">
                        Credits: <span className={cloudCreditsCritical ? "text-[var(--danger,#e74c3c)] font-bold" : cloudCreditsLow ? "text-[#b8860b] font-bold" : ""}>${cloudCredits.toFixed(2)}</span>
                        {cloudTopUpUrl && <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] ml-1.5 text-[var(--accent)]">Top up</a>}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                      <span className="text-[var(--muted)]">Requires Eliza Cloud connection</span>
                    </div>
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                      onClick={() => void handleCloudLogin()}
                      disabled={cloudLoginBusy}
                    >
                      {cloudLoginBusy ? "Connecting..." : "Log in"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {selectedSolanaRpc === "helius-birdeye" && (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold">Helius API Key</span>
                    {walletConfig?.heliusKeySet && <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>}
                    <a href="https://dev.helius.xyz/" target="_blank" rel="noopener" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                  </div>
                  <button
                    className="btn text-xs py-1.5 px-3 !mt-0 self-start"
                    onClick={() => setWalletProviderModal("helius")}
                  >
                    Open setup
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold">Birdeye API Key</span>
                    {walletConfig?.birdeyeKeySet && <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>}
                    <a href="https://birdeye.so/" target="_blank" rel="noopener" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                  </div>
                  <button
                    className="btn text-xs py-1.5 px-3 !mt-0 self-start"
                    onClick={() => setWalletProviderModal("birdeye")}
                  >
                    Open setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-xs font-semibold mb-1">Inventory Provider Setup</div>
          <div className="text-[11px] text-[var(--muted)] mb-3">
            Progressive disclosure: open a provider tile to configure API keys without cluttering this page.
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              {
                id: "alchemy" as const,
                label: "Alchemy",
                configured: walletConfig?.alchemyKeySet ?? false,
              },
              {
                id: "helius" as const,
                label: "Helius",
                configured: walletConfig?.heliusKeySet ?? false,
              },
              {
                id: "birdeye" as const,
                label: "Birdeye",
                configured: walletConfig?.birdeyeKeySet ?? false,
                optional: true,
              },
            ]).map((provider) => (
              <button
                key={provider.id}
                className="relative border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition-colors px-2 py-4 text-center"
                onClick={() => setWalletProviderModal(provider.id)}
              >
                <div className="absolute top-1.5 right-1.5 text-[10px]">
                  {provider.configured ? (
                    <span className="text-[var(--ok,#16a34a)]">configured</span>
                  ) : provider.optional ? (
                    <span className="text-[var(--muted)]">optional</span>
                  ) : null}
                </div>
                <div className="text-xl font-bold text-[var(--muted)]">?</div>
                <div className="text-xs font-semibold mt-1">{provider.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            className="btn text-[11px] py-1 px-3.5 !mt-0"
            onClick={handleWalletSaveAll}
            disabled={walletApiKeySaving}
          >
            {walletApiKeySaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════════════
          7. SOFTWARE UPDATES
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-bold text-sm">Software Updates</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {updateStatus ? <>Version {updateStatus.currentVersion}</> : <>Loading...</>}
            </div>
          </div>
          <button
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            disabled={updateLoading}
            onClick={() => void loadUpdateStatus(true)}
          >
            {updateLoading ? "Checking..." : "Check Now"}
          </button>
        </div>

        {updateStatus ? (
          <>
            {/* Channel selector */}
            <div className="mb-4">
              <div className="font-semibold text-xs mb-1.5">Release Channel</div>
              <div className="grid grid-cols-3 gap-2">
                {(["stable", "beta", "nightly"] as const).map((ch) => {
                  const active = updateStatus.channel === ch;
                  const desc =
                    ch === "stable" ? "Recommended" : ch === "beta" ? "Preview" : "Bleeding edge";
                  return (
                    <button
                      key={ch}
                      className={`theme-btn text-left p-2.5 ${active ? "active" : ""}`}
                      disabled={updateChannelSaving}
                      onClick={() => void handleChannelChange(ch)}
                    >
                      <div className="text-[13px] font-bold text-[var(--text)]">{ch}</div>
                      <div className="text-[11px] text-[var(--muted)] mt-0.5">{desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Update available banner */}
            {updateStatus.updateAvailable && updateStatus.latestVersion && (
              <div className="mt-3 py-2.5 px-3 border border-[var(--accent)] bg-[rgba(255,255,255,0.03)] rounded flex justify-between items-center">
                <div>
                  <div className="text-[13px] font-bold text-[var(--accent)]">Update available</div>
                  <div className="text-xs text-[var(--muted)]">
                    {updateStatus.currentVersion} &rarr; {updateStatus.latestVersion}
                  </div>
                </div>
                <div className="text-[11px] text-[var(--muted)] text-right">
                  Run{" "}
                  <code className="bg-[var(--bg-hover,rgba(255,255,255,0.05))] px-1.5 py-0.5 rounded-sm">
                    milaidy update
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
                Last checked: {new Date(updateStatus.lastCheckAt).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-3 text-[var(--muted)] text-xs">
            {updateLoading ? "Checking for updates..." : "Unable to load update status."}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          8. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">Chrome Extension</div>
          <button
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
                  background: relayOk ? "var(--ok, #16a34a)" : "var(--danger, #e74c3c)",
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
                The browser relay server is not running. Start the agent with browser control
                enabled, then check again.
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <div className="font-bold text-[13px] mb-2">Install Chrome Extension</div>
          <div className="text-xs text-[var(--muted)] leading-relaxed">
            <ol className="m-0 pl-5">
              <li className="mb-1.5">
                Open Chrome and navigate to{" "}
                <code className="text-[11px] px-1 border border-[var(--border)] bg-[var(--bg-muted)]">
                  chrome://extensions
                </code>
              </li>
              <li className="mb-1.5">
                Enable <strong>Developer mode</strong> (toggle in the top-right corner)
              </li>
              <li className="mb-1.5">
                Click <strong>&quot;Load unpacked&quot;</strong> and select the extension folder:
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
                    <span className="italic"> (relative to milaidy package root)</span>
                  </>
                )}
              </li>
              <li className="mb-1.5">Pin the extension icon in Chrome&apos;s toolbar</li>
              <li>
                Click the extension icon on any tab to attach/detach the Milaidy browser relay
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
          9. AGENT EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center">
          <div className="font-bold text-sm">Agent Export / Import</div>
          <div className="flex items-center gap-2">
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openImportModal}
            >
              Import
            </button>
            <button
              className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
              onClick={openExportModal}
            >
              Export
            </button>
          </div>
        </div>
      </div>


      {/* ─── Export Modal ─────────────────────────────────────────────── */}
      <Modal open={exportModalOpen} onClose={() => setExportModalOpen(false)} title="Export Agent">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Your character, memories, chats, secrets, and relationships will be downloaded as a
            single file. Optionally set a password to encrypt the export.
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">
              Encryption Password <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <input
              type="password"
              placeholder="Leave blank to skip encryption"
              value={exportPassword}
              onChange={(e) => setState("exportPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={exportIncludeLogs}
              onChange={(e) => setState("exportIncludeLogs", e.target.checked)}
            />
            Include logs in export
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
              Cancel
            </button>
            <button
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={exportBusy || (exportPassword.length > 0 && exportPassword.length < 4)}
              onClick={() => void handleAgentExport()}
            >
              {exportBusy ? "Exporting..." : "Download Export"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Import Modal ─────────────────────────────────────────────── */}
      <Modal open={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Agent">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Select an <code className="text-[11px]">.eliza-agent</code> export file. If it was
            encrypted, enter the password used during export.
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">Export File</label>
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
            <label className="font-semibold text-xs">
              Decryption Password <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <input
              type="password"
              placeholder="Leave blank if export was not encrypted"
              value={importPassword}
              onChange={(e) => setState("importPassword", e.target.value)}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
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
              Cancel
            </button>
            <button
              className="btn text-xs py-1.5 px-4 !mt-0"
              disabled={importBusy || !importFile || (importPassword.length > 0 && importPassword.length < 4)}
              onClick={() => void handleAgentImport()}
            >
              {importBusy ? "Importing..." : "Import Agent"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={walletProviderModalContent !== null}
        onClose={() => setWalletProviderModal(null)}
        title={walletProviderModalContent?.title ?? "Provider Setup"}
      >
        {walletProviderModalContent && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[var(--muted)] leading-relaxed">
              {walletProviderModalContent.description}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {walletProviderModalContent.steps}
            </div>
            <input
              type="password"
              data-wallet-config={walletProviderModalContent.configKey}
              placeholder={walletProviderModalContent.placeholder}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="flex justify-between items-center gap-2">
              <div className="text-[11px] text-[var(--muted)]">
                {walletProviderModalContent.configured ? "Currently configured" : "Not configured"}
              </div>
              <button
                className="btn text-xs py-1.5 px-4 !mt-0"
                onClick={handleWalletSaveAll}
                disabled={walletApiKeySaving}
              >
                {walletApiKeySaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════
          10. DANGER ZONE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-12 pt-6 border-t border-[var(--border)]">
        <h2 className="text-lg font-bold text-[var(--danger,#e74c3c)]">Danger Zone</h2>
        <p className="text-[13px] text-[var(--muted)] mb-5">
          Irreversible actions. Proceed with caution.
        </p>

        {/* Export Private Keys */}
        <div className="border border-[var(--danger,#e74c3c)] p-4 mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">Export Private Keys</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Reveal your EVM and Solana private keys. Never share these with anyone.
              </div>
            </div>
            <button
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
                  <span className="text-[var(--muted)]">({walletExportData.evm.address})</span>
                  <br />
                  <span>{walletExportData.evm.privateKey}</span>
                  <button
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() => void copyToClipboard(walletExportData.evm!.privateKey)}
                  >
                    copy
                  </button>
                </div>
              )}
              {walletExportData.solana && (
                <div>
                  <strong>Solana Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">({walletExportData.solana.address})</span>
                  <br />
                  <span>{walletExportData.solana.privateKey}</span>
                  <button
                    className="ml-2 px-1.5 py-0.5 border border-[var(--border)] bg-[var(--bg)] cursor-pointer text-[10px] font-[var(--mono)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() => void copyToClipboard(walletExportData.solana!.privateKey)}
                  >
                    copy
                  </button>
                </div>
              )}
              {!walletExportData.evm && !walletExportData.solana && (
                <div className="text-[var(--muted)]">No wallet keys configured.</div>
              )}
            </div>
          )}
        </div>

        {/* Reset Agent */}
        <div className="border border-[var(--danger,#e74c3c)] p-4 flex justify-between items-center">
          <div>
            <div className="font-bold text-sm">Reset Agent</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Wipe all config, memory, and data. Returns to the onboarding wizard.
            </div>
          </div>
          <button
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
    </div>
  );
}
