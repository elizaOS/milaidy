import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { getTabGroups, type TabGroup } from "../navigation";

interface NavProps {
  mobileLeft?: ReactNode;
}

export function Nav({ mobileLeft }: NavProps) {
  const { tab, setTab, plugins } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, []);

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

  return (
    <>
      {/* Mobile Header Navigation */}
      <nav className="lg:hidden border-b border-border bg-bg px-3 py-2 flex items-center justify-between">
        <div className="flex-1 min-w-0 overflow-x-auto">
          {mobileLeft ?? (
            <div className="flex items-center gap-2">
              <activeGroup.icon className="w-4 h-4 text-accent" />
              <span className="text-[13px] font-semibold text-accent truncate">
                {activeGroup.label}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm rounded-md"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          <Menu className="w-5 h-5" />
        </button>
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden lg:flex border-b border-border bg-bg/80 backdrop-blur-sm py-1.5 px-3 xl:px-5 gap-0.5 overflow-x-auto whitespace-nowrap sticky top-0 z-10">
        {tabGroups.map((group: TabGroup) => {
          const primaryTab = group.tabs[0];
          const isActive = group.tabs.includes(tab);
          const Icon = group.icon;
          return (
            <button
              type="button"
              key={group.label}
              className={`inline-flex items-center gap-1.5 shrink-0 px-3 xl:px-4 py-1.5 text-[12px] bg-transparent border-0 border-b-2 cursor-pointer transition-all duration-200 ${
                isActive
                  ? "text-accent font-medium border-b-accent bg-accent-subtle/50"
                  : "text-muted border-b-transparent hover:text-txt hover:border-b-muted/50 hover:bg-bg-hover"
              }`}
              onClick={() => setTab(primaryTab)}
              title={group.description}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{group.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[140] lg:hidden"
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
                  <activeGroup.icon className="w-4 h-4 text-accent-foreground" />
                </span>
                <span className="text-sm font-semibold text-txt-strong">
                  Menu
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm rounded-md"
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
                      className={`w-full flex items-center gap-3 px-3 py-3.5 border rounded-lg text-[14px] font-medium transition-all duration-200 cursor-pointer min-h-[48px] ${
                        isActive
                          ? "border-accent bg-accent-subtle text-accent shadow-sm"
                          : "border-transparent bg-transparent text-txt hover:border-border hover:bg-bg-hover"
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
                        <div className="font-medium">{group.label}</div>
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

            {/* Footer */}
            <div className="border-t border-border p-3 text-[11px] text-muted text-center">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-bg-accent border border-border rounded text-[10px] font-mono">
                ESC
              </kbd>{" "}
              to close
            </div>
          </div>
        </div>
      )}
    </>
  );
}
