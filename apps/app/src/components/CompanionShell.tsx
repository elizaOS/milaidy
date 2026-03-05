/**
 * Companion shell — renders tab views as overlay panels on top of CompanionView.
 *
 * Used when `uiShellMode === "companion"`. The native tabbed layout in App.tsx
 * handles `uiShellMode === "native"`.
 */

import type React from "react";
import { useApp } from "../AppContext";
import type { Tab } from "../navigation";
import { AdvancedPageView } from "./AdvancedPageView";
import { AppsPageView } from "./AppsPageView";
import { BugReportModal } from "./BugReportModal";
import { CharacterView } from "./CharacterView";
import { CommandPalette } from "./CommandPalette";
import { CompanionView } from "./CompanionView";
import { ConnectorsPageView } from "./ConnectorsPageView";
import { EmotePicker } from "./EmotePicker";
import { InventoryView } from "./InventoryView";
import { KnowledgeView } from "./KnowledgeView";
import { LifoSandboxView } from "./LifoSandboxView";
import { MemoryDebugPanel } from "./MemoryDebugPanel";
import { PluginsView } from "./PluginsView";
import { RestartBanner } from "./RestartBanner";
import { SettingsView } from "./SettingsView";
import { SkillsView } from "./SkillsView";
import { StreamView } from "./StreamView";

/* ── Overlay tab set ───────────────────────────────────────────────── */

export const COMPANION_OVERLAY_TABS = new Set<Tab>([
  "companion",
  "skills",
  "character",
  "character-select",
  "settings",
  "plugins",
  "advanced",
  "actions",
  "triggers",
  "fine-tuning",
  "trajectories",
  "runtime",
  "database",
  "logs",
  "security",
  "apps",
  "connectors",
  "knowledge",
  "lifo",
  "stream",
  "wallets",
]);

/* ── Per-tab accent / color config ─────────────────────────────────── */

const ACCENT_COLORS: Record<string, string> = {
  skills: "#00e1ff",
  apps: "#10b981",
  plugins: "#f0b232",
  connectors: "#f0b232",
  knowledge: "#a78bfa",
  wallets: "#f0b90b",
  stream: "#ef4444",
  lifo: "#8b5cf6",
};

const TOP_BAR_COLORS: Record<string, string> = {
  skills: "#00e1ff",
  wallets: "rgba(240, 185, 11, 0.7)",
  lifo: "rgba(139, 92, 246, 0.7)",
  stream: "rgba(239, 68, 68, 0.7)",
  plugins: "#f0b232",
  connectors: "#f0b232",
  apps: "rgba(16, 185, 129, 0.7)",
  knowledge: "rgba(167, 139, 250, 0.7)",
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function tabFlags(tab: Tab) {
  const isSkills = tab === "skills";
  const isSettings = tab === "settings";
  const isPlugins = tab === "plugins";
  const isLifo = tab === "lifo";
  const isStream = tab === "stream";
  const isWallets = tab === "wallets";
  const isApps = tab === "apps";
  const isConnectors = tab === "connectors";
  const isKnowledge = tab === "knowledge";
  const isAdvancedOverlay =
    tab === "advanced" ||
    tab === "actions" ||
    tab === "triggers" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "logs" ||
    tab === "security" ||
    isLifo ||
    isStream;
  const isPluginsLike = isPlugins || isConnectors;
  const isCentered =
    isSkills ||
    isSettings ||
    isPlugins ||
    isAdvancedOverlay ||
    isApps ||
    isConnectors ||
    isKnowledge ||
    isLifo ||
    isStream ||
    isWallets;
  const isCharacter = tab === "character" || tab === "character-select";

  return {
    isSkills,
    isSettings,
    isPlugins,
    isLifo,
    isStream,
    isWallets,
    isApps,
    isConnectors,
    isKnowledge,
    isAdvancedOverlay,
    isPluginsLike,
    isCentered,
    isCharacter,
  };
}

function overlayBackdropClass(tab: Tab, f: ReturnType<typeof tabFlags>) {
  if (f.isSkills)
    return "opacity-100 backdrop-blur-2xl bg-black/40 pointer-events-auto";
  if (f.isPluginsLike)
    return "opacity-100 backdrop-blur-xl bg-black/35 pointer-events-auto";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isLifo ||
    f.isStream ||
    f.isWallets
  )
    return "opacity-100 backdrop-blur-2xl bg-black/50 pointer-events-auto";
  if (f.isCharacter) return "opacity-100";
  return "opacity-0";
}

