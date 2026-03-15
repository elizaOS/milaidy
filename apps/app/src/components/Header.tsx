import { getTabGroups, type TabGroup } from "@milady/app-core/navigation";
import { useApp } from "@milady/app-core/state";
import { AlertTriangle, CircleDollarSign, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  HEADER_ICON_BUTTON_CLASSNAME,
  ShellHeaderControls,
} from "./shared/ShellHeaderControls";

const NAV_LABEL_I18N_KEY: Record<string, string> = {
  Chat: "nav.chat",
  Companion: "nav.companion",
  Stream: "nav.stream",
  Character: "nav.character",
  Wallets: "nav.wallets",
  Knowledge: "nav.knowledge",
  Social: "nav.social",
  Apps: "nav.apps",
  Settings: "nav.settings",
  Heartbeats: "nav.heartbeats",
  Advanced: "nav.advanced",
};

interface HeaderProps {
  mobileLeft?: ReactNode;
}

export function Header(_props: HeaderProps) {
  const {
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsCritical,
    miladyCloudCreditsLow,
    miladyCloudTopUpUrl,
    tab,
    setTab,
    setState,
    plugins,
    loadDropStatus,
    uiShellMode,
    setUiShellMode,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    t,
  } = useApp();

  const [copied, setCopied] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    void loadDropStatus();
  }, [loadDropStatus]);

  // Clear copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const streamingEnabled = useMemo(
    () => plugins.some((p) => p.id === "streaming-base" && p.enabled),
    [plugins],
  );

  const tabGroups = useMemo(
    () => getTabGroups(streamingEnabled),
    [streamingEnabled],
  );

  const creditColor = miladyCloudCreditsCritical
    ? "border-danger text-danger bg-danger/10"
    : miladyCloudCreditsLow
      ? "border-warn text-warn bg-warn/10"
      : "border-ok text-ok bg-ok/10";

  const shellMode = uiShellMode ?? "companion";

  const handleShellModeChange = (mode: "companion" | "native") => {
    setUiShellMode(mode);
    setTab(mode === "companion" ? "companion" : "chat");
  };

  useEffect(() => {
    if (shellMode !== "native") return;
    setState("chatMode", "power");
  }, [setState, shellMode]);

  return (
    <>
      <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl py-2 px-3 sm:py-3 sm:px-4 z-20 sticky top-0 w-full transition-all">
        <ShellHeaderControls
          shellMode={shellMode}
          onShellModeChange={handleShellModeChange}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
          rightExtras={
            <>
              {(miladyCloudEnabled || miladyCloudConnected) &&
                (miladyCloudConnected ? (
                  <a
                    href={miladyCloudTopUpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 h-11 border rounded-md font-mono text-[11px] sm:text-xs no-underline transition-all duration-200 hover:border-accent hover:text-txt hover:shadow-sm ${miladyCloudCredits === null ? "border-muted text-muted" : creditColor}`}
                    title={t("header.CloudCreditsBalanc")}
                  >
                    <CircleDollarSign className="w-3.5 h-3.5" />
                    {miladyCloudCredits === null
                      ? t("header.miladyCloudConnected")
                      : `$${miladyCloudCredits.toFixed(2)}`}
                  </a>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 h-11 border border-danger text-danger bg-danger/10 rounded-md font-mono text-[11px] sm:text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {t("header.cloudDisconnected")}
                    </span>
                    <span className="sm:hidden">{t("header.Cloud")}</span>
                  </span>
                ))}
              <button
                type="button"
                className={`md:hidden ${HEADER_ICON_BUTTON_CLASSNAME}`}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="w-5 h-5" />
              </button>
            </>
          }
        >
          <nav className="hidden md:flex flex-1 items-center justify-left gap-1 overflow-x-auto whitespace-nowrap px-2 scrollbar-hide">
            {tabGroups.map((group: TabGroup) => {
              const primaryTab = group.tabs[0];
              const isActive = group.tabs.includes(tab);
              const Icon = group.icon;
              return (
                <button
                  type="button"
                  key={group.label}
                  className={`inline-flex items-center justify-center gap-1.5 shrink-0 px-3 lg:px-4 py-2 text-[12px] bg-transparent border border-transparent cursor-pointer transition-all duration-300 rounded-full ${
                    isActive
                      ? "text-accent-fg dark:text-txt-strong font-bold bg-accent dark:bg-accent/15 shadow-[0_0_15px_rgba(var(--accent),0.28)] border-accent/50 dark:border-accent/40 ring-1 ring-inset ring-white/18 dark:ring-accent/25"
                      : "text-muted hover:text-txt hover:bg-bg-hover hover:border-border/50"
                  }`}
                  onClick={() => setTab(primaryTab)}
                  title={group.description}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden lg:inline">
                    {t(NAV_LABEL_I18N_KEY[group.label] ?? group.label)}
                  </span>
                </button>
              );
            })}
          </nav>
        </ShellHeaderControls>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[140] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm w-full h-full border-0 cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          />

          {/* Menu Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-bg border-l border-border shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col">
            <div className="flex-1 overflow-y-auto py-3 px-3">
              <div className="flex flex-col gap-1">
                {tabGroups.map((group: TabGroup, index) => {
                  const primaryTab = group.tabs[0];
                  const isActive = group.tabs.includes(tab);
                  const Icon = group.icon;
                  return (
                    <button
                      key={group.label}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-3.5 border rounded-xl text-[14px] font-medium transition-all duration-300 cursor-pointer min-h-[48px] ${
                        isActive
                          ? "border-accent/50 dark:border-accent/40 bg-accent dark:bg-accent/15 text-accent-fg dark:text-txt-strong shadow-[0_0_15px_rgba(var(--accent),0.24)] ring-1 ring-inset ring-white/18 dark:ring-accent/25"
                          : "border-transparent bg-transparent text-txt hover:border-border/50 hover:bg-bg-hover"
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => {
                        setTab(primaryTab);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <span
                        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                          isActive ? "bg-accent/20" : "bg-bg-accent"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${isActive ? "text-txt" : "text-muted"}`}
                        />
                      </span>
                      <div className="flex-1 text-left">
                        <div className="font-medium">
                          {t(NAV_LABEL_I18N_KEY[group.label] ?? group.label)}
                        </div>
                        {group.description && (
                          <div className="text-[11px] text-muted mt-0.5">
                            {group.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
