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
import { SettingsView } from "./components/SettingsView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { useContextMenu } from "./hooks/useContextMenu.js";
import { TerminalPanel } from "./components/TerminalPanel.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat": return <ChatView />;
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
    authRequired,
    onboardingComplete,
    tab,
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

  // DEV: skip loading/auth gates when API is unavailable
  // if (onboardingLoading) {
  //   return <LoadingScreen phase={startupPhase} />;
  // }

  // if (authRequired) return <PairingView />;
  // if (!onboardingComplete) return <OnboardingWizard />;

  const isChat = tab === "chat";
  const isAdvancedTab =
    tab === "advanced" ||
    tab === "plugins" ||
    tab === "skills" ||
    tab === "actions" ||
    tab === "triggers" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "logs";

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
          <main className={`flex-1 min-h-0 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto py-6 px-5"}`}>
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
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${
            actionNotice.tone === "error" ? "bg-danger" :
            actionNotice.tone === "success" ? "bg-ok" : "bg-accent"
          }`}
        >
          {actionNotice.text}
        </div>
      )}
    </>
  );
}