function cardSizeClass(f: ReturnType<typeof tabFlags>) {
  if (f.isSkills)
    return "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl";
  if (f.isPluginsLike)
    return "w-[97vw] h-[92vh] md:w-[88vw] md:h-[80vh] max-w-[1460px] overflow-visible";
  if (f.isAdvancedOverlay)
    return "w-[95vw] h-[95vh] max-w-[1500px] backdrop-blur-3xl border rounded-2xl overflow-hidden";
  if (f.isSettings || f.isApps || f.isKnowledge || f.isWallets)
    return "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl overflow-hidden";
  return "w-[65vw] min-w-[700px] h-[100vh] border-l backdrop-blur-2xl";
}

function cardBackground(f: ReturnType<typeof tabFlags>) {
  if (f.isSkills) return "rgba(20, 24, 38, 0.85)";
  if (f.isPluginsLike) return "transparent";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "rgba(18, 22, 32, 0.92)";
  return "linear-gradient(to left, rgba(6, 8, 12, 0.95) 40%, rgba(6, 8, 12, 0.7) 80%, rgba(6, 8, 12, 0.2) 100%)";
}

function cardBorderColor(f: ReturnType<typeof tabFlags>) {
  if (f.isSkills) return "rgba(0,225,255,0.2)";
  if (f.isPluginsLike) return "transparent";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "rgba(255, 255, 255, 0.08)";
  return "rgba(255,255,255,0.05)";
}

function cardBoxShadow(f: ReturnType<typeof tabFlags>, shadowFx: string) {
  if (f.isSkills) return shadowFx;
  if (f.isPluginsLike) return "none";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "0 8px 60px rgba(0,0,0,0.6), 0 2px 24px rgba(0,0,0,0.4)";
  return "-60px 0 100px -20px rgba(0,0,0,0.8)";
}

function accentVar(tab: Tab, f: ReturnType<typeof tabFlags>) {
  if (f.isPluginsLike) return "#f0b232";
  if (f.isApps) return "#10b981";
  if (f.isKnowledge) return "#a78bfa";
  if (f.isWallets) return "#f0b90b";
  if (f.isLifo) return "#8b5cf6";
  if (f.isStream) return "#ef4444";
  return "#7b8fb5";
}

function accentSubtleVar(tab: Tab, f: ReturnType<typeof tabFlags>) {
  if (f.isPluginsLike) return "rgba(240, 178, 50, 0.12)";
  if (f.isApps) return "rgba(16, 185, 129, 0.12)";
  if (f.isKnowledge) return "rgba(167, 139, 250, 0.12)";
  if (f.isWallets) return "rgba(240, 185, 11, 0.12)";
  if (f.isLifo) return "rgba(139, 92, 246, 0.12)";
  if (f.isStream) return "rgba(239, 68, 68, 0.12)";
  return "rgba(123, 143, 181, 0.12)";
}

function accentRgbVar(tab: Tab, f: ReturnType<typeof tabFlags>) {
  if (f.isPluginsLike) return "240, 178, 50";
  if (f.isApps) return "16, 185, 129";
  if (f.isKnowledge) return "167, 139, 250";
  if (f.isWallets) return "240, 185, 11";
  if (f.isLifo) return "139, 92, 246";
  if (f.isStream) return "239, 68, 68";
  return "123, 143, 181";
}

function viewWrapperOverflow(f: ReturnType<typeof tabFlags>) {
  if (f.isPluginsLike) return "overflow-visible";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isWallets
  )
    return "overflow-hidden";
  return "overflow-y-auto";
}

function viewWrapperPadding(f: ReturnType<typeof tabFlags>) {
  if (f.isSkills) return "px-10 pb-10 pt-4";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isPlugins ||
    f.isWallets
  )
    return "p-0";
  if (f.isKnowledge) return "px-8 py-8";
  return "px-16 pt-32 pb-16";
}

