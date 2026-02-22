/**
 * Root App component — routing shell.
 */

import { useState, useEffect, useCallback } from "react";
import { useApp } from "./AppContext.js";
import { Header } from "./components/Header.js";
import { Nav } from "./components/Nav.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { EmotePicker } from "./components/EmotePicker.js";
import { SaveCommandModal } from "./components/SaveCommandModal.js";
import { PairingView } from "./components/PairingView.js";
import { OnboardingWizard } from "./components/OnboardingWizard.js";
import { ChatView } from "./components/ChatView.js";
import { ConversationsSidebar } from "./components/ConversationsSidebar.js";
import { AutonomousPanel } from "./components/AutonomousPanel.js";
import { CustomActionsPanel } from "./components/CustomActionsPanel.js";
import { CustomActionEditor } from "./components/CustomActionEditor.js";
import { AppsPageView } from "./components/AppsPageView.js";
import { AdvancedPageView } from "./components/AdvancedPageView.js";
import { CharacterView } from "./components/CharacterView.js";
import { ConnectorsPageView } from "./components/ConnectorsPageView.js";
import { InventoryView } from "./components/InventoryView.js";
import { KnowledgeView } from "./components/KnowledgeView.js";
import { CompanionView } from "./components/CompanionView.js";
import { SettingsView } from "./components/SettingsView.js";
import { PluginsView } from "./components/PluginsView.js";
import { SkillsView } from "./components/SkillsView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { useContextMenu } from "./hooks/useContextMenu.js";
import { TerminalPanel } from "./components/TerminalPanel.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat": return <ChatView />;
    case "companion": return <CompanionView />;
    case "apps": return <AppsPageView />;
    case "character": return <CharacterView />;
    case "wallets": return <InventoryView />;
    case "knowledge": return <KnowledgeView />;
    case "connectors": return <ConnectorsPageView />;
    case "voice":
    case "settings": return <SettingsView />;
    default: return <ChatView />;
  }
}

