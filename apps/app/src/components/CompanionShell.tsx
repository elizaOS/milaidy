/**
 * Companion shell — renders tab views as overlay panels on top of CompanionView.
 *
 * This is the canonical Milady desktop shell. Legacy chat/native entry points
 * now resolve into this surface instead of maintaining competing layouts.
 */

import type { Tab } from "@milady/app-core/navigation";
import { useApp } from "../AppContext";
import { AdvancedPageView } from "./AdvancedPageView";
import { AppsPageView } from "./AppsPageView";
import { CharacterView } from "./CharacterView";
import { CloseButton, DecorativeElements } from "./CompanionShellDecorations";
import { CompanionView } from "./CompanionView";
import { ConnectorsPageView } from "./ConnectorsPageView";
import {
  ACCENT_COLORS,
  cardBackground,
  cardBorderColor,
  cardBoxShadow,
  cardSizeClass,
  overlayBackdropClass,
  TOP_BAR_COLORS,
  tabFlags,
  viewWrapperOverflow,
  viewWrapperPadding,
  viewWrapperStyle,
} from "./companion-shell-styles";
import { InventoryView } from "./InventoryView";
import { KnowledgeView } from "./KnowledgeView";
import { LifoSandboxView } from "./LifoSandboxView";
import { PluginsView } from "./PluginsView";
import { SettingsView } from "./SettingsView";
import { SkillsView } from "./SkillsView";
import { StreamView } from "./StreamView";

export { COMPANION_OVERLAY_TABS } from "./companion-shell-styles";

/* ── Main component ────────────────────────────────────────────────── */

export interface CompanionShellProps {
  tab: Tab;
  actionNotice: { text: string; tone: string } | null;
}

export function CompanionShell({ tab }: CompanionShellProps) {
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

  const close = () => setTab("chat");

  return (
    <div className="relative w-full h-[100vh] overflow-hidden bg-[#0a0c12]">
      <CompanionView />

      {/* Overlay on top of CompanionView */}
      <div
        className={`absolute inset-0 z-[60] flex ${f.isCentered ? "items-center justify-center" : "justify-end"} transition-all duration-300 pointer-events-none ${overlayBackdropClass(f)}`}
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
                style={viewWrapperStyle(f, accentColor)}
              >
                {f.isSkills && <SkillsView inModal />}
                {f.isCharacter && <CharacterView inModal />}
                {f.isSettings && <SettingsView inModal onClose={close} />}
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
