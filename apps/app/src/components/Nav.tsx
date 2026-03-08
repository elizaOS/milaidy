import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { useTabNavigation } from "../hooks/useTabNavigation";
import { createTranslator } from "../i18n";
import type { TabGroup } from "../navigation";
import { IconButton } from "./shared/IconButton";
import { ShortcutHintRail } from "./shared/ShortcutHintRail";

/** Map static navigation group labels to i18n keys. */
const NAV_LABEL_I18N_KEY: Record<string, string> = {
  Advanced: "nav.advanced",
  Apps: "nav.apps",
  Character: "nav.character",
  Chat: "nav.chat",
  Companion: "nav.companion",
  Knowledge: "nav.knowledge",
  Settings: "nav.settings",
  Social: "nav.social",
  Stream: "nav.stream",
  Wallets: "nav.wallets",
};

interface NavProps {
  mobileLeft?: ReactNode;
}

export function Nav({ mobileLeft }: NavProps) {
  const { uiLanguage } = useApp();
  const { activeTab, navGroups, navigateToTab, persistShellPanels, restoreShellPanels } =
    useTabNavigation();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(() =>
    restoreShellPanels(activeTab).mobileNavOpen,
  );

  const activeGroup = useMemo<TabGroup>(
    () =>
      navGroups.find((group) => group.tabs.includes(activeTab)) ?? navGroups[0],
    [activeTab, navGroups],
  );

  useEffect(() => {
    setMobileMenuOpen(restoreShellPanels(activeTab).mobileNavOpen);
  }, [activeTab, restoreShellPanels]);

  useEffect(() => {
    persistShellPanels(activeTab, { mobileNavOpen: mobileMenuOpen });
  }, [activeTab, mobileMenuOpen, persistShellPanels]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <nav
        className="lg:hidden border-b border-border bg-bg px-3 py-2 flex items-center justify-between gap-3"
        data-testid="nav-mobile-bar"
      >
        <div className="flex-1 min-w-0 overflow-x-auto">
          {mobileLeft ?? (
            <div className="flex items-center gap-2">
              <activeGroup.icon className="w-4 h-4 text-accent" />
              <span className="text-[13px] font-semibold text-accent truncate">
                {t(NAV_LABEL_I18N_KEY[activeGroup.label] ?? activeGroup.label)}
              </span>
            </div>
          )}
        </div>
        <IconButton
          active={mobileMenuOpen}
          label="Open navigation menu"
          onClick={() => setMobileMenuOpen(true)}
          data-testid="nav-mobile-open"
        >
          <Menu className="h-5 w-5" />
        </IconButton>
      </nav>

      <nav
        className="hidden lg:flex border-b border-border bg-bg/80 backdrop-blur-sm py-1.5 px-3 xl:px-5 gap-0.5 overflow-x-auto whitespace-nowrap sticky top-0 z-10"
        data-testid="nav-root"
      >
        {navGroups.map((group) => {
          const primaryTab = group.tabs[0];
          const isActive = group.tabs.includes(activeTab);
          const Icon = group.icon;
          return (
            <button
              type="button"
              key={group.label}
              className={`inline-flex items-center gap-1.5 shrink-0 px-3 xl:px-4 py-1.5 text-[12px] bg-transparent border-0 border-b-2 cursor-pointer transition-all duration-200 focus-ring-strong ${
                isActive
                  ? "text-accent font-medium border-b-accent bg-accent-subtle/50"
                  : "text-muted border-b-transparent hover:text-txt hover:border-b-muted/50 hover:bg-bg-hover"
              }`}
              onClick={() => navigateToTab(primaryTab)}
              title={group.description}
              data-testid={`nav-tab-${primaryTab}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t(NAV_LABEL_I18N_KEY[group.label] ?? group.label)}</span>
            </button>
          );
        })}
      </nav>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[140] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          data-testid="nav-mobile-panel"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm w-full h-full border-0 cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          />

          <div className="absolute right-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-bg border-l border-border shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-accent">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <activeGroup.icon className="w-4 h-4 text-accent-fg" />
                </span>
                <span className="text-sm font-semibold text-txt-strong">
                  Menu
                </span>
              </div>
              <IconButton
                label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="nav-mobile-close"
              >
                <X className="h-5 w-5" />
              </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto py-3 px-3">
              <div className="flex flex-col gap-1">
                {navGroups.map((group, index) => {
                  const primaryTab = group.tabs[0];
                  const isActive = group.tabs.includes(activeTab);
                  const Icon = group.icon;
                  return (
                    <button
                      key={group.label}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-3.5 border rounded-lg text-[14px] font-medium transition-all duration-200 cursor-pointer min-h-[48px] focus-ring-strong ${
                        isActive
                          ? "border-accent bg-accent-subtle text-accent shadow-sm"
                          : "border-transparent bg-transparent text-txt hover:border-border hover:bg-bg-hover"
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => {
                        navigateToTab(primaryTab);
                        setMobileMenuOpen(false);
                      }}
                      data-testid={`nav-mobile-tab-${primaryTab}`}
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
                        {group.description ? (
                          <div className="text-[11px] text-muted mt-0.5">
                            {group.description}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border p-3">
              <ShortcutHintRail
                hints={[
                  { keys: "Esc", label: "Close menu" },
                  { keys: "Cmd/Ctrl K", label: "Open palette" },
                ]}
                dataTestId="nav-shortcut-rail"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
