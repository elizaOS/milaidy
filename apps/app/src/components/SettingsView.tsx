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

import { LANGUAGES } from "@milady/app-core/components";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  SectionCard,
} from "@milady/ui";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Cloud,
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
import { CloudDashboard } from "./MiladyCloudDashboard";
import { PermissionsSection } from "./PermissionsSection";
import { ProviderSwitcher } from "./ProviderSwitcher";
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
    label: "settings.sections.appearance.label",
    icon: Palette,
    description: "settings.sections.appearance.desc",
  },
  {
    id: "ai-model",
    label: "settings.sections.aimodel.label",
    icon: Bot,
    description: "settings.sections.aimodel.desc",
  },
  {
    id: "cloud",
    label: "settings.sections.cloud.label",
    icon: Cloud,
    description: "settings.sections.cloud.desc",
  },
  {
    id: "coding-agents",
    label: "settings.sections.codingagents.label",
    icon: Terminal,
    description: "settings.sections.codingagents.desc",
  },
  {
    id: "wallet-rpc",
    label: "settings.sections.walletrpc.label",
    icon: Wallet,
    description: "settings.sections.walletrpc.desc",
  },
  {
    id: "media",
    label: "settings.sections.media.label",
    icon: Image,
    description: "settings.sections.media.desc",
  },
  {
    id: "voice",
    label: "settings.sections.voice.label",
    icon: Mic,
    description: "settings.sections.voice.desc",
  },
  {
    id: "permissions",
    label: "settings.sections.permissions.label",
    icon: Shield,
    description: "settings.sections.permissions.desc",
  },
  {
    id: "updates",
    label: "settings.sections.updates.label",
    icon: RefreshCw,
    description: "settings.sections.updates.desc",
  },
  {
    id: "advanced",
    label: "settings.sections.advanced.label",
    icon: Sliders,
    description: "settings.sections.advanced.desc",
  },
];