export function App() {
  const {
    onboardingLoading,
    startupPhase,
    uiLanguage,
    authRequired,
    onboardingComplete,
    tab,
    setTab,
    actionNotice,
  } = useApp();
  const contextMenu = useContextMenu();

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<import("./api-client").CustomActionDef | null>(null);

  // Keep hook order stable across onboarding/auth state transitions.
  // Otherwise React can throw when onboarding completes and the main shell mounts.
  useEffect(() => {
    const handler = () => setCustomActionsPanelOpen((v) => !v);
    window.addEventListener("toggle-custom-actions-panel", handler);
    return () => window.removeEventListener("toggle-custom-actions-panel", handler);
  }, []);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
  }, []);

  if (onboardingLoading) {
    return <LoadingScreen phase={startupPhase} lang={uiLanguage} />;
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  const isChat = tab === "chat";
  const isAdvanced = tab === "advanced" || tab === "actions" || tab === "triggers" ||
    tab === "fine-tuning" || tab === "trajectories" || tab === "runtime" ||
    tab === "database" || tab === "logs";
  const isApps = tab === "apps";
  const isConnectors = tab === "connectors";
  const isKnowledge = tab === "knowledge";

  if (tab === "companion" || tab === "skills" || tab === "character" || tab === "settings" || tab === "plugins" || isAdvanced || isApps || isConnectors || isKnowledge) {
    const isSkills = tab === "skills";
    const isSettings = tab === "settings";
    const isPlugins = tab === "plugins";
    const isCentered = isSkills || isSettings || isPlugins || isAdvanced || isApps || isConnectors || isKnowledge;
    const accentColor = isSkills ? "#00e1ff" : isApps ? "#10b981" : isConnectors ? "#f472b6" : isKnowledge ? "#a78bfa" : "#d4af37";
    const sysTag = isSkills ? "SYS.MIND_MATRIX" : isSettings ? "SYS.CONFIG" : isPlugins ? "SYS.EQUIPMENT" : isAdvanced ? "SYS.ADVANCED" : isApps ? "SYS.APPS" : isConnectors ? "SYS.SOCIAL" : isKnowledge ? "SYS.KNOWLEDGE" : "";
    const sysTagColor = isSkills ? "#00e1ff" : isPlugins ? "#f0b232" : isApps ? "#10b981" : isConnectors ? "#f472b6" : isKnowledge ? "#a78bfa" : "rgba(255,255,255,0.35)";
    const sysTagBg = isSkills ? "rgba(0,225,255,0.06)" : isPlugins ? "rgba(240,178,50,0.06)" : isApps ? "rgba(16,185,129,0.06)" : isConnectors ? "rgba(244,114,182,0.06)" : isKnowledge ? "rgba(167,139,250,0.06)" : "rgba(255,255,255,0.04)";
    const sysTagBorder = isSkills ? "rgba(0,225,255,0.20)" : isPlugins ? "rgba(240,178,50,0.20)" : isApps ? "rgba(16,185,129,0.20)" : isConnectors ? "rgba(244,114,182,0.20)" : isKnowledge ? "rgba(167,139,250,0.20)" : "rgba(255,255,255,0.10)";
    const topBarColor = isSkills ? "#00e1ff" : isSettings || isAdvanced ? "rgba(210, 205, 200, 0.7)" : isPlugins ? "#f0b232" : isApps ? "rgba(16, 185, 129, 0.7)" : isConnectors ? "rgba(244, 114, 182, 0.7)" : isKnowledge ? "rgba(167, 139, 250, 0.7)" : "#d4af37";
    const cardColor = isSkills ? "rgba(20, 24, 38, 0.85)" : "rgba(10, 12, 16, 0.75)";
    const shadowFx = isSkills ? "shadow-[0_0_50px_rgba(0,225,255,0.15)]" : "shadow-[0_4px_30px_rgba(0,0,0,0.5)]";
    const overlayBackdropClass = tab === "skills"
      ? "opacity-100 backdrop-blur-2xl bg-black/40 pointer-events-auto"
      : tab === "plugins"
        ? "opacity-100 backdrop-blur-xl bg-black/35 pointer-events-auto"
        : tab === "settings" || isAdvanced || isApps || isConnectors || isKnowledge
          ? "opacity-100 backdrop-blur-2xl bg-black/50 pointer-events-auto"
          : tab === "character"
            ? "opacity-100"
            : "opacity-0";

    return (
      <>
        <div className="relative w-full h-[100vh] overflow-hidden bg-[#0a0c12]">
          <CompanionView />

          {/* Hub Modals (Overlay on top of CompanionView) */}
          {/* Hub Modals (Overlay on top of CompanionView) */}
          <div className={`absolute inset-0 z-[60] flex ${isCentered ? 'items-center justify-center' : 'justify-end'} transition-all duration-300 pointer-events-none ${overlayBackdropClass}`}>
            {(tab === "skills" || tab === "character" || tab === "settings" || tab === "plugins" || isAdvanced || isApps || isConnectors || isKnowledge) && (
              <div className={isCentered ? "relative pointer-events-auto" : "contents"}>
              <div className={`relative flex flex-col pointer-events-auto ${isSkills ? 'w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl' : isPlugins ? 'w-[97vw] h-[92vh] md:w-[88vw] md:h-[80vh] max-w-[1460px] overflow-visible' : isAdvanced ? 'w-[95vw] h-[95vh] max-w-[1500px] backdrop-blur-3xl border rounded-2xl overflow-hidden' : isSettings || isApps || isConnectors || isKnowledge ? 'w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl overflow-hidden' : 'w-[65vw] min-w-[700px] h-[100vh] border-l backdrop-blur-2xl'} transition-all duration-500`}
                style={{
                  background: isSkills
                    ? cardColor
                    : isPlugins
                      ? "transparent"
                      : isSettings || isAdvanced || isApps || isConnectors || isKnowledge
                        ? "rgba(18, 22, 32, 0.92)"
                        : "linear-gradient(to left, rgba(6, 8, 12, 0.95) 40%, rgba(6, 8, 12, 0.7) 80%, rgba(6, 8, 12, 0.2) 100%)",
                  borderColor: isSkills
                    ? "rgba(0,225,255,0.2)"
                    : isPlugins
                      ? "transparent"
                      : isSettings || isAdvanced || isApps || isConnectors || isKnowledge
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(255,255,255,0.05)",
                  boxShadow: isSkills
                    ? shadowFx
                    : isPlugins
                      ? "none"
                      : isSettings || isAdvanced || isApps || isConnectors || isKnowledge
                        ? "0 8px 60px rgba(0,0,0,0.6), 0 2px 24px rgba(0,0,0,0.4)"
                        : "-60px 0 100px -20px rgba(0,0,0,0.8)",
                  borderTopRightRadius: isPlugins ? '0' : isCentered ? '1rem' : '0',
                  borderBottomLeftRadius: isPlugins ? '0' : isCentered ? '1rem' : '0'
                }}>

                {/* Top bar accent line */}
                {tab === "character" && (
                  <div className="absolute top-0 left-0 right-0 h-[1px] opacity-100 flex justify-center">
                    <div className="w-1/2 h-full" style={{ background: `linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.8), transparent)` }} />
                  </div>
                )}
                {isCentered && !isPlugins && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] opacity-80" style={{ background: `linear-gradient(to right, transparent, ${topBarColor}, transparent)` }} />
                )}


                {/* Decorative Elements */}
                <div className={`pointer-events-none absolute inset-0 overflow-hidden ${isPlugins ? "" : "rounded-[16px]"}`}>
                  {isSkills && (
                    <>
                      <div className={`absolute bottom-4 left-4 text-[${accentColor}]/30 text-[9px] font-mono tracking-widest transform -rotate-90 origin-bottom-left`}>
                        V.1.0.4_NEURAL_UPLINK
                      </div>
                      <div className={`absolute top-[20%] right-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`} />
                      <div className={`absolute bottom-[20%] left-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`} />
                    </>
                  )}
                  {isSettings && (
                    <>
                      {/* Side accent lines */}
                      <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
                      <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
                      {/* Corner accents — bottom-left */}
                      <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-white/15" />
                      <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-white/15" />
                      {/* Bottom-right version text */}
                      <div className="absolute bottom-3 right-4 text-white/15 text-[9px] font-mono tracking-widest">
                        CFG.PANEL_V2
                      </div>
                    </>
                  )}
                  {isAdvanced && (
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
                  {isApps && (
                    <>
                      <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
                      <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
                      <div className="absolute bottom-3 right-4 text-[#10b981]/20 text-[9px] font-mono tracking-widest">
                        APP.PANEL_V1
                      </div>
                    </>
                  )}
                  {tab === "character" && (
                    <>
                      {/* Honkai Star Rail / Elegant Gacha UI Decorations */}
                      <div className="absolute top-6 left-10 flex flex-col">
                        <div className="text-white text-2xl font-semibold tracking-wide flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
                          Agent Details
                        </div>
                      </div>

                      {/* Subtle background astrolabe/circle elements */}
                      <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full border border-white/5 opacity-50 pointer-events-none" />
                      <div className="absolute top-[5%] right-[5%] w-[20vw] h-[20vw] rounded-full border border-[#d4af37]/10 opacity-30 pointer-events-none" />
                    </>
                  )}
                </div>

                {/* Close Modal Button — character (non-centered) modal only */}
                {!isCentered && (
                  <button
                    onClick={() => setTab("companion")}
                    className="absolute z-50 top-6 right-6 p-2 rounded-full text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] w-10 h-10 transition-all flex items-center justify-center"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}

                {/* View Wrapper with Overridden CSS Variables */}
                <div
                  className={`flex-1 min-h-0 ${isPlugins ? 'overflow-visible' : isSettings || isAdvanced || isApps || isConnectors ? 'overflow-hidden' : 'overflow-y-auto'} ${isSkills ? 'px-10 pb-10 pt-4' : isSettings || isAdvanced || isApps || isConnectors || isPlugins ? 'p-0' : isKnowledge ? 'px-8 py-8' : 'px-16 pt-32 pb-16'} custom-scrollbar text-white anime-theme-scope relative z-10`}
                  style={isSettings || isPlugins || isAdvanced || isApps || isConnectors || isKnowledge ? {
                    // Dark theme vars — matches dark semi-transparent content area
                    "--bg": "transparent",
                    "--card": "rgba(255, 255, 255, 0.05)",
                    "--border": "rgba(255, 255, 255, 0.08)",
                    "--accent": isPlugins ? "#f0b232" : isApps ? "#10b981" : isConnectors ? "#f472b6" : isKnowledge ? "#a78bfa" : "#7b8fb5",
                    "--accent-foreground": "#ffffff",
                    "--accent-subtle": isPlugins ? "rgba(240, 178, 50, 0.12)" : isApps ? "rgba(16, 185, 129, 0.12)" : isConnectors ? "rgba(244, 114, 182, 0.12)" : isKnowledge ? "rgba(167, 139, 250, 0.12)" : "rgba(123, 143, 181, 0.12)",
                    "--accent-rgb": isPlugins ? "240, 178, 50" : isApps ? "16, 185, 129" : isConnectors ? "244, 114, 182" : isKnowledge ? "167, 139, 250" : "123, 143, 181",
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
                  } as React.CSSProperties : {
                    "--bg": "transparent",
                    "--card": isSkills ? "rgba(255, 255, 255, 0.05)" : "transparent",
                    "--border": isSkills ? "rgba(0,225,255,0.3)" : "rgba(255,255,255,0.08)",
                    "--accent": accentColor,
                    "--accent-foreground": isSkills ? "#000000" : "#ffffff",
                    "--muted": "rgba(255, 255, 255, 0.55)",
                    "--txt": "#ffffff",
                  } as React.CSSProperties}
                >
                  {tab === "skills" && <SkillsView />}
                  {tab === "character" && <CharacterView inModal={true} />}
                  {tab === "settings" && <SettingsView inModal={true} />}
                  {tab === "plugins" && <PluginsView inModal={true} />}
                  {isAdvanced && <AdvancedPageView inModal={true} />}
                  {isApps && <AppsPageView inModal={true} />}
                  {isConnectors && <ConnectorsPageView inModal={true} />}
                  {isKnowledge && <KnowledgeView />}
                </div>
              </div>
              {/* Close button — outside the modal card, anchored to its top-right corner */}
              {isCentered && (
                <button
                  onClick={() => setTab("companion")}
                  className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 z-50 p-2 rounded-full text-white/60 hover:text-white bg-[#0d1117] hover:bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.7)] w-9 h-9 transition-all flex items-center justify-center"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
              </div>
            )}
          </div>
        </div>
        <CommandPalette />
        <EmotePicker />
        {actionNotice && (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${actionNotice.tone === "error" ? "bg-danger" :
              actionNotice.tone === "success" ? "bg-ok" : "bg-accent"
              }`}
          >
            {actionNotice.text}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {isChat ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <div className="flex flex-1 min-h-0 relative">
            <ConversationsSidebar />
            <main className="flex flex-col flex-1 min-w-0 overflow-visible pt-3 px-5">
              <ChatView />
            </main>
            <AutonomousPanel />
            <CustomActionsPanel
              open={customActionsPanelOpen}
              onClose={() => setCustomActionsPanelOpen(false)}
              onOpenEditor={(action) => {
                setEditingAction(action ?? null);
                setCustomActionsEditorOpen(true);
              }}
            />
          </div>
          <TerminalPanel />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main className="flex-1 min-h-0 py-6 px-5 overflow-y-auto">
            <ViewRouter />
          </main>
          <TerminalPanel />
        </div>
      )}
      <CommandPalette />
      <EmotePicker />
      <SaveCommandModal
        open={contextMenu.saveCommandModalOpen}
        text={contextMenu.saveCommandText}
        onSave={contextMenu.confirmSaveCommand}
        onClose={contextMenu.closeSaveCommandModal}
      />
      <CustomActionEditor
        open={customActionsEditorOpen}
        action={editingAction}
        onSave={handleEditorSave}
        onClose={() => { setCustomActionsEditorOpen(false); setEditingAction(null); }}
      />
      {actionNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${actionNotice.tone === "error" ? "bg-danger" :
            actionNotice.tone === "success" ? "bg-ok" : "bg-accent"
            }`}
        >
          {actionNotice.text}
        </div>
      )}
    </>
  );
}
