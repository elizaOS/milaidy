/**
 * Config view component — settings page with multiple sections.
 *
 * Section order:
 *   1. Character
 *   2. Theme
 *   3. Model Provider  (onboarding-style provider selector)
 *   4. Model Provider Settings  (detailed plugin config)
 *   5. Wallet Providers & API Keys
 *   6. Software Updates
 *   7. Chrome Extension
 *   8. Agent Export / Import
 *   9. Danger Zone
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, THEMES } from "../AppContext.js";
import type { PluginInfo, PluginParamDef } from "../../ui/api-client.js";

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

/* ── Auto-detection helpers (mirrors Lit autoLabel / autoFieldType) ─── */

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
  const currentVal = param.currentValue === "true" || param.currentValue === "1";
  const defaultVal = String(param.default) === "true" || String(param.default) === "1";
  const effectiveVal = param.isSet ? currentVal : defaultVal;

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="sr-only"
        checked={effectiveVal}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
      />
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          effectiveVal ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            effectiveVal ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-xs text-[var(--muted)]">{effectiveVal ? "Enabled" : "Disabled"}</span>
    </label>
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
        defaultValue=""
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
  const placeholder = param.default ? `Default: ${param.default}` : "Enter value...";

  return (
    <input
      className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
      type={inputType}
      defaultValue={currentValue}
      placeholder={placeholder}
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
    // Character
    characterData,
    characterDraft,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
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
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleSaveCharacter,
    loadCharacter,
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

  useEffect(() => {
    void loadCharacter();
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();
  }, [loadCharacter, loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);

  const d = characterDraft;
  const bioText = typeof d.bio === "string" ? d.bio : Array.isArray(d.bio) ? d.bio.join("\n") : "";
  const adjectivesText = (d.adjectives ?? []).join("\n");
  const topicsText = (d.topics ?? []).join("\n");
  const styleAllText = (d.style?.all ?? []).join("\n");
  const styleChatText = (d.style?.chat ?? []).join("\n");
  const stylePostText = (d.style?.post ?? []).join("\n");
  const postExamplesText = (d.postExamples ?? []).join("\n");

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
      <h2 className="text-lg font-bold">Settings</h2>
      <p className="text-[13px] text-[var(--muted)] mb-5">Agent settings and configuration.</p>

      {/* ═══════════════════════════════════════════════════════════════
          1. CHARACTER
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="font-bold text-sm">Character</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Define your agent&apos;s name, personality, knowledge, and communication style.
            </div>
          </div>
          <button
            className="btn whitespace-nowrap !mt-0 text-xs py-1.5 px-3.5"
            onClick={() => void loadCharacter()}
            disabled={characterLoading}
          >
            {characterLoading ? "Loading..." : "Reload"}
          </button>
        </div>

        {characterLoading && !characterData ? (
          <div className="text-center py-6 text-[var(--muted)] text-[13px]">
            Loading character data...
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">Name</label>
              <div className="text-[11px] text-[var(--muted)]">
                Agent display name (max 100 characters)
              </div>
              <input
                type="text"
                value={d.name ?? ""}
                maxLength={100}
                placeholder="Agent name"
                onChange={(e) => handleCharacterFieldInput("name", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-[13px] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* Bio */}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">Bio</label>
              <div className="text-[11px] text-[var(--muted)]">
                Biography — one paragraph per line
              </div>
              <textarea
                value={bioText}
                rows={4}
                placeholder="Write your agent's bio here. One paragraph per line."
                onChange={(e) => handleCharacterFieldInput("bio", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* System Prompt */}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">System Prompt</label>
              <div className="text-[11px] text-[var(--muted)]">
                Core behavior instructions for the agent (max 10,000 characters)
              </div>
              <textarea
                value={d.system ?? ""}
                rows={6}
                maxLength={10000}
                placeholder="You are..."
                onChange={(e) => handleCharacterFieldInput("system", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* Adjectives & Topics (side by side) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-xs">Adjectives</label>
                <div className="text-[11px] text-[var(--muted)]">
                  Personality adjectives — one per line
                </div>
                <textarea
                  value={adjectivesText}
                  rows={3}
                  placeholder={"curious\nwitty\nfriendly"}
                  onChange={(e) => handleCharacterArrayInput("adjectives", e.target.value)}
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-xs">Topics</label>
                <div className="text-[11px] text-[var(--muted)]">
                  Topics the agent knows — one per line
                </div>
                <textarea
                  value={topicsText}
                  rows={3}
                  placeholder={"artificial intelligence\nblockchain\ncreative writing"}
                  onChange={(e) => handleCharacterArrayInput("topics", e.target.value)}
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            </div>

            {/* Style */}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">Style</label>
              <div className="text-[11px] text-[var(--muted)]">
                Communication style guidelines — one rule per line
              </div>

              <div className="grid grid-cols-3 gap-3 mt-1 p-3 border border-[var(--border)] bg-[var(--bg-muted)]">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-[11px] text-[var(--muted)]">All</label>
                  <textarea
                    value={styleAllText}
                    rows={3}
                    placeholder={"Keep responses concise\nUse casual tone"}
                    onChange={(e) => handleCharacterStyleInput("all", e.target.value)}
                    className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-[11px] text-[var(--muted)]">Chat</label>
                  <textarea
                    value={styleChatText}
                    rows={3}
                    placeholder={"Be conversational\nAsk follow-up questions"}
                    onChange={(e) => handleCharacterStyleInput("chat", e.target.value)}
                    className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-[11px] text-[var(--muted)]">Post</label>
                  <textarea
                    value={stylePostText}
                    rows={3}
                    placeholder={"Use hashtags sparingly\nKeep under 280 characters"}
                    onChange={(e) => handleCharacterStyleInput("post", e.target.value)}
                    className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Post Examples */}
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-xs">Post Examples</label>
              <div className="text-[11px] text-[var(--muted)]">
                Example social media posts — one per line
              </div>
              <textarea
                value={postExamplesText}
                rows={3}
                placeholder="Just shipped a new feature! Excited to see what you build with it."
                onChange={(e) => handleCharacterArrayInput("postExamples", e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs font-inherit resize-y leading-relaxed focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3 mt-1">
              <button
                className="btn text-[13px] py-2 px-6 !mt-0"
                disabled={characterSaving}
                onClick={() => void handleSaveCharacter()}
              >
                {characterSaving ? "Saving..." : "Save Character"}
              </button>
              {characterSaveSuccess && (
                <span className="text-xs text-[var(--ok,#16a34a)]">{characterSaveSuccess}</span>
              )}
              {characterSaveError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">{characterSaveError}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          2. THEME
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-1">Theme</div>
        <div className="text-xs text-[var(--muted)] mb-2">Choose your visual style.</div>
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
        <div className="font-bold text-sm mb-1">Model Provider</div>
        <div className="text-xs text-[var(--muted)] mb-4">
          Choose which AI provider powers your agent. Enable one or more below.
        </div>

        {/* Cloud option (when cloud feature is available) */}
        {(cloudEnabled || cloudConnected) && (
          <div className="mb-4">
            <button
              className={`w-full text-left px-4 py-3 border cursor-pointer bg-[var(--card)] transition-colors ${
                cloudConnected
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
              onClick={() => {
                if (!cloudConnected) void handleCloudLogin();
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">ELIZA Cloud</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    Managed AI models, wallets, and RPCs
                  </div>
                </div>
                <span
                  className="text-[11px] px-2 py-[3px] border"
                  style={{
                    borderColor: cloudConnected ? "#2d8a4e" : "var(--border)",
                    color: cloudConnected ? "#2d8a4e" : "var(--muted)",
                  }}
                >
                  {cloudConnected ? "Connected" : "Not Connected"}
                </span>
              </div>
            </button>

            {/* Cloud details (expanded when connected) */}
            {cloudConnected && (
              <div className="px-4 py-3 border border-t-0 border-[var(--border)] bg-[var(--bg-muted)]">
                <div className="text-xs mb-2.5">
                  {cloudUserId && (
                    <div className="mb-1">
                      <span className="text-[var(--muted)]">User:</span>{" "}
                      <code className="font-[var(--mono)] text-[11px]">{cloudUserId}</code>
                    </div>
                  )}
                  {cloudCredits !== null && (
                    <div className="mb-1">
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
                    </div>
                  )}
                </div>
                <button
                  className="btn text-xs py-[5px] px-3.5 !mt-0"
                  onClick={() => void handleCloudDisconnect()}
                  disabled={cloudDisconnecting}
                >
                  {cloudDisconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            )}

            {/* Cloud login in-progress / error */}
            {!cloudConnected && cloudLoginBusy && (
              <div className="px-4 py-3 border border-t-0 border-[var(--border)] bg-[var(--bg-muted)]">
                <div className="text-xs text-[var(--muted)]">
                  Waiting for browser authentication... A new tab should have opened.
                </div>
              </div>
            )}
            {!cloudConnected && cloudLoginError && (
              <div className="px-4 py-2 border border-t-0 border-[var(--border)]">
                <div className="text-xs text-[var(--danger,#e74c3c)]">{cloudLoginError}</div>
              </div>
            )}
          </div>
        )}

        {/* Local provider cards */}
        {allAiProviders.length > 0 ? (
          <div className="flex flex-col gap-2">
            {allAiProviders.map((provider) => {
              const isActive = provider.enabled;
              return (
                <button
                  key={provider.id}
                  className={`w-full text-left px-4 py-3 border cursor-pointer bg-[var(--card)] transition-colors ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                  onClick={() => void handlePluginToggle(provider.id, !isActive)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm">{provider.name}</div>
                      {provider.description && (
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          {provider.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive && provider.configured && (
                        <span
                          className="text-[11px] px-2 py-[3px] border"
                          style={{ borderColor: "#2d8a4e", color: "#2d8a4e" }}
                        >
                          Configured
                        </span>
                      )}
                      {isActive && !provider.configured && (
                        <span
                          className="text-[11px] px-2 py-[3px] border"
                          style={{ borderColor: "var(--warning,#f39c12)", color: "var(--warning,#f39c12)" }}
                        >
                          Needs Setup
                        </span>
                      )}
                      <span
                        className={`inline-block w-3 h-3 rounded-full border-2 transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] border-[var(--accent)]"
                            : "bg-transparent border-[var(--muted)]"
                        }`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 border border-[var(--warning,#f39c12)] bg-[var(--card)]">
            <div className="text-xs text-[var(--warning,#f39c12)]">
              No AI providers available. Install a provider plugin from the{" "}
              <a
                href="#"
                className="text-[var(--accent)] underline"
                onClick={(e) => {
                  e.preventDefault();
                  setTab("plugins");
                }}
              >
                Plugins
              </a>{" "}
              page.
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          4. MODEL PROVIDER SETTINGS  (detailed config for active providers)
          ═══════════════════════════════════════════════════════════════ */}
      {enabledAiProviders.length > 0 && (
        <>
          {enabledAiProviders.map((provider) => {
            const isSaving = pluginSaving.has(provider.id);
            const saveSuccess = pluginSaveSuccess.has(provider.id);
            const params = provider.parameters;
            const setCount = params.filter((p: PluginParamDef) => p.isSet).length;

            if (params.length === 0) return null;

            return (
              <div
                key={provider.id}
                className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]"
              >
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="font-bold text-sm">{provider.name} Settings</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      Configure API keys and parameters for {provider.name}.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] px-2 py-[3px] border"
                      style={{
                        borderColor: provider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                        color: provider.configured ? "#2d8a4e" : "var(--warning,#f39c12)",
                      }}
                    >
                      {provider.configured ? "Configured" : "Needs Setup"}
                    </span>
                  </div>
                </div>

                {params.map((param: PluginParamDef) => (
                  <PluginField
                    key={param.key}
                    plugin={provider}
                    param={param}
                    onChange={(key, value) =>
                      handlePluginFieldChange(provider.id, key, value)
                    }
                  />
                ))}

                <div className="flex items-center gap-3 mt-3">
                  <button
                    className={`btn text-xs py-[5px] px-4 !mt-0 ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                    onClick={() => handlePluginSave(provider.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
                  </button>
                  <span className="flex-1" />
                  <span className="text-[11px] text-[var(--muted)]">
                    {setCount}/{params.length} configured
                  </span>
                  <a
                    href="#"
                    className="text-[11px] text-[var(--muted)] ml-3 underline"
                    onClick={(e) => {
                      e.preventDefault();
                      setTab("plugins");
                    }}
                  >
                    All plugins
                  </a>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          5. WALLET PROVIDERS & API KEYS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-bold text-sm">Wallet Providers &amp; API Keys</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Configure API keys for blockchain data providers (balance and NFT fetching).
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* Alchemy */}
          <div className="flex flex-col gap-0.5 text-xs">
            <div className="flex items-center gap-1.5">
              <code className="text-[11px] font-semibold">ALCHEMY_API_KEY</code>
              {walletConfig?.alchemyKeySet ? (
                <span className="text-[10px] text-[var(--ok)]">set</span>
              ) : (
                <span className="text-[10px] text-[var(--muted)]">not set</span>
              )}
            </div>
            <div className="text-[var(--muted)] text-[11px]">
              EVM chain data —{" "}
              <a
                href="https://dashboard.alchemy.com/"
                target="_blank"
                rel="noopener"
                className="text-[var(--accent)]"
              >
                Get key
              </a>
            </div>
            <input
              type="password"
              data-wallet-config="ALCHEMY_API_KEY"
              placeholder={
                walletConfig?.alchemyKeySet
                  ? "Already set — leave blank to keep"
                  : "Enter Alchemy API key"
              }
              className="py-1 px-2 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] w-full box-border focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {/* Helius */}
          <div className="flex flex-col gap-0.5 text-xs">
            <div className="flex items-center gap-1.5">
              <code className="text-[11px] font-semibold">HELIUS_API_KEY</code>
              {walletConfig?.heliusKeySet ? (
                <span className="text-[10px] text-[var(--ok)]">set</span>
              ) : (
                <span className="text-[10px] text-[var(--muted)]">not set</span>
              )}
            </div>
            <div className="text-[var(--muted)] text-[11px]">
              Solana chain data —{" "}
              <a
                href="https://dev.helius.xyz/"
                target="_blank"
                rel="noopener"
                className="text-[var(--accent)]"
              >
                Get key
              </a>
            </div>
            <input
              type="password"
              data-wallet-config="HELIUS_API_KEY"
              placeholder={
                walletConfig?.heliusKeySet
                  ? "Already set — leave blank to keep"
                  : "Enter Helius API key"
              }
              className="py-1 px-2 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] w-full box-border focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {/* Birdeye */}
          <div className="flex flex-col gap-0.5 text-xs">
            <div className="flex items-center gap-1.5">
              <code className="text-[11px] font-semibold">BIRDEYE_API_KEY</code>
              <span className="text-[10px] text-[var(--muted)]">optional</span>
              {walletConfig?.birdeyeKeySet && (
                <span className="text-[10px] text-[var(--ok)]">set</span>
              )}
            </div>
            <div className="text-[var(--muted)] text-[11px]">
              Solana price data —{" "}
              <a
                href="https://birdeye.so/"
                target="_blank"
                rel="noopener"
                className="text-[var(--accent)]"
              >
                Get key
              </a>
            </div>
            <input
              type="password"
              data-wallet-config="BIRDEYE_API_KEY"
              placeholder={
                walletConfig?.birdeyeKeySet
                  ? "Already set — leave blank to keep"
                  : "Enter Birdeye API key (optional)"
              }
              className="py-1 px-2 border border-[var(--border)] bg-[var(--card)] text-xs font-[var(--mono)] w-full box-border focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            className="btn text-[11px] py-1 px-3.5 !mt-0"
            onClick={handleWalletSaveAll}
            disabled={walletApiKeySaving}
          >
            {walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          6. SOFTWARE UPDATES
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
          7. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-bold text-sm">Chrome Extension</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Connect the Milaidy Browser Relay extension so the agent can automate Chrome tabs.
            </div>
          </div>
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
          8. AGENT EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-bold text-sm">Agent Export / Import</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Migrate your agent to another machine. Exports are password-encrypted.
            </div>
          </div>
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
            Your character, memories, chats, secrets, and relationships will be encrypted and
            downloaded as a single file.
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-xs">Encryption Password</label>
            <input
              type="password"
              placeholder="Min 4 characters"
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
              disabled={exportBusy || exportPassword.length < 4}
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
            Select an <code className="text-[11px]">.eliza-agent</code> export file and enter the
            password used during export.
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
            <label className="font-semibold text-xs">Decryption Password</label>
            <input
              type="password"
              placeholder="Enter password"
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
              disabled={importBusy || !importFile || importPassword.length < 4}
              onClick={() => void handleAgentImport()}
            >
              {importBusy ? "Importing..." : "Import Agent"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════
          9. DANGER ZONE
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