function matchesSettingsSection(
  section: SettingsSectionDef,
  query: string,
  t: (key: string) => string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    t(section.label).toLowerCase().includes(normalized) ||
    (section.description
      ? t(section.description).toLowerCase().includes(normalized)
      : false)
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
    matchesSettingsSection(section, searchQuery, t),
  );

  return (
    <div className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border/50 bg-bg/50 backdrop-blur-xl">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center">
            <Sliders className="w-5 h-5 text-txt" />
          </div>
          <div className="min-h-10 flex flex-col justify-center">
            <h2 className="font-bold text-lg text-txt-strong leading-tight">
              {t("nav.settings")}
            </h2>
            <p className="text-xs text-muted hidden lg:block leading-tight mt-0.5">
              {t("settings.customizeExperience")}
            </p>
          </div>
        </div>

        {/* Search - Desktop */}
        <div className="relative mb-4 hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            type="text"
            placeholder={t("settings.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 rounded-xl bg-bg/50 border-border/50 h-10 text-sm shadow-inner"
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
                className={`flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all duration-300 min-w-fit lg:min-w-0 whitespace-normal break-words h-auto group ${
                  isActive
                    ? "bg-accent text-accent-fg shadow-[0_0_15px_rgba(var(--accent),0.2)] scale-[1.01]"
                    : "text-txt hover:bg-bg-hover hover:border-border/50 border border-transparent"
                }`}
              >
                <span className="w-9 h-9 flex items-center justify-center shrink-0 rounded-lg">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold`}>
                    {t(section.label)}
                  </div>
                  {section.description && (
                    <div className="text-[11px] opacity-80 hidden lg:block mt-0.5 truncate">
                      {t(section.description)}
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
      <div className="flex items-center justify-between p-5 border border-border/50 rounded-2xl shadow-sm">
        <div>
          <div className="font-medium text-sm text-white">
            {t("settings.versionPrefix")}
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {updateStatus?.currentVersion || `${t("common.loading")}...`}
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          className="rounded-xl shadow-sm h-auto whitespace-normal break-words text-left"
          onClick={() => void loadUpdateStatus(true)}
          disabled={updateLoading}
        >
          {updateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {updateLoading ? t("settings.checking") : t("settings.checkNow")}
        </Button>
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
            className="flex items-center gap-4 p-5 border border-border/50 rounded-2xl hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] transition-all text-left group hover:-translate-y-0.5 cursor-pointer h-auto min-h-[5rem] whitespace-normal break-words"
            aria-haspopup="dialog"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-all">
              <Download className="w-5 h-5 text-txt group-hover:text-accent transition-colors" />
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
            className="flex items-center gap-4 p-5 border border-border/50 rounded-2xl hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] transition-all text-left group hover:-translate-y-0.5 cursor-pointer h-auto min-h-[5rem] whitespace-normal break-words"
            aria-haspopup="dialog"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-all">
              <Upload className="w-5 h-5 text-txt group-hover:text-accent transition-colors" />
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
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl shadow-sm h-auto whitespace-normal break-words text-left"
                onClick={() => {
                  void handleReset();
                }}
              >
                {t("settings.resetEverything")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={exportModalOpen}
        onOpenChange={(open) => {
          if (!open) closeExportModal();
        }}
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
              <Input
                id="settings-export-password"
                type="password"
                value={exportPassword}
                onChange={(e) => setState("exportPassword", e.target.value)}
                placeholder={t("settingsview.EnterExportPasswor")}
                className="rounded-lg bg-bg"
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
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={closeExportModal}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="rounded-lg"
                disabled={exportBusy}
                onClick={() => void handleAgentExport()}
              >
                {exportBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("settings.export")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importModalOpen}
        onOpenChange={(open) => {
          if (!open) closeImportModal();
        }}
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
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-3 text-left transition-colors hover:bg-bg-hover h-auto min-h-[3rem] whitespace-normal break-words"
                onClick={() => importFileInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-txt">
                  {importFile?.name ?? t("settingsview.ChooseAnExportedBack")}
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">
                  {importFile
                    ? t("settings.change", { defaultValue: "Change" })
                    : t("settings.browse", { defaultValue: "Browse" })}
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
              <Input
                id="settings-import-password"
                type="password"
                value={importPassword}
                onChange={(e) => setState("importPassword", e.target.value)}
                placeholder={t("settingsview.EnterImportPasswor")}
                className="rounded-lg bg-bg"
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
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={closeImportModal}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="rounded-lg"
                disabled={importBusy}
                onClick={() => void handleAgentImport()}
              >
                {importBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("settings.import")}
              </Button>
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
    // Milady Cloud
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsLow,
    miladyCloudCreditsCritical,
    miladyCloudTopUpUrl,
    miladyCloudUserId,
    miladyCloudLoginBusy,
    miladyCloudLoginError,
    miladyCloudDisconnecting,
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
        matchesSettingsSection(section, searchQuery, t),
      ),
    [searchQuery, t],
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
            <div className="text-xs font-semibold text-white mb-2">
              {t("settings.language")}
            </div>
            <div className="flex flex-wrap gap-1.5 border border-border rounded-lg p-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 h-auto whitespace-normal break-words text-left text-xs rounded-md font-medium transition-colors duration-200 ${
                    uiLanguage === lang.id
                      ? "bg-accent text-accent-fg shadow-sm"
                      : "text-txt hover:bg-bg-hover"
                  }`}
                  onClick={() => {
                    setUiLanguage(lang.id);
                    setActionNotice(
                      t("settings.languageSaved"),
                      "success",
                      2200,
                    );
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
            miladyCloudEnabled={miladyCloudEnabled}
            miladyCloudConnected={miladyCloudConnected}
            miladyCloudCredits={miladyCloudCredits}
            miladyCloudCreditsLow={miladyCloudCreditsLow}
            miladyCloudCreditsCritical={miladyCloudCreditsCritical}
            miladyCloudTopUpUrl={miladyCloudTopUpUrl}
            miladyCloudUserId={miladyCloudUserId}
            miladyCloudLoginBusy={miladyCloudLoginBusy}
            miladyCloudLoginError={miladyCloudLoginError}
            miladyCloudDisconnecting={miladyCloudDisconnecting}
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

      {visibleSectionIds.has("cloud") && (
        <section
          id="cloud"
          className="bg-bg rounded-2xl border border-border/50 overflow-hidden relative"
        >
          <CloudDashboard />
        </section>
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
          <div className="settings-page-header flex items-start justify-between gap-4 border-b border-border/70 pb-4 sm:pb-6">
            <div className="min-w-0">
              <h1 className="text-balance text-xl font-bold text-white sm:text-2xl">
                {t("nav.settings")}
              </h1>
              <p className="mt-1 max-w-2xl text-pretty text-sm text-white/85">
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

          <div className="settings-sections space-y-6 pb-20 pt-6 sm:space-y-8">
            {sectionsContent}
          </div>
        </div>
      </div>
    </div>
  );
}