function viewWrapperStyle(
  tab: Tab,
  f: ReturnType<typeof tabFlags>,
  accentColor: string,
): React.CSSProperties {
  if (
    f.isSettings ||
    f.isPlugins ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isKnowledge ||
    f.isWallets
  ) {
    return {
      "--bg": "transparent",
      "--card": "rgba(255, 255, 255, 0.05)",
      "--border": "rgba(255, 255, 255, 0.08)",
      "--accent": accentVar(tab, f),
      "--accent-foreground": "#ffffff",
      "--accent-subtle": accentSubtleVar(tab, f),
      "--accent-rgb": accentRgbVar(tab, f),
      "--muted": "rgba(255, 255, 255, 0.45)",
      "--txt": "rgba(240, 238, 250, 0.92)",
      "--text": "rgba(240, 238, 250, 0.92)",
      "--danger": "#ef4444",
      "--ok": "#22c55e",
      "--warning": "#f59e0b",
      "--surface": "rgba(255, 255, 255, 0.06)",
      "--bg-hover": "rgba(255, 255, 255, 0.04)",
      "--bg-muted": "rgba(255, 255, 255, 0.03)",
      "--border-hover": "rgba(255, 255, 255, 0.15)",
    } as React.CSSProperties;
  }
  return {
    "--bg": "transparent",
    "--card": f.isSkills ? "rgba(255, 255, 255, 0.05)" : "transparent",
    "--border": f.isSkills ? "rgba(0,225,255,0.3)" : "rgba(255,255,255,0.08)",
    "--accent": accentColor,
    "--accent-foreground": f.isSkills ? "#000000" : "#ffffff",
    "--muted": "rgba(255, 255, 255, 0.55)",
    "--txt": "#ffffff",
  } as React.CSSProperties;
}

/* ── Decorative elements per tab ───────────────────────────────────── */

