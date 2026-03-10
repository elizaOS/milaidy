/**
 * Settings view — reorganized with sidebar navigation for better UX.
 *
 * Categories:
 *   1. Appearance — theme picker
 *   2. AI Model — provider selection + config
 *   3. Integrations — GitHub, Coding Agents, Secrets
 *   4. Media — image, video, audio, vision providers
 *   5. Voice — TTS / STT configuration
 *   6. Permissions — capabilities
 *   7. Updates — software updates
 *   8. Advanced — export/import, extension, danger zone
 */

import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Download,
  Image,
  Loader2,
  Mic,
  Palette,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  Terminal,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { CodingAgentSettingsSection } from "./CodingAgentSettingsSection";
import { ConfigPageView } from "./ConfigPageView";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { PermissionsSection } from "./PermissionsSection";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { LANGUAGES } from "./shared/LanguageDropdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SectionCard,
} from "@milady/ui";
import { VoiceConfigView } from "./VoiceConfigView";

interface SettingsSectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "Visual preferences",
  },
  {
    id: "ai-model",
    label: "AI Model",
    icon: Bot,
    description: "Provider and model settings",
  },
  {
    id: "coding-agents",
    label: "Coding Agents",
    icon: Terminal,
    description: "Agent preferences, models, and permissions",
  },
  {
    id: "wallet-rpc",
    label: "Wallet & RPC",
    icon: Wallet,
    description: "Chain RPC providers and API keys",
  },
  {
    id: "media",
    label: "Media",
    icon: Image,
    description: "Image, video, and vision providers",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    description: "Text-to-speech and transcription",
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: Shield,
    description: "Capabilities and access control",
  },
  {
    id: "updates",
    label: "Updates",
    icon: RefreshCw,
    description: "Software update settings",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: Sliders,
    description: "Export, import, and dangerous actions",
  },
];

function matchesSettingsSection(
  section: SettingsSectionDef,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    section.label.toLowerCase().includes(normalized) ||
    section.description?.toLowerCase().includes(normalized) === true
  );
}

/* ── Settings Sidebar ────────────────────────────────────────────────── */

