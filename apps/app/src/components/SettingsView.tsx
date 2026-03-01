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
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { THEMES, useApp } from "../AppContext";
import { MediaSettingsSection } from "./MediaSettingsSection";
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
    label: "Appearance",
    icon: Palette,
    description: "Themes and visual preferences",
  },
  {
    id: "ai-model",
    label: "AI Model",
    icon: Bot,
    description: "Provider and model settings",
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

/* ── Modal shell ─────────────────────────────────────────────────────── */

export function Modal({
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md border border-border bg-card p-5 shadow-2xl rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{title}</div>
          <button
            type="button"
            className="text-muted hover:text-txt text-lg leading-none px-2 py-1 rounded-md hover:bg-bg-hover transition-colors"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Section Card Component ──────────────────────────────────────────── */

function SectionCard({
  id,
  title,
  description,
  children,
  className = "",
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`p-5 border border-border bg-card rounded-xl shadow-sm transition-all duration-200 ${className}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-1 h-6 bg-accent rounded-full" />
        <h3 className="font-bold text-base text-txt-strong">{title}</h3>
      </div>
      {description && <p className="text-sm text-muted mb-4">{description}</p>}
      {children}
    </section>
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
  const filteredSections = SETTINGS_SECTIONS.filter(
    (section) =>
      section.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-bg-accent/30">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-sm">
            <Sliders className="w-5 h-5 text-accent-fg" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-txt-strong">Settings</h2>
            <p className="text-xs text-muted hidden lg:block">
              Customize your experience
            </p>
          </div>
        </div>

        {/* Search - Desktop */}
        <div className="relative mb-4 hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-border bg-bg rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-muted transition-all"
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
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 min-w-fit lg:min-w-0 whitespace-nowrap lg:whitespace-normal ${
                  isActive
                    ? "bg-accent text-accent-fg shadow-md"
                    : "text-txt hover:bg-bg-hover hover:shadow-sm"
                }`}
              >
                <span
                  className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-lg ${
                    isActive ? "bg-accent-foreground/20" : "bg-bg-accent"
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
  const { updateStatus, updateLoading, loadUpdateStatus } = useApp();

  useEffect(() => {
    void loadUpdateStatus();
  }, [loadUpdateStatus]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-bg-accent rounded-lg">
        <div>
          <div className="font-medium text-sm">Current Version</div>
          <div className="text-2xl font-bold text-txt-strong mt-1">
            {updateStatus?.currentVersion || "Loading..."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadUpdateStatus(true)}
          disabled={updateLoading}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-fg rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {updateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Check for Updates
        </button>
      </div>

      {updateStatus?.updateAvailable && (
        <div className="p-4 bg-ok/10 border border-ok/30 rounded-lg">
          <div className="font-medium text-ok mb-1">Update Available!</div>
          <p className="text-sm text-muted">
            Version {updateStatus.latestVersion} is ready to install.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Advanced Section ─────────────────────────────────────────────────── */

function AdvancedSection() {
  const { handleReset } = useApp();

  return (
    <div className="space-y-6">
      {/* Export/Import */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          className="flex items-center gap-3 p-4 border border-border bg-bg rounded-lg hover:border-accent hover:bg-accent-subtle/50 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-accent-subtle flex items-center justify-center group-hover:bg-accent group-hover:text-accent-fg transition-colors">
            <Download className="w-5 h-5 text-accent group-hover:text-accent-fg" />
          </div>
          <div>
            <div className="font-medium text-sm">Export Agent</div>
            <div className="text-xs text-muted">Backup all data</div>
          </div>
        </button>

        <button
          type="button"
          className="flex items-center gap-3 p-4 border border-border bg-bg rounded-lg hover:border-accent hover:bg-accent-subtle/50 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-accent-subtle flex items-center justify-center group-hover:bg-accent group-hover:text-accent-fg transition-colors">
            <Upload className="w-5 h-5 text-accent group-hover:text-accent-fg" />
          </div>
          <div>
            <div className="font-medium text-sm">Import Agent</div>
            <div className="text-xs text-muted">Restore from backup</div>
          </div>
        </button>
      </div>

      {/* Danger Zone */}
      <div className="border border-danger/30 rounded-lg overflow-hidden">
        <div className="bg-danger/5 px-4 py-3 border-b border-danger/30 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <span className="font-medium text-sm text-danger">Danger Zone</span>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Reset Agent</div>
              <div className="text-xs text-muted">
                Wipe all data and return to onboarding
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-danger text-danger rounded-lg text-sm font-medium hover:bg-danger hover:text-danger-foreground transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView() {
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
    currentTheme,
    // Actions
    loadPlugins,
    handlePluginToggle,
    setTheme,
    setTab,
    loadUpdateStatus: _loadUpdateStatus,
    handlePluginConfigSave,
    handleCloudLogin,
    handleCloudDisconnect,
    setState,
  } = useApp();

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

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
      const sections = SETTINGS_SECTIONS.map((s) => {
        const el = root.querySelector(`#${s.id}`) as HTMLElement;
        return { id: s.id, el };
      }).filter((s) => s.el !== null);

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
  }, []);

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-bg">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-8 pb-20">
          {/* APPEARANCE SECTION */}
          <SectionCard
            id="appearance"
            title="Appearance"
            description="Choose a theme that matches your style. Themes affect colors, fonts, and overall appearance."
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`p-4 border rounded-xl text-left transition-all duration-200 hover:border-accent hover:shadow-md hover:-translate-y-0.5 ${
                    currentTheme === t.id
                      ? "border-accent bg-accent-subtle shadow-md"
                      : "border-border bg-bg hover:bg-bg-hover"
                  }`}
                  onClick={() => setTheme(t.id)}
                >
                  <div className="text-sm font-semibold text-txt-strong mb-1">
                    {t.label}
                  </div>
                  <div className="text-[11px] text-muted">{t.hint}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* AI MODEL SECTION */}
          <SectionCard
            id="ai-model"
            title="AI Model"
            description="Configure your AI provider and model settings."
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

          {/* MEDIA SECTION */}
          <SectionCard
            id="media"
            title="Media Generation"
            description="Configure providers for image, video, and vision capabilities."
          >
            <MediaSettingsSection />
          </SectionCard>

          {/* VOICE SECTION */}
          <SectionCard
            id="voice"
            title="Voice Configuration"
            description="Text-to-speech and speech-to-text settings."
          >
            <VoiceConfigView />
          </SectionCard>

          {/* PERMISSIONS SECTION */}
          <SectionCard
            id="permissions"
            title="Permissions & Capabilities"
            description="Control what your agent can do and access."
          >
            <PermissionsSection />
          </SectionCard>

          {/* UPDATES SECTION */}
          <SectionCard
            id="updates"
            title="Software Updates"
            description="Keep your agent up to date with the latest features and improvements."
          >
            <UpdatesSection />
          </SectionCard>

          {/* ADVANCED SECTION */}
          <SectionCard
            id="advanced"
            title="Advanced Settings"
            description="Power user tools and system configuration."
          >
            <AdvancedSection />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
