/**
 * Root App component — routing shell.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { AdvancedPageView } from "./components/AdvancedPageView";
import { AppsPageView } from "./components/AppsPageView";
import { AutonomousPanel } from "./components/AutonomousPanel";
import { BugReportModal } from "./components/BugReportModal";
import { CharacterView } from "./components/CharacterView";
import { ChatView } from "./components/ChatView";
import { CommandPalette } from "./components/CommandPalette";
import { ConnectorsPageView } from "./components/ConnectorsPageView";
import { ConversationsSidebar } from "./components/ConversationsSidebar";
import { CustomActionEditor } from "./components/CustomActionEditor";
import { CustomActionsPanel } from "./components/CustomActionsPanel";
import { EmotePicker } from "./components/EmotePicker";
import { GameViewOverlay } from "./components/GameViewOverlay";
import { Header } from "./components/Header";
import { InventoryView } from "./components/InventoryView";
import { KnowledgeView } from "./components/KnowledgeView";
import { LoadingScreen } from "./components/LoadingScreen";
import { Nav } from "./components/Nav";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PairingView } from "./components/PairingView";
import { RestartBanner } from "./components/RestartBanner";
import { SaveCommandModal } from "./components/SaveCommandModal";
import { SettingsView } from "./components/SettingsView";
import { StartupFailureView } from "./components/StartupFailureView";
import { TerminalPanel } from "./components/TerminalPanel";
import { BugReportProvider, useBugReportState } from "./hooks/useBugReport";
import { useContextMenu } from "./hooks/useContextMenu";
import { APPS_ENABLED } from "./navigation";

const CHAT_MOBILE_BREAKPOINT_PX = 1024;

function ViewRouter() {
  const { tab } = useApp();
  switch (tab) {
    case "chat":
      return <ChatView />;
    case "apps":
      // Apps disabled in production builds; fall through to chat
      return APPS_ENABLED ? <AppsPageView /> : <ChatView />;
    case "character":
      return <CharacterView />;
    case "wallets":
      return <InventoryView />;
    case "knowledge":
      return <KnowledgeView />;
    case "connectors":
      return <ConnectorsPageView />;
    case "advanced":
    case "plugins":
    case "skills":
    case "actions":
    case "triggers":
    case "fine-tuning":
    case "trajectories":
    case "runtime":
    case "database":
    case "lifo":
    case "logs":
    case "security":
      return <AdvancedPageView />;
    case "voice":
    case "settings":
      return <SettingsView />;
    default:
      return <ChatView />;
  }
}

export function App() {
  const {
    onboardingLoading,
    startupPhase,
    startupError,
    authRequired,
    onboardingComplete,
    retryStartup,
    tab,
    actionNotice,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
  } = useApp();
  const contextMenu = useContextMenu();

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    import("./api-client").CustomActionDef | null
  >(null);
  const [isChatMobileLayout, setIsChatMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX
      : false,
  );
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [mobileAutonomousOpen, setMobileAutonomousOpen] = useState(false);

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
    tab === "lifo" ||
    tab === "logs" ||
    tab === "security";
  const unreadCount = unreadConversations?.size ?? 0;
  const statusIndicatorClass =
    agentStatus?.state === "running"
      ? "bg-ok shadow-[0_0_8px_color-mix(in_srgb,var(--ok)_60%,transparent)]"
      : agentStatus?.state === "paused" ||
          agentStatus?.state === "starting" ||
          agentStatus?.state === "restarting"
        ? "bg-warn"
        : agentStatus?.state === "error"
          ? "bg-danger"
          : "bg-muted";
  const mobileChatControls = isChatMobileLayout ? (
    <div className="flex items-center gap-2 w-max">
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
          mobileConversationsOpen
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border bg-card text-txt hover:border-accent hover:text-accent"
        }`}
        onClick={() => {
          setMobileAutonomousOpen(false);
          setMobileConversationsOpen(true);
        }}
        aria-label="Open chats panel"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <title>Chats</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chats
        {unreadCount > 0 && (
          <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
          mobileAutonomousOpen
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border bg-card text-txt hover:border-accent hover:text-accent"
        }`}
        onClick={() => {
          setMobileConversationsOpen(false);
          setMobileAutonomousOpen(true);
        }}
        aria-label="Open status panel"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <title>Status</title>
          <path d="M3 3v18h18" />
          <path d="m7 14 4-4 3 3 5-6" />
        </svg>
        Status
        <span
          className={`w-2 h-2 rounded-full ${statusIndicatorClass}`}
          aria-hidden
        />
      </button>
    </div>
  ) : undefined;

  // Keep hook order stable across onboarding/auth state transitions.
  // Otherwise React can throw when onboarding completes and the main shell mounts.
  useEffect(() => {
    const handler = () => setCustomActionsPanelOpen((v) => !v);
    window.addEventListener("toggle-custom-actions-panel", handler);
    return () =>
      window.removeEventListener("toggle-custom-actions-panel", handler);
  }, []);

  const handleEditorSave = useCallback(() => {
    setCustomActionsEditorOpen(false);
    setEditingAction(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsChatMobileLayout(window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isChatMobileLayout) {
      setMobileConversationsOpen(false);
      setMobileAutonomousOpen(false);
    }
  }, [isChatMobileLayout]);

  useEffect(() => {
    if (!isChat) {
      setMobileConversationsOpen(false);
      setMobileAutonomousOpen(false);
    }
  }, [isChat]);

  const bugReport = useBugReportState();

  const agentStarting = agentStatus?.state === "starting";

  if (startupError) {
    return <StartupFailureView error={startupError} onRetry={retryStartup} />;
  }

  if (onboardingLoading || agentStarting) {
    return (
      <LoadingScreen
        phase={agentStarting ? "initializing-agent" : startupPhase}
      />
    );
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  return (
    <BugReportProvider value={bugReport}>
      {isChat ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav mobileLeft={mobileChatControls} />
          <div className="flex flex-1 min-h-0 relative">
            {isChatMobileLayout ? (
              <>
                <main className="flex flex-col flex-1 min-w-0 overflow-visible pt-2 px-2">
                  <ChatView />
                </main>

                {mobileConversationsOpen && (
                  <div className="fixed inset-0 z-[120] bg-bg">
                    <ConversationsSidebar
                      mobile
                      onClose={() => setMobileConversationsOpen(false)}
                    />
                  </div>
                )}

                {mobileAutonomousOpen && (
                  <div className="fixed inset-0 z-[120] bg-bg">
                    <AutonomousPanel
                      mobile
                      onClose={() => setMobileAutonomousOpen(false)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <ConversationsSidebar />
                <main className="flex flex-col flex-1 min-w-0 overflow-visible pt-3 px-3 xl:px-5">
                  <ChatView />
                </main>
                <AutonomousPanel />
              </>
            )}
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
          <main
            className={`flex-1 min-h-0 py-4 px-3 xl:py-6 xl:px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}
          >
            <ViewRouter />
          </main>
          <TerminalPanel />
        </div>
      )}
      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
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
        onClose={() => {
          setCustomActionsEditorOpen(false);
          setEditingAction(null);
        }}
      />
      <RestartBanner />
      <BugReportModal />
      {actionNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${
            actionNotice.tone === "error"
              ? "bg-danger"
              : actionNotice.tone === "success"
                ? "bg-ok"
                : "bg-accent"
          }`}
        >
          {actionNotice.text}
        </div>
      )}
    </BugReportProvider>
  );
}
