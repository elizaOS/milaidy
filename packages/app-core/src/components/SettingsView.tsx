/**
 * Settings view — two-panel layout with section navigator and active section.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@milady/ui";
import {
  AlertTriangle,
  Bot,
  Cloud,
  Download,
  Image,
  Loader2,
  Mic,
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
import { useApp } from "../state";
import { CodingAgentSettingsSection } from "./CodingAgentSettingsSection";
import { ConfigPageView } from "./ConfigPageView";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { CloudDashboard } from "./ElizaCloudDashboard";
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
    id: "ai-model",
    label: "settings.sections.aimodel.label",
    icon: Bot,
    description: "settings.sections.aimodel.desc",
  },
  {
    id: "cloud",
    label: "elizaclouddashboard.ElizaCloud",
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
    label: "nav.advanced",
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
  sections,
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
}: {
  sections: SettingsSectionDef[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const { t } = useApp();
  return (
    <div className="two-panel-left">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
        <Input
          type="text"
          placeholder={t("settings.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-full rounded-lg border-border/60 bg-bg/50 pl-8 pr-3 text-xs"
        />
      </div>
      <nav className="flex flex-col gap-1.5">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={`two-panel-item flex items-center gap-2.5 w-full text-left ${isActive ? "is-selected" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium truncate">{t(section.label)}</span>
            </button>
          );
        })}
      </nav>
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
        <Button
          variant="default"
          size="sm"
          className="rounded-xl shadow-sm whitespace-normal text-left"
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
            {updateStatus.currentVersion} {t("ui-renderer.Rarr")}{" "}
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
            className="settings-card-button flex items-center gap-4 border border-border/50 bg-card/60 text-left backdrop-blur-md transition-all group hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)]"
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
            className="settings-card-button flex items-center gap-4 border border-border/50 bg-card/60 text-left backdrop-blur-md transition-all group hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)]"
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
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl shadow-sm whitespace-normal text-left"
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
                className="settings-button rounded-lg"
                onClick={closeExportModal}
              >
                {t("onboarding.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="settings-button rounded-lg"
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
                className="settings-button flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg text-left transition-colors hover:bg-bg-hover"
                onClick={() => importFileInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-txt">
                  {importFile?.name ?? t("settingsview.ChooseAnExportedBack")}
                </span>
                <span className="shrink-0 text-xs font-medium text-txt">
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
                className="settings-button rounded-lg"
                onClick={closeImportModal}
              >
                {t("onboarding.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="settings-button rounded-lg"
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

/* ── Active Section Renderer ─────────────────────────────────────────── */

function renderActiveSection(sectionId: string) {
  switch (sectionId) {
    case "ai-model": return <ProviderSwitcher />;
    case "cloud": return <CloudDashboard />;
    case "coding-agents": return <CodingAgentSettingsSection />;
    case "wallet-rpc": return <ConfigPageView embedded />;
    case "media": return <MediaSettingsSection />;
    case "voice": return <VoiceConfigView />;
    case "permissions": return <PermissionsSection />;
    case "updates": return <UpdatesSection />;
    case "advanced": return <AdvancedSection />;
    default: return null;
  }
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView({
  inModal,
  onClose,
  initialSection,
}: {
  inModal?: boolean;
  onClose?: () => void;
  initialSection?: string;
} = {}) {
  const { t, loadPlugins, setTab } = useApp();
  const [activeSection, setActiveSection] = useState(
    initialSection ?? "ai-model",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const visibleSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((section) =>
        matchesSettingsSection(section, searchQuery, t),
      ),
    [searchQuery, t],
  );

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // If current active section gets filtered out, switch to first visible
  useEffect(() => {
    if (visibleSections.length === 0) return;
    const visibleIds = new Set(visibleSections.map((s) => s.id));
    if (!visibleIds.has(activeSection)) {
      setActiveSection(visibleSections[0].id);
    }
  }, [activeSection, visibleSections]);

  // Navigate to initial section when provided
  useEffect(() => {
    if (!initialSection) return;
    setActiveSection(initialSection);
  }, [initialSection]);

  const activeSectionDef = SETTINGS_SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className={`two-panel-layout w-full ${inModal ? "p-4 sm:p-6" : ""}`}>
      <SettingsSidebar
        sections={visibleSections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <div className="two-panel-right">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-txt-strong">{t(activeSectionDef?.label ?? "")}</h2>
            {activeSectionDef?.description && (
              <p className="text-xs text-muted mt-0.5">{t(activeSectionDef.description)}</p>
            )}
          </div>
          {inModal && onClose && (
            <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-txt" onClick={onClose} aria-label="Close settings">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {renderActiveSection(activeSection)}
        {visibleSections.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">
            {t("settingsview.NoMatchingSettings")}
            <button type="button" className="ml-2 text-txt hover:underline" onClick={() => setSearchQuery("")}>
              {t("settingsview.ClearSearch")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