function DecorativeElements({
  tab,
  f,
  accentColor,
}: {
  tab: Tab;
  f: ReturnType<typeof tabFlags>;
  accentColor: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${f.isPluginsLike ? "" : "rounded-[16px]"}`}
    >
      {f.isSkills && (
        <>
          <div
            className={`absolute bottom-4 left-4 text-[${accentColor}]/30 text-[9px] font-mono tracking-widest transform -rotate-90 origin-bottom-left`}
          >
            V.1.0.4_NEURAL_UPLINK
          </div>
          <div
            className={`absolute top-[20%] right-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`}
          />
          <div
            className={`absolute bottom-[20%] left-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`}
          />
        </>
      )}
      {f.isSettings && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-white/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-white/15" />
          <div className="absolute bottom-3 right-4 text-white/15 text-[9px] font-mono tracking-widest">
            CFG.PANEL_V2
          </div>
        </>
      )}
      {f.isAdvancedOverlay && !f.isLifo && !f.isStream && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-white/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-white/15" />
          <div className="absolute bottom-3 right-4 text-white/15 text-[9px] font-mono tracking-widest">
            ADV.PANEL_V1
          </div>
        </>
      )}
      {f.isLifo && (
        <>
          <div className="absolute top-[12%] right-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#8b5cf6]/25 to-transparent" />
          <div className="absolute bottom-[12%] left-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#8b5cf6]/25 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-[#8b5cf6]/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-[#8b5cf6]/15" />
          <div className="absolute bottom-3 right-4 text-[#8b5cf6]/20 text-[9px] font-mono tracking-widest">
            LIFO.SANDBOX_V1
          </div>
        </>
      )}
      {f.isStream && (
        <>
          <div className="absolute top-[12%] right-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
          <div className="absolute bottom-[12%] left-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
          <div className="absolute top-3 right-4 text-[#ef4444]/20 text-[9px] font-mono tracking-widest">
            STREAM.LIVE_V1
          </div>
        </>
      )}
      {f.isKnowledge && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
          <div className="absolute bottom-3 right-4 text-[#a78bfa]/20 text-[9px] font-mono tracking-widest">
            KNOW.BASE_V1
          </div>
        </>
      )}
      {f.isWallets && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#f0b90b]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#f0b90b]/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-[#f0b90b]/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-[#f0b90b]/15" />
          <div className="absolute bottom-3 right-4 text-[#f0b90b]/20 text-[9px] font-mono tracking-widest">
            WALLET.BSC_V1
          </div>
        </>
      )}
      {f.isApps && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
          <div className="absolute bottom-3 right-4 text-[#10b981]/20 text-[9px] font-mono tracking-widest">
            APP.PANEL_V1
          </div>
        </>
      )}
      {f.isCharacter && (
        <>
          <div className="absolute top-6 left-10 flex flex-col">
            <div className="text-white text-2xl font-semibold tracking-wide flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
              Agent Details
            </div>
          </div>
          <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full border border-white/5 opacity-50 pointer-events-none" />
          <div className="absolute top-[5%] right-[5%] w-[20vw] h-[20vw] rounded-full border border-[#d4af37]/10 opacity-30 pointer-events-none" />
        </>
      )}
    </div>
  );
}

/* ── Close button (X) ──────────────────────────────────────────────── */

function CloseButton({
  centered,
  onClick,
}: {
  centered: boolean;
  onClick: () => void;
}) {
  if (centered) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 z-50 p-2 rounded-full text-white/60 hover:text-white bg-[#0d1117] hover:bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.7)] w-9 h-9 transition-all flex items-center justify-center"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute z-50 top-6 right-6 p-2 rounded-full text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] w-10 h-10 transition-all flex items-center justify-center"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export interface CompanionShellProps {
  tab: Tab;
  actionNotice: { text: string; tone: string } | null;
}

export function CompanionShell({ tab, actionNotice }: CompanionShellProps) {
  const { setTab } = useApp();
  const f = tabFlags(tab);
  const accentColor = ACCENT_COLORS[tab] ?? "#d4af37";
  const topBarColor =
    f.isSettings || f.isAdvancedOverlay
      ? "rgba(210, 205, 200, 0.7)"
      : (TOP_BAR_COLORS[tab] ?? "#d4af37");
  const shadowFx = f.isSkills
    ? "shadow-[0_0_50px_rgba(0,225,255,0.15)]"
    : "shadow-[0_4px_30px_rgba(0,0,0,0.5)]";
  const showOverlayContent =
    f.isSkills ||
    f.isCharacter ||
    f.isSettings ||
    f.isPlugins ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isKnowledge ||
    f.isLifo ||
    f.isStream ||
    f.isWallets;

  const close = () => setTab("companion");

  return (
    <div className="relative w-full h-[100vh] overflow-hidden bg-[#0a0c12]">
      <CompanionView />

      {/* Overlay on top of CompanionView */}
      <div
        className={`absolute inset-0 z-[60] flex ${f.isCentered ? "items-center justify-center" : "justify-end"} transition-all duration-300 pointer-events-none ${overlayBackdropClass(tab, f)}`}
      >
        {showOverlayContent && (
          <div
            className={
              f.isCentered ? "relative pointer-events-auto" : "contents"
            }
          >
            <div
              className={`relative flex flex-col pointer-events-auto ${cardSizeClass(f)} transition-all duration-500`}
              style={{
                background: cardBackground(f),
                borderColor: cardBorderColor(f),
                boxShadow: cardBoxShadow(f, shadowFx),
                borderTopRightRadius: f.isPluginsLike
                  ? "0"
                  : f.isCentered
                    ? "1rem"
                    : "0",
                borderBottomLeftRadius: f.isPluginsLike
                  ? "0"
                  : f.isCentered
                    ? "1rem"
                    : "0",
              }}
            >
              {/* Top bar accent line */}
              {f.isCharacter && (
                <div className="absolute top-0 left-0 right-0 h-[1px] opacity-100 flex justify-center">
                  <div
                    className="w-1/2 h-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.8), transparent)",
                    }}
                  />
                </div>
              )}
              {f.isCentered && !f.isPluginsLike && (
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
                  style={{
                    background: `linear-gradient(to right, transparent, ${topBarColor}, transparent)`,
                  }}
                />
              )}

              <DecorativeElements tab={tab} f={f} accentColor={accentColor} />

              {/* Close button — non-centered (side panel) only */}
              {!f.isCentered && (
                <CloseButton centered={false} onClick={close} />
              )}

              {/* View content with overridden CSS variables */}
              <div
                className={`flex-1 min-h-0 ${viewWrapperOverflow(f)} ${viewWrapperPadding(f)} custom-scrollbar text-white anime-theme-scope relative z-10`}
                style={viewWrapperStyle(tab, f, accentColor)}
              >
                {f.isSkills && <SkillsView inModal />}
                {f.isCharacter && <CharacterView inModal />}
                {f.isSettings && <SettingsView inModal />}
                {f.isPlugins && <PluginsView inModal />}
                {f.isAdvancedOverlay && <AdvancedPageView inModal />}
                {f.isApps && <AppsPageView inModal />}
                {f.isConnectors && <ConnectorsPageView inModal />}
                {f.isKnowledge && <KnowledgeView inModal />}
                {f.isLifo && <LifoSandboxView inModal />}
                {f.isStream && <StreamView inModal />}
                {f.isWallets && <InventoryView inModal />}
              </div>
            </div>
            {/* Close button — centered modal, outside card */}
            {f.isCentered && <CloseButton centered onClick={close} />}
          </div>
        )}
      </div>
    </div>
  );
}
