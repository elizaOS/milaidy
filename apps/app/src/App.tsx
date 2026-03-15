/**
 * Root App component — routing shell.
 */

import {
  AppsPageView,
  ConnectionFailedBanner,
  ConnectorsPageView,
  ErrorBoundary,
  GameViewOverlay,
  HeartbeatsView,
  PairingView,
  SaveCommandModal,
  SettingsView,
  StartupFailureView,
  SystemWarningBanner,
} from "@milady/app-core/components";
import {
  BugReportProvider,
  useBugReportState,
  useContextMenu,
  useStreamPopoutNavigation,
} from "@milady/app-core/hooks";
import type { Tab } from "@milady/app-core/navigation";
import { APPS_ENABLED, COMPANION_ENABLED } from "@milady/app-core/navigation";
import { isLifoPopoutValue } from "@milady/app-core/platform";
import { useApp } from "@milady/app-core/state";
import { useCallback, useEffect, useState } from "react";
import { AdvancedPageView } from "./components/AdvancedPageView";
import { AvatarLoader } from "./components/avatar/AvatarLoader";
import { CharacterView } from "./components/CharacterView";
import { ChatView } from "./components/ChatView";
import {
  COMPANION_OVERLAY_TABS,
  CompanionShell,
} from "./components/CompanionShell";
import { CompanionView } from "./components/CompanionView";
import { ConversationsSidebar } from "./components/ConversationsSidebar";
import { CustomActionEditor } from "./components/CustomActionEditor";
import { CustomActionsPanel } from "./components/CustomActionsPanel";
import { Header } from "./components/Header";
import { InventoryView } from "./components/InventoryView";
import { KnowledgeView } from "./components/KnowledgeView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { SharedCompanionScene } from "./components/companion/CompanionSceneHost";
import { ShellOverlays } from "./components/ShellOverlays";
import { StreamView } from "./components/StreamView";

const CHAT_MOBILE_BREAKPOINT_PX = 1024;

/** Check if we're in pop-out mode (StreamView only, no chrome).
 *  Legacy LIFO popout values are ignored so the normal app shell still loads. */
function useIsPopout(): boolean {
  const [popout] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(
      window.location.search || window.location.hash.split("?")[1] || "",
    );
    if (!params.has("popout")) return false;
    return !isLifoPopoutValue(params.get("popout"));
  });
  return popout;
}

function ViewRouter() {
  const { tab } = useApp();
  const view = (() => {
    switch (tab) {
      case "chat":
        return <ChatView />;
      case "companion":
        return COMPANION_ENABLED ? <CompanionView /> : <ChatView />;
      case "stream":
        return <StreamView />;
      case "apps":
        // Apps disabled in production builds; fall through to chat
        return APPS_ENABLED ? <AppsPageView /> : <ChatView />;
      case "character":
      case "character-select":
        return <CharacterView />;
      case "wallets":
        return <InventoryView />;
      case "knowledge":
        return <KnowledgeView />;
      case "connectors":
        return <ConnectorsPageView />;
      case "triggers":
        return (
          <section className="mx-auto w-full max-w-5xl">
            <HeartbeatsView />
          </section>
        );
      case "voice":
        return <SettingsView key="settings-voice" initialSection="voice" />;
      case "settings":
        return <SettingsView key="settings-root" />;
      case "advanced":
      case "plugins":
      case "skills":
      case "actions":
      case "fine-tuning":
      case "trajectories":
      case "runtime":
      case "database":
      case "lifo":
      case "logs":
      case "security":
        return <AdvancedPageView />;
      default:
        return <ChatView />;
    }
  })();

  return <ErrorBoundary>{view}</ErrorBoundary>;
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
    setTab,
    actionNotice,
    uiShellMode,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
  } = useApp();

  const isPopout = useIsPopout();
  const shellMode = uiShellMode ?? "companion";
  const effectiveTab: Tab =
    shellMode === "native" && tab === "companion"
      ? "chat"
      : shellMode === "companion" && tab === "chat"
        ? "companion"
      : tab;
  const companionSceneActive =
    COMPANION_ENABLED &&
    (effectiveTab === "companion" || tab === "companion");
  const contextMenu = useContextMenu();

  useStreamPopoutNavigation(setTab);

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    import("@milady/app-core/api").CustomActionDef | null
  >(null);
  const [isChatMobileLayout, setIsChatMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < CHAT_MOBILE_BREAKPOINT_PX
      : false,
  );
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);

  const isChat = tab === "chat";
  const isAdvancedTab =
    tab === "advanced" ||
    tab === "plugins" ||
    tab === "skills" ||
    tab === "actions" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "lifo" ||
    tab === "logs" ||
    tab === "security";
  const unreadCount = unreadConversations?.size ?? 0;
  const mobileChatControls = isChatMobileLayout ? (
    <div className="flex items-center gap-2 w-max">
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
          mobileConversationsOpen
            ? "border-accent bg-accent-subtle text-txt"
            : "border-border bg-card text-txt hover:border-accent hover:text-txt"
        }`}
        onClick={() => {
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
    }
  }, [isChatMobileLayout]);

  useEffect(() => {
    if (!isChat) {
      setMobileConversationsOpen(false);
    }
  }, [isChat]);

  const bugReport = useBugReportState();
  const agentStarting = agentStatus?.state === "starting";

  useEffect(() => {
    const STARTUP_TIMEOUT_MS = 300_000;
    if ((startupPhase as string) !== "ready" && !startupError) {
      const timer = setTimeout(() => {
        retryStartup();
      }, STARTUP_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [startupPhase, startupError, retryStartup]);

  // Pop-out mode — render only StreamView, skip startup gates.
  // Platform init is skipped in main.tsx; AppProvider hydrates WS in background.
  if (isPopout) {
    return (
      <div className="flex flex-col h-screen w-screen font-body text-txt bg-bg overflow-hidden">
        <StreamView />
      </div>
    );
  }

  if (startupError) {
    return <StartupFailureView error={startupError} onRetry={retryStartup} />;
  }

  if (onboardingLoading || agentStarting) {
    const loadingLabel = agentStarting
      ? "Initializing agent"
      : "Starting systems";
    return <AvatarLoader label={loadingLabel} fullScreen />;
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  const shellContent =
    shellMode === "companion" && COMPANION_OVERLAY_TABS.has(effectiveTab) ? (
      <CompanionShell tab={effectiveTab} actionNotice={actionNotice} />
    ) : tab === "stream" ? (
      <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
        <Header />
        <main className="flex-1 min-h-0 overflow-hidden">
          <StreamView />
        </main>
      </div>
    ) : isChat ? (
      <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
        <Header mobileLeft={mobileChatControls} />
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
            </>
          ) : (
            <>
              <ConversationsSidebar />
              <main className="flex flex-col flex-1 min-w-0 overflow-visible pt-3 px-3 xl:px-5">
                <ChatView />
              </main>
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
      </div>
    ) : (
      <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
        <Header />
        <main
          className={`flex-1 min-h-0 py-4 px-3 xl:py-6 xl:px-5 ${isAdvancedTab ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          <ViewRouter />
        </main>
      </div>
    );

  const appShell = COMPANION_ENABLED ? (
    <SharedCompanionScene active={companionSceneActive}>
      {shellContent}
    </SharedCompanionScene>
  ) : (
    shellContent
  );

  return (
    <BugReportProvider value={bugReport}>
      {appShell}
      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
      )}
      <ShellOverlays actionNotice={actionNotice} />
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
      <ConnectionFailedBanner />
      <SystemWarningBanner />
    </BugReportProvider>
  );
}
