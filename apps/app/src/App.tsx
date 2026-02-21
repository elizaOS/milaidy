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
    case "advanced":
    case "plugins":
    case "skills":
    case "actions":
    case "triggers":
    case "fine-tuning":
    case "trajectories":
    case "runtime":
    case "database":
    case "logs":
      return <AdvancedPageView />;
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
  const isAdvancedTab =
    tab === "advanced" ||
    tab === "plugins" ||
    tab === "actions" ||
    tab === "triggers" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "logs";

  if (tab === "companion" || tab === "skills" || tab === "character") {
    const isSkills = tab === "skills";
    const accentColor = isSkills ? "#00e1ff" : "#d4af37"; // Cyan for skills, Star Rail Gold for Character
    const cardColor = isSkills ? "rgba(20, 24, 38, 0.85)" : "rgba(10, 12, 16, 0.75)";
    const shadowFx = isSkills ? "shadow-[0_0_50px_rgba(0,225,255,0.15)]" : "shadow-[0_4px_30px_rgba(0,0,0,0.5)]";

    return (
      <>
        <div className="relative w-full h-[100vh] overflow-hidden bg-[#0a0c12]">
          <CompanionView />

          {/* Hub Modals (Overlay on top of CompanionView) */}
          <div className={`absolute inset-0 z-[60] flex items-center justify-center transition-all duration-300 ${tab === "skills" || tab === "character" ? "opacity-100 backdrop-blur-2xl bg-black/40" : "opacity-0 pointer-events-none"
            }`}>
            {(tab === "skills" || tab === "character") && (
              <div className={`relative w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border flex flex-col pt-6 ${shadowFx} transition-all duration-500`}
                style={{
                  backgroundColor: cardColor,
                  borderColor: `rgba(${isSkills ? '0,225,255' : '255,255,255'}, ${isSkills ? '0.2' : '0.1'})`,
                  borderRadius: isSkills ? '1rem' : '16px',
                  borderTopRightRadius: isSkills ? '1rem' : '16px',
                  borderBottomLeftRadius: isSkills ? '1rem' : '16px'
                }}>

                {/* Top bar decoration */}
                {!isSkills && (
                  <div className="absolute top-0 left-0 right-0 h-[1px] opacity-100 flex justify-center">
                    <div className="w-1/2 h-full" style={{ background: `linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.8), transparent)` }} />
                  </div>
                )}
                {isSkills && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] opacity-80" style={{ background: `linear-gradient(to right, transparent, ${accentColor}, transparent)` }} />
                )}

                {/* Decorative Elements */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[16px]">
                  {isSkills && (
                    <>
                      <div className={`absolute top-0 left-6 px-4 py-1.5 bg-[${accentColor}]/10 border-b border-l border-r border-[${accentColor}]/30 text-[${accentColor}] text-[10px] font-mono tracking-[0.2em] font-bold`} style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 6px) 100%, 6px 100%)" }}>
                        SYS.MIND_MATRIX // ACTIVE
                      </div>
                      <div className={`absolute bottom-4 left-4 text-[${accentColor}]/30 text-[9px] font-mono tracking-widest transform -rotate-90 origin-bottom-left`}>
                        V.1.0.4_NEURAL_UPLINK
                      </div>
                      <div className={`absolute top-[20%] right-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`} />
                      <div className={`absolute bottom-[20%] left-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`} />
                    </>
                  )}
                  {!isSkills && (
                    <>
                      {/* Honkai Star Rail / Elegant Gacha UI Decorations */}
                      <div className="absolute top-6 left-10 flex flex-col">
                        <div className="text-white text-2xl font-semibold tracking-wide flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
                          Agent Details
                        </div>
                        <div className="text-white/30 text-xs font-mono tracking-widest mt-1 uppercase">
                          Stellar Configuration Data
                        </div>
                      </div>

                      {/* Subtle background astrolabe/circle elements */}
                      <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full border border-white/5 opacity-50 pointer-events-none" />
                      <div className="absolute top-[5%] right-[5%] w-[20vw] h-[20vw] rounded-full border border-[#d4af37]/10 opacity-30 pointer-events-none" />
                    </>
                  )}
                </div>

                {/* Close Modal Button */}
                <button
                  onClick={() => setTab("companion")}
                  className={`absolute top-6 right-6 z-50 p-2 rounded-full transition-all flex items-center justify-center ${isSkills
                      ? 'text-white/70 hover:text-white hover:bg-white/10'
                      : 'text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] w-10 h-10'
                    }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isSkills ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>

                {/* View Wrapper with Overridden CSS Variables */}
                <div
                  className={`flex-1 overflow-y-auto px-10 pb-10 ${isSkills ? 'pt-6' : 'pt-24'} custom-scrollbar text-white anime-theme-scope relative z-10`}
                  style={{
                    "--bg": "transparent",
                    "--card": isSkills ? "rgba(255, 255, 255, 0.05)" : "rgba(20, 22, 28, 0.6)",
                    "--border": `rgba(${isSkills ? '0,225,255' : '255,255,255'}, ${isSkills ? '0.3' : '0.1'})`,
                    "--accent": accentColor,
                    "--accent-foreground": isSkills ? "#000000" : "#ffffff",
                    "--muted": isSkills ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.4)",
                    "--txt": "#ffffff",
                  } as React.CSSProperties}
                >
                  {tab === "skills" && <SkillsView />}
                  {tab === "character" && <CharacterView inModal={true} />}
                </div>
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
          <main className={`flex-1 min-h-0 py-6 px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}>
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
