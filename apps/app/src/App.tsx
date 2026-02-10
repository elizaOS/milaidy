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
import { WidgetSidebar } from "./components/WidgetSidebar.js";
import { FeaturesView, ConnectorsView } from "./components/PluginsView.js";
import { SkillsView } from "./components/SkillsView.js";
import { InventoryView } from "./components/InventoryView.js";
import { CharacterView } from "./components/CharacterView.js";
import { ConfigView } from "./components/ConfigView.js";
import { AdminView } from "./components/AdminView.js";
import { AppsView } from "./components/AppsView.js";
import { GameView } from "./components/GameView.js";
import { LoadingScreen } from "./components/LoadingScreen.js";

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat": return <ChatView />;
    case "apps": return <AppsView />;
    case "game": return <GameView />;
    case "inventory": return <InventoryView />;
    case "features": return <FeaturesView />;
    case "connectors": return <ConnectorsView />;
    case "skills": return <SkillsView />;
    case "character": return <CharacterView />;
    case "config": return <ConfigView />;
    case "admin": return <AdminView />;
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
            <WidgetSidebar />
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
