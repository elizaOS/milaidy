/**
 * Trader shell — a purpose-built layout for prediction market traders and
 * agent developers.
 *
 * Three-column layout:
 *   Left:   Compact agent chat (resizable)
 *   Center: Market dashboard / strategy status / positions
 *   Right:  Wallet overview + quick-trade panel
 *
 * Used when `uiShellMode === "trader"`.
 */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { Tab } from "../navigation";
import { ChatView } from "./ChatView";
import { InventoryView } from "./InventoryView";
import { PluginsView } from "./PluginsView";
import { SettingsView } from "./SettingsView";
import { SkillsView } from "./SkillsView";
import { AdvancedPageView } from "./AdvancedPageView";
import { KnowledgeView } from "./KnowledgeView";
import { ErrorBoundary } from "./shared/ErrorBoundary";

/* ── Tabs that the trader shell handles ──────────────────────────────── */

export const TRADER_TABS = new Set<Tab>([
  "chat",
  "companion",
  "wallets",
  "plugins",
  "skills",
  "settings",
  "advanced",
  "actions",
  "triggers",
  "runtime",
  "database",
  "logs",
  "security",
  "knowledge",
]);

/* ── Sidebar nav items ───────────────────────────────────────────────── */

interface SidebarItem {
  tab: Tab;
  label: string;
  icon: string; // SVG path(s)
  accent: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    tab: "chat",
    label: "Agent",
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    accent: "#00e1ff",
  },
  {
    tab: "wallets",
    label: "Wallet",
    icon: "M21 12V7H5a2 2 0 0 1 0-4h14v4|M3 5v14a2 2 0 0 0 2 2h16v-5|M18 12a2 2 0 0 0 0 4h4v-4h-4z",
    accent: "#f0b90b",
  },
  {
    tab: "plugins",
    label: "Plugins",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    accent: "#f0b232",
  },
  {
    tab: "skills",
    label: "Skills",
    icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    accent: "#00e1ff",
  },
  {
    tab: "knowledge",
    label: "Knowledge",
    icon: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20",
    accent: "#a78bfa",
  },
  {
    tab: "advanced",
    label: "Advanced",
    icon: "M16 18l6-6-6-6|M8 6l-6 6 6 6",
    accent: "#38bdf8",
  },
  {
    tab: "settings",
    label: "Settings",
    icon: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    accent: "#94a3b8",
  },
];

/* ── Icon helper ─────────────────────────────────────────────────────── */

function SidebarIcon({ paths }: { paths: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export interface TraderShellProps {
  tab: Tab;
  actionNotice: { text: string; tone: string } | null;
}

export function TraderShell({ tab }: TraderShellProps) {
  const {
    setTab,
    setUiShellMode,
    agentStatus,
    walletAddresses,
  } = useApp();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeTab = tab === "companion" ? "chat" : tab;

  const agentName = agentStatus?.agentName ?? "Agent";
  const agentState = agentStatus?.state ?? "not_started";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 6)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;

  const stateColor = useMemo(() => {
    switch (agentState) {
      case "running":
        return "#22c55e";
      case "paused":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  }, [agentState]);

  const handleModeSwitch = useCallback(
    (mode: "companion" | "native") => {
      setUiShellMode(mode);
      setTab(mode === "companion" ? "companion" : "chat");
    },
    [setUiShellMode, setTab],
  );

  /* ── Render active panel content ─────────────────────────────────── */
  const panelContent = useMemo(() => {
    switch (activeTab) {
      case "chat":
        return <ChatView />;
      case "wallets":
        return <InventoryView />;
      case "plugins":
        return <PluginsView />;
      case "skills":
        return <SkillsView />;
      case "knowledge":
        return <KnowledgeView />;
      case "settings":
        return <SettingsView />;
      case "advanced":
      case "actions":
      case "triggers":
      case "runtime":
      case "database":
      case "logs":
      case "security":
        return <AdvancedPageView />;
      default:
        return <ChatView />;
    }
  }, [activeTab]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0e14] text-white font-body">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside
        className={`flex flex-col border-r border-[#1e2433] bg-[#0f1219] transition-all duration-200 shrink-0 ${
          sidebarCollapsed ? "w-[52px]" : "w-[200px]"
        }`}
      >
        {/* Logo / collapse toggle */}
        <div className="flex items-center justify-between h-12 px-3 border-b border-[#1e2433]">
          {!sidebarCollapsed && (
            <span className="text-sm font-bold tracking-wide text-[#00e1ff]">
              TRADER
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1 rounded hover:bg-[#1e2433] transition-colors cursor-pointer"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {sidebarCollapsed ? (
                <polyline points="9 6 15 12 9 18" />
              ) : (
                <polyline points="15 6 9 12 15 18" />
              )}
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = activeTab === item.tab ||
              (item.tab === "advanced" && [
                "advanced", "actions", "triggers", "runtime",
                "database", "logs", "security",
              ].includes(activeTab));

            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => setTab(item.tab)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-left text-[13px] transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#1a2035] text-white"
                    : "text-[#8892a4] hover:text-white hover:bg-[#141824]"
                }`}
                style={
                  isActive
                    ? ({
                        borderLeft: `2px solid ${item.accent}`,
                        color: item.accent,
                      } as React.CSSProperties)
                    : { borderLeft: "2px solid transparent" }
                }
                title={item.label}
              >
                <SidebarIcon paths={item.icon} />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Mode switcher at bottom */}
        <div className="border-t border-[#1e2433] p-2 space-y-1">
          <button
            type="button"
            onClick={() => handleModeSwitch("companion")}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] text-[#8892a4] hover:text-[#d4af37] hover:bg-[#141824] rounded transition-all cursor-pointer"
            title="Switch to Companion mode"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {!sidebarCollapsed && <span>Companion</span>}
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("native")}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] text-[#8892a4] hover:text-[#22c55e] hover:bg-[#141824] rounded transition-all cursor-pointer"
            title="Switch to Native mode"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <line x1="8" y1="20" x2="16" y2="20" />
              <line x1="12" y1="18" x2="12" y2="20" />
            </svg>
            {!sidebarCollapsed && <span>Native</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content area ────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between h-12 px-4 border-b border-[#1e2433] bg-[#0f1219] shrink-0">
          <div className="flex items-center gap-3">
            {/* Agent status indicator */}
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: stateColor }}
              />
              <span className="text-sm font-semibold text-white">
                {agentName}
              </span>
              <span className="text-[10px] text-[#8892a4] uppercase tracking-wider">
                {agentState}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Wallet address */}
            {evmShort && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#1e2433] bg-[#141824] text-[11px] font-mono text-[#8892a4]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                </svg>
                {evmShort}
              </div>
            )}

            {/* Trader mode badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#00e1ff]/30 bg-[#00e1ff]/10 text-[11px] font-mono text-[#00e1ff]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 3v18h18" />
                <path d="m7 14 4-4 3 3 5-6" />
              </svg>
              TRADER MODE
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            {activeTab === "chat" ? (
              /* Chat gets a constrained max-width for readability */
              <div className="flex flex-col h-full">
                <ChatView />
              </div>
            ) : (
              <div className="p-4 xl:p-6">
                {panelContent}
              </div>
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