function SettingsSidebar({
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
}: {
  activeSection: string;
  onSectionChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const { t } = useApp();

  const filteredSections = SETTINGS_SECTIONS.filter((section) =>
    matchesSettingsSection(section, searchQuery),
  );

  return (
    <div className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border/50 bg-bg/50 backdrop-blur-xl">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent),0.3)]">
            <Sliders className="w-5 h-5 text-accent-fg" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-txt-strong">
              {t("nav.settings")}
            </h2>
            <p className="text-xs text-muted hidden lg:block">
              {t("settings.customizeExperience")}
            </p>
          </div>
        </div>

        {/* Search - Desktop */}
        <div className="relative mb-4 hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder={t("settings.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-border/50 bg-bg/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent placeholder:text-muted transition-all shadow-inner"
          />
        </div>

        {/* Navigation */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible scrollbar-hide">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSectionChange(section.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all duration-300 min-w-fit lg:min-w-0 whitespace-nowrap lg:whitespace-normal group ${isActive
                  ? "bg-accent text-accent-fg shadow-[0_0_15px_rgba(var(--accent),0.2)] scale-[1.01]"
                  : "text-txt hover:bg-bg-hover hover:border-border/50 border border-transparent"
                  }`}
              >
                <span
                  className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-lg ${isActive ? "bg-accent-foreground/20" : "bg-bg-accent"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold`}>{section.label}</div>
                  {section.description && (
                    <div className="text-[11px] opacity-80 hidden lg:block mt-0.5 truncate">
                      {section.description}
                    </div>
                  )}
                </div>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 lg:hidden ${isActive ? "" : "opacity-50"}`}
                />
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ── Updates Section ─────────────────────────────────────────────────── */

function UpdatesSection() {
  const { t } = useApp();
  const { updateStatus, updateLoading, loadUpdateStatus } = useApp();

  useEffect(() => {
    void loadUpdateStatus();
  }, [loadUpdateStatus]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-5 bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl shadow-sm">
        <div>
          <div className="font-medium text-sm">
            {t("settings.versionPrefix")}
          </div>
          <div className="text-2xl font-bold text-txt-strong mt-1">
            {updateStatus?.currentVersion || `${t("common.loading")}...`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadUpdateStatus(true)}
          disabled={updateLoading}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-fg rounded-xl font-medium text-sm hover:shadow-[0_0_15px_rgba(var(--accent),0.4)] transition-all cursor-pointer disabled:opacity-50 disabled:shadow-none"
        >
          {updateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {updateLoading ? t("settings.checking") : t("settings.checkNow")}
        </button>
      </div>

      {updateStatus?.updateAvailable && (
        <div className="p-4 bg-ok/10 border border-ok/30 rounded-2xl">
          <div className="font-bold text-ok mb-1">
            {t("settings.updateAvailable")}
          </div>
          <p className="text-sm text-txt-strong">
            {updateStatus.currentVersion} {t("settingsview.Rarr")}{" "}
            {updateStatus.latestVersion}
          </p>
        </div>
      )}

      {updateStatus?.lastCheckAt && (
        <div className="text-[11px] text-muted">
          {t("settings.lastChecked")}{" "}
          {new Date(updateStatus.lastCheckAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

/* ── Advanced Section ─────────────────────────────────────────────────── */

function AdvancedSection() {
  const { t } = useApp();
  const {
    handleReset,
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
    handleAgentExport,
    handleAgentImport,
    setState,
  } = useApp();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const resetExportState = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
  }, [setState]);

  const resetImportState = useCallback(() => {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
  }, [setState]);

  const openExportModal = useCallback(() => {
    resetExportState();
    setExportModalOpen(true);
  }, [resetExportState]);

  const closeExportModal = useCallback(() => {
    setExportModalOpen(false);
    resetExportState();
  }, [resetExportState]);

  const openImportModal = useCallback(() => {
    resetImportState();
    setImportModalOpen(true);
  }, [resetImportState]);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    resetImportState();
  }, [resetImportState]);

  return (
    <>
      <div className="space-y-6">
        {/* Export/Import */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={openExportModal}
            className="flex items-center gap-4 p-5 border border-border/50 bg-card/60 backdrop-blur-md rounded-2xl hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] transition-all text-left group hover:-translate-y-0.5 cursor-pointer"
            aria-haspopup="dialog"
          >
            <div className="w-12 h-12 rounded-xl bg-bg-accent border border-border/50 flex items-center justify-center group-hover:bg-accent group-hover:border-accent transition-all shadow-sm">
              <Download className="w-5 h-5 text-txt group-hover:text-accent-fg transition-colors" />
            </div>
            <div>
              <div className="font-medium text-sm">
                {t("settings.exportAgent")}
              </div>
              <div className="text-xs text-muted">
                {t("settings.exportAgentShort")}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={openImportModal}
            className="flex items-center gap-4 p-5 border border-border/50 bg-card/60 backdrop-blur-md rounded-2xl hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] transition-all text-left group hover:-translate-y-0.5 cursor-pointer"
            aria-haspopup="dialog"
          >
            <div className="w-12 h-12 rounded-xl bg-bg-accent border border-border/50 flex items-center justify-center group-hover:bg-accent group-hover:border-accent transition-all shadow-sm">
              <Upload className="w-5 h-5 text-txt group-hover:text-accent-fg transition-colors" />
            </div>
            <div>
              <div className="font-medium text-sm">
                {t("settings.importAgent")}
              </div>
              <div className="text-xs text-muted">
                {t("settings.importAgentShort")}
              </div>
            </div>
          </button>
        </div>

        {/* Danger Zone */}
        <div className="border border-danger/30 rounded-2xl overflow-hidden bg-bg/40 backdrop-blur-sm">
          <div className="bg-danger/10 px-5 py-3 border-b border-danger/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="font-bold text-sm text-danger tracking-wide uppercase">
              {t("settings.dangerZone")}
            </span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">
                  {t("settings.resetAgent")}
                </div>
                <div className="text-xs text-muted">
                  {t("settings.resetAgentHint")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const confirmed = window.confirm(
                    t("settings.resetConfirmMessage"),
                  );
                  if (confirmed) void handleReset();
                }}
                className="px-4 py-2 border border-danger/50 bg-danger/5 text-danger rounded-xl text-sm font-bold hover:bg-danger hover:text-danger-fg transition-all cursor-pointer shadow-sm"
              >
                {t("settings.resetEverything")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={exportModalOpen}
        onOpenChange={(open) => { if (!open) closeExportModal(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.exportAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="settings-export-password"
                className="text-sm font-medium text-txt-strong"
              >
                {t("settingsview.Password")}
              </label>
              <input
                id="settings-export-password"
                type="password"
                value={exportPassword}
                onChange={(e) => setState("exportPassword", e.target.value)}
                placeholder={t("settingsview.EnterExportPasswor")}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={exportIncludeLogs}
                  onChange={(e) =>
                    setState("exportIncludeLogs", e.target.checked)
                  }
                />

                {t("settingsview.IncludeRecentLogs")}
              </label>
            </div>

            {exportError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {exportError}
              </div>
            )}
            {exportSuccess && (
              <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
                {exportSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-txt transition-colors hover:bg-bg-hover"
                onClick={closeExportModal}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={exportBusy}
                onClick={() => void handleAgentExport()}
              >
                {exportBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("settings.export")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importModalOpen}
        onOpenChange={(open) => { if (!open) closeImportModal(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.importAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              ref={importFileInputRef}
              type="file"
              className="hidden"
              accept=".eliza-agent,.agent,application/octet-stream"
              onChange={(e) =>
                setState("importFile", e.target.files?.[0] ?? null)
              }
            />

            <div className="space-y-2">
              <div className="text-sm font-medium text-txt-strong">
                {t("settingsview.BackupFile")}
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-3 text-left transition-colors hover:bg-bg-hover"
                onClick={() => importFileInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-txt">
                  {importFile?.name ?? "Choose an exported backup file"}
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">
                  {importFile ? "Change" : "Browse"}
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="settings-import-password"
                className="text-sm font-medium text-txt-strong"
              >
                {t("settingsview.Password")}
              </label>
              <input
                id="settings-import-password"
                type="password"
                value={importPassword}
                onChange={(e) => setState("importPassword", e.target.value)}
                placeholder={t("settingsview.EnterImportPasswor")}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>

            {importError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {importError}
              </div>
            )}
            {importSuccess && (
              <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
                {importSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-txt transition-colors hover:bg-bg-hover"
                onClick={closeImportModal}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={importBusy}
                onClick={() => void handleAgentImport()}
              >
                {importBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("settings.import")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView({
  inModal,
  onClose,
}: {
  inModal?: boolean;
  onClose?: () => void;
} = {}) {
  const { t } = useApp();
  const [activeSection, setActiveSection] = useState("appearance");
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

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
    uiLanguage,
    // Actions
    loadPlugins,
    handlePluginToggle,
    setUiLanguage,
    setTab,
    loadUpdateStatus: _loadUpdateStatus,
    handlePluginConfigSave,
    handleCloudLogin,
    handleCloudDisconnect,
    setState,
    setActionNotice,
  } = useApp();
  const handleClose = useCallback(
    () => onClose?.() ?? setTab(inModal ? "companion" : "chat"),
    [inModal, onClose, setTab],
  );
  const visibleSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((section) =>
        matchesSettingsSection(section, searchQuery),
      ),
    [searchQuery],
  );
  const visibleSectionIds = useMemo(
    () => new Set(visibleSections.map((section) => section.id)),
    [visibleSections],
  );

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    if (visibleSections.length === 0) return;
    if (!visibleSectionIds.has(activeSection)) {
      setActiveSection(visibleSections[0].id);
    }
  }, [activeSection, visibleSectionIds, visibleSections]);

  // Scroll to section when changed
  const handleSectionChange = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    if (contentRef.current) {
      const element = contentRef.current.querySelector(`#${sectionId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  // Update active section based on scroll position
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const handleScroll = () => {
      const sections = visibleSections
        .map((s) => {
          const el = root.querySelector(`#${s.id}`) as HTMLElement;
          return { id: s.id, el };
        })
        .filter((s) => s.el !== null);

      if (sections.length === 0) return;

      // If user scrolled to the very bottom, highlight the last section
      if (
        root.scrollHeight - Math.ceil(root.scrollTop) <=
        root.clientHeight + 10
      ) {
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      const rootRect = root.getBoundingClientRect();
      let currentSection = sections[0].id;

      for (const { id, el } of sections) {
        const elRect = el.getBoundingClientRect();
        // If the section's top is visible or scrolled past (allowing a 150px offset)
        if (elRect.top - rootRect.top <= 150) {
          currentSection = id;
        }
      }

      setActiveSection((prev) =>
        prev !== currentSection ? currentSection : prev,
      );
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => root.removeEventListener("scroll", handleScroll);
  }, [visibleSections]);

  /* ── Sections content (shared between both layouts) ────────────────── */
  const sectionsContent = (
    <>
      {visibleSectionIds.has("appearance") && (
        <SectionCard
          id="appearance"
          title={t("settings.appearance")}
          description={t("settings.languageHint")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <div className="mb-5">
            <div className="text-xs font-semibold text-txt-strong mb-2">
              {t("settings.language")}
            </div>
            <div className="flex flex-wrap gap-1.5 border border-border rounded-lg p-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors duration-200 ${uiLanguage === lang.id
                    ? "bg-accent text-accent-fg shadow-sm"
                    : "text-txt hover:bg-bg-hover"
                    }`}
                  onClick={() => {
                    setUiLanguage(lang.id);
                    setActionNotice(t("settings.languageSaved"), "success", 2200);
                  }}
                >
                  <span className="text-sm">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {visibleSectionIds.has("ai-model") && (
        <SectionCard
          id="ai-model"
          title={t("settings.aiModel")}
          description={t("settings.aiModelDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <ProviderSwitcher
            cloudEnabled={cloudEnabled}
            cloudConnected={cloudConnected}
            cloudCredits={cloudCredits}
            cloudCreditsLow={cloudCreditsLow}
            cloudCreditsCritical={cloudCreditsCritical}
            cloudTopUpUrl={cloudTopUpUrl}
            cloudUserId={cloudUserId}
            cloudLoginBusy={cloudLoginBusy}
            cloudLoginError={cloudLoginError}
            cloudDisconnecting={cloudDisconnecting}
            plugins={plugins}
            pluginSaving={pluginSaving}
            pluginSaveSuccess={pluginSaveSuccess}
            loadPlugins={loadPlugins}
            handlePluginToggle={handlePluginToggle}
            handlePluginConfigSave={handlePluginConfigSave}
            handleCloudLogin={handleCloudLogin}
            handleCloudDisconnect={handleCloudDisconnect}
            setState={setState}
            setTab={setTab}
          />
        </SectionCard>
      )}

      {visibleSectionIds.has("coding-agents") && (
        <SectionCard
          id="coding-agents"
          title={t("settingsview.CodingAgents")}
          description="Configure AI coding agents for multi-agent task execution."
          className="p-4 sm:p-5 lg:p-6"
        >
          <CodingAgentSettingsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("wallet-rpc") && (
        <SectionCard
          id="wallet-rpc"
          title={t("settingsview.WalletRPC")}
          description="Configure chain RPC providers for trading and market data."
          className="p-4 sm:p-5 lg:p-6"
        >
          <ConfigPageView embedded />
        </SectionCard>
      )}

      {visibleSectionIds.has("media") && (
        <SectionCard
          id="media"
          title={t("settings.mediaGeneration")}
          description={t("settings.mediaDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <MediaSettingsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("voice") && (
        <SectionCard
          id="voice"
          title={t("settings.speechInterface")}
          description={t("settings.speechDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <VoiceConfigView />
        </SectionCard>
      )}

      {visibleSectionIds.has("permissions") && (
        <SectionCard
          id="permissions"
          title={t("settings.permissionsCapabilities")}
          description={t("settings.permissionsDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <PermissionsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("updates") && (
        <SectionCard
          id="updates"
          title={t("settings.softwareUpdates")}
          description={t("settings.updatesDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <UpdatesSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("advanced") && (
        <SectionCard
          id="advanced"
          title={t("settings.advancedSettings")}
          description={t("settings.advancedDescription")}
          className="p-4 sm:p-5 lg:p-6"
        >
          <AdvancedSection />
        </SectionCard>
      )}

      {visibleSections.length === 0 && (
        <SectionCard
          id="settings-empty"
          title={t("settingsview.NoMatchingSettings")}
          description="Try a broader search or clear the current filter."
          className="p-4 sm:p-5 lg:p-6"
        >
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-txt transition-colors hover:bg-bg-hover"
            onClick={() => setSearchQuery("")}
          >
            {t("settingsview.ClearSearch")}
          </button>
        </SectionCard>
      )}
    </>
  );
  return (
    <div
      className={`h-full min-h-0 flex flex-col lg:flex-row overflow-hidden ${inModal ? "bg-transparent" : "bg-bg"}`}
    >
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div
        ref={contentRef}
        className={`flex-1 min-h-0 overflow-y-auto scroll-smooth ${inModal ? "px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6" : "px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"}`}
      >
        <div className={`${inModal ? "max-w-5xl" : "max-w-4xl"} mx-auto`}>
          <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4 sm:pb-6">
            <div className="min-w-0">
              <h1 className="text-balance text-xl font-bold text-txt-strong sm:text-2xl">
                {t("nav.settings")}
              </h1>
              <p className="mt-1 max-w-2xl text-pretty text-sm text-muted">
                {t("settings.customizeExperience")}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted transition-all hover:border-accent hover:text-txt hover:shadow-sm"
              onClick={handleClose}
              aria-label="Close settings"
              title={t("settingsview.CloseSettings")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mt-4 lg:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder={t("settings.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg py-2.5 pl-10 pr-3 text-sm transition-all placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          <div className="space-y-6 pb-20 pt-6 sm:space-y-8">
            {sectionsContent}
          </div>
        </div>
      </div>
    </div>
  );
}
