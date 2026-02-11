/**
 * Root App component — routing shell.
 */

import { useApp } from "./AppContext.js";
import { Header } from "./components/Header.js";
import { Nav } from "./components/Nav.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { EmotePicker } from "./components/EmotePicker.js";
import { PairingView } from "./components/PairingView.js";
import { OnboardingWizard } from "./components/OnboardingWizard.js";
import { ChatView } from "./components/ChatView.js";
import { ConversationsSidebar } from "./components/ConversationsSidebar.js";
import { AutonomousPanel } from "./components/AutonomousPanel.js";
import { AgentView } from "./components/AgentView.js";
import { AppsPageView } from "./components/AppsPageView.js";
import { PluginsPageView } from "./components/PluginsPageView.js";
import { ConfigPageView } from "./components/ConfigPageView.js";
import { DatabasePageView } from "./components/DatabasePageView.js";
import { SettingsView } from "./components/SettingsView.js";
import { LogsPageView } from "./components/LogsPageView.js";
import { GameView } from "./components/GameView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat": return <ChatView />;
    case "apps": return <AppsPageView />;
    case "game": return <GameView />;
    case "agent": return <AgentView />;
    case "plugins": return <PluginsPageView />;
    case "config": return <ConfigPageView />;
    case "database": return <DatabasePageView />;
    case "settings": return <SettingsView />;
    case "logs": return <LogsPageView />;
    default: return <ChatView />;
  }
}

export function App() {
  const { onboardingLoading, authRequired, onboardingComplete, tab, actionNotice } = useApp();

  if (onboardingLoading) {
    return <LoadingScreen />;
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  const isChat = tab === "chat";

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
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main className="flex-1 min-h-0 py-6 px-5 overflow-y-auto">
            <ViewRouter />
          </main>
        </div>
      )}
      <CommandPalette />
      <EmotePicker />
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
