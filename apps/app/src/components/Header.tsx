import { LanguageDropdown } from "@milady/app-core/components";
import { getTabGroups, type TabGroup } from "@milady/app-core/navigation";
import { IconTooltip as IconButtonTooltip } from "@milady/ui";
import { AlertTriangle, Bug, CircleDollarSign, Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";
import { AgentModeDropdown } from "./shared/AgentModeDropdown";

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
  Advanced: "nav.advanced",
};

interface HeaderProps {
  mobileLeft?: ReactNode;
}

export function Header({ mobileLeft }: HeaderProps) {
  const {
    agentStatus,
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsCritical,
    miladyCloudCreditsLow,
    miladyCloudTopUpUrl,
    tab,
    setTab,
    plugins,
    loadDropStatus,
    uiLanguage,
    setUiLanguage,
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

  const activeGroup = useMemo(
    () => tabGroups.find((group) => group.tabs.includes(tab)) ?? tabGroups[0],
    [tab, tabGroups],
  );

  const name = agentStatus?.agentName ?? "Milady";

  const creditColor = miladyCloudCreditsCritical
    ? "border-danger text-danger bg-danger/10"
    : miladyCloudCreditsLow
      ? "border-warn text-warn bg-warn/10"
      : "border-ok text-ok bg-ok/10";

  const { open: openBugReport } = useBugReport();

  // Minimum 44px touch targets for mobile
  const iconBtnBase =
    "inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border/50 bg-bg/50 backdrop-blur-md cursor-pointer text-sm leading-none hover:border-accent hover:text-accent font-medium hover:-translate-y-0.5 transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--accent),0.5)] active:scale-95 rounded-xl text-txt shadow-sm";

  return (
    <>
      <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl py-2 px-3 sm:py-3 sm:px-4 z-20 sticky top-0 w-full transition-all">
        <div className="flex items-center justify-between gap-3 min-w-0 w-full">
          {/* Left: Agent Name or mobileLeft */}
          <div className="flex items-center gap-2 shrink-0 min-w-0 lg:w-[260px]">
            <div className="hidden md:block min-w-0">
              <span
                className="text-base font-bold text-txt-strong truncate block"
                data-testid="agent-name"
              >
                {name}
              </span>
            </div>
            <div className="md:hidden flex items-center gap-2 min-w-0">
              {mobileLeft ? (
                mobileLeft
              ) : (
                <div className="flex items-center gap-2">
                  <activeGroup.icon className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-semibold text-accent truncate">
                    {t(
                      NAV_LABEL_I18N_KEY[activeGroup.label] ??
                        activeGroup.label,
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Center: Desktop/Tablet Nav */}
          <nav className="hidden md:flex flex-1 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap px-2 scrollbar-hide">
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
                      ? "text-accent-fg font-bold bg-accent shadow-[0_0_15px_rgba(var(--accent),0.4)] border-accent/50 scale-105"
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

          {/* Right side controls */}
          <div className="flex shrink-0 items-center justify-end gap-2 lg:w-[260px]">
            {/* Scrollable controls */}
            <div className="overflow-x-auto scrollbar-hide min-w-0 hidden sm:block">
              <div className="flex items-center gap-2 w-max ml-auto pr-0.5">
                {/* Cloud Credits */}
                {(miladyCloudEnabled || miladyCloudConnected) &&
                  (miladyCloudConnected ? (
                    <a
                      href={miladyCloudTopUpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 h-11 border rounded-md font-mono text-[11px] sm:text-xs no-underline transition-all duration-200 hover:border-accent hover:text-accent hover:shadow-sm ${miladyCloudCredits === null ? "border-muted text-muted" : creditColor}`}
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
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <IconButtonTooltip
                label={t("header.reportBug")}
                shortcut="Shift+?"
              >
                <button
                  type="button"
                  onClick={openBugReport}
                  aria-label={t("header.reportBug")}
                  className={iconBtnBase}
                >
                  <Bug className="w-5 h-5" />
                </button>
              </IconButtonTooltip>
            </div>

            <div className="hidden md:flex items-center gap-2 shrink-0">
              {/* Agent Mode */}
              <AgentModeDropdown />

              {/* Language Selector */}
              <LanguageDropdown
                uiLanguage={uiLanguage}
                setUiLanguage={setUiLanguage}
                t={t}
              />
            </div>

            {/* Mobile Hamburger */}
            <button
              type="button"
              className={`md:hidden ${iconBtnBase}`}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-accent">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <activeGroup.icon className="w-4 h-4 text-accent-fg" />
                </span>
                <span className="text-sm font-semibold text-txt-strong">
                  {t("nav.Menu")}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border/50 bg-card/50 backdrop-blur-sm text-txt cursor-pointer hover:border-accent hover:text-accent transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--accent),0.3)] hover:-translate-y-0.5 active:scale-95 rounded-xl"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
                          ? "border-accent/50 bg-accent text-accent-fg shadow-[0_0_15px_rgba(var(--accent),0.3)] scale-[1.02]"
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
                          className={`w-4 h-4 ${isActive ? "text-accent" : "text-muted"}`}
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

              {/* Settings for Mobile */}
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
                <div className="flex flex-col gap-2 justify-between">
                  <AgentModeDropdown />
                  <LanguageDropdown
                    uiLanguage={uiLanguage}
                    setUiLanguage={setUiLanguage}
                    t={t}
                  />
                  <IconButtonTooltip
                    label={t("header.reportBug")}
                    shortcut="Shift+?"
                  >
                    <button
                      type="button"
                      onClick={openBugReport}
                      aria-label={t("header.reportBug")}
                      className={iconBtnBase}
                    >
                      <Bug className="w-5 h-5" />
                    </button>
                  </IconButtonTooltip>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border p-3 text-[11px] text-muted text-center">
              {t("nav.Press")}{" "}
              <kbd className="px-1.5 py-0.5 bg-bg-accent border border-border rounded text-[10px] font-mono">
                {t("nav.ESC")}
              </kbd>{" "}
              {t("nav.toClose")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
