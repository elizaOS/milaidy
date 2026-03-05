/**
 * Root App component — routing shell.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "./AppContext";
import { AdvancedPageView } from "./components/AdvancedPageView";
import { AppsPageView } from "./components/AppsPageView";
import { AutonomousPanel } from "./components/AutonomousPanel";
import { BugReportModal } from "./components/BugReportModal";
import { CharacterView } from "./components/CharacterView";
import { ChatView } from "./components/ChatView";
import { CommandPalette } from "./components/CommandPalette";
import { CompanionView } from "./components/CompanionView";
import { ConnectorsPageView } from "./components/ConnectorsPageView";
import { ConversationsSidebar } from "./components/ConversationsSidebar";
import { CustomActionEditor } from "./components/CustomActionEditor";
import { CustomActionsPanel } from "./components/CustomActionsPanel";
import { EmotePicker } from "./components/EmotePicker";
import { GameViewOverlay } from "./components/GameViewOverlay";
import { Header } from "./components/Header";
import { IdentityView } from "./components/IdentityView";
import { InventoryView } from "./components/InventoryView";
import { KnowledgeView } from "./components/KnowledgeView";
import { LifoSandboxView } from "./components/LifoSandboxView";
import { LoadingScreen } from "./components/LoadingScreen";
import { MemoryDebugPanel } from "./components/MemoryDebugPanel";
import { Nav } from "./components/Nav";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PairingView } from "./components/PairingView";
import { PluginsView } from "./components/PluginsView";
import { RestartBanner } from "./components/RestartBanner";
import { SaveCommandModal } from "./components/SaveCommandModal";
import { SettingsView } from "./components/SettingsView";
import { SkillsView } from "./components/SkillsView";
import { StartupFailureView } from "./components/StartupFailureView";
import { StreamView } from "./components/StreamView";
import { TerminalPanel } from "./components/TerminalPanel";
import { BugReportProvider, useBugReportState } from "./hooks/useBugReport";
import { useContextMenu } from "./hooks/useContextMenu";
import { useLifoAutoPopout } from "./hooks/useLifoAutoPopout";
import { isLifoPopoutMode, isLifoPopoutValue } from "./lifo-popout";
import type { Tab } from "./navigation";
import { APPS_ENABLED, COMPANION_ENABLED, pathForTab } from "./navigation";

const CHAT_MOBILE_BREAKPOINT_PX = 1024;

/** Check if we're in pop-out mode (StreamView only, no chrome).
 *  Excludes lifo popout values — those use the dedicated LifoSandboxView shell. */
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
    case "identity":
      return <IdentityView />;
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
    setTab,
    actionNotice,
    uiShellMode,
    agentStatus,
    unreadConversations,
    activeGameViewerUrl,
    gameOverlayEnabled,
    setActionNotice,
  } = useApp();
  const isPopout = useIsPopout();
  const shellMode = uiShellMode ?? "companion";
  const effectiveTab: Tab =
    shellMode === "native" && tab === "companion"
      ? "chat"
      : shellMode === "companion" && tab === "chat"
        ? "companion"
        : tab;
  const contextMenu = useContextMenu();

  // When the stream is popped out, navigate away; when closed, navigate back.
  const [streamPoppedOut, setStreamPoppedOut] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "opened") {
        setStreamPoppedOut(true);
        setTab("chat");
      } else if (detail === "closed") {
        setStreamPoppedOut(false);
        setTab("stream");
      }
    };
    window.addEventListener("stream-popout", handler);
    return () => window.removeEventListener("stream-popout", handler);
  }, [setTab]);

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
  const lifoPopoutMode = useMemo(() => isLifoPopoutMode(), []);

  useLifoAutoPopout({
    enabled:
      !lifoPopoutMode &&
      !onboardingLoading &&
      onboardingComplete &&
      !authRequired,
    targetPath: pathForTab("lifo", import.meta.env.BASE_URL),
    onPopupBlocked: () => {
      setActionNotice(
        "Lifo popout blocked by the browser. Allow popups to watch agent computer-use live.",
        "error",
        3800,
      );
    },
  });

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
    return (
      <LoadingScreen
        phase={agentStarting ? "initializing-agent" : startupPhase}
      />
    );
  }

  if (authRequired) return <PairingView />;
  if (!onboardingComplete) return <OnboardingWizard />;

  if (lifoPopoutMode) {
    return (
      <BugReportProvider value={bugReport}>
        <div className="flex h-screen w-screen min-h-0 bg-bg text-txt">
          <main className="flex-1 min-h-0 overflow-hidden p-3 xl:p-4">
            <LifoSandboxView />
          </main>
        </div>
      </BugReportProvider>
    );
  }

  /* ── Companion shell mode ─────────────────────────────────────────── */
  // When shellMode is "companion", certain tabs render as overlay panels
  // on top of the CompanionView background. The native tabbed layout is
  // used for chat, stream, and other fork-specific views.
  const companionOverlayTabs = new Set<Tab>([
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

  if (shellMode === "companion" && companionOverlayTabs.has(effectiveTab)) {
    const isSkills = effectiveTab === "skills";
    const isSettings = effectiveTab === "settings";
    const isPlugins = effectiveTab === "plugins";
    const isLifo = effectiveTab === "lifo";
    const isStream = effectiveTab === "stream";
    const isWallets = effectiveTab === "wallets";
    const isAdvancedOverlay =
      effectiveTab === "advanced" ||
      effectiveTab === "actions" ||
      effectiveTab === "triggers" ||
      effectiveTab === "fine-tuning" ||
      effectiveTab === "trajectories" ||
      effectiveTab === "runtime" ||
      effectiveTab === "database" ||
      effectiveTab === "logs" ||
      effectiveTab === "security" ||
      isLifo ||
      isStream;
    const isApps = effectiveTab === "apps";
    const isConnectors = effectiveTab === "connectors";
    const isKnowledge = effectiveTab === "knowledge";
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

    const accentColor = isSkills
      ? "#00e1ff"
      : isApps
        ? "#10b981"
        : isPluginsLike
          ? "#f0b232"
          : isKnowledge
            ? "#a78bfa"
            : isWallets
              ? "#f0b90b"
              : isStream
                ? "#ef4444"
                : isLifo
                  ? "#8b5cf6"
                  : "#d4af37";
    const topBarColor = isSkills
      ? "#00e1ff"
      : isWallets
        ? "rgba(240, 185, 11, 0.7)"
        : isLifo
          ? "rgba(139, 92, 246, 0.7)"
          : isStream
            ? "rgba(239, 68, 68, 0.7)"
            : isSettings || isAdvancedOverlay
              ? "rgba(210, 205, 200, 0.7)"
              : isPluginsLike
                ? "#f0b232"
                : isApps
                  ? "rgba(16, 185, 129, 0.7)"
                  : isKnowledge
                    ? "rgba(167, 139, 250, 0.7)"
                    : "#d4af37";
    const cardColor = isSkills
      ? "rgba(20, 24, 38, 0.85)"
      : "rgba(10, 12, 16, 0.75)";
    const shadowFx = isSkills
      ? "shadow-[0_0_50px_rgba(0,225,255,0.15)]"
      : "shadow-[0_4px_30px_rgba(0,0,0,0.5)]";
    const overlayBackdropClass =
      effectiveTab === "skills"
        ? "opacity-100 backdrop-blur-2xl bg-black/40 pointer-events-auto"
        : isPluginsLike
          ? "opacity-100 backdrop-blur-xl bg-black/35 pointer-events-auto"
          : effectiveTab === "settings" ||
              isAdvancedOverlay ||
              isApps ||
              isKnowledge ||
              isLifo ||
              isStream ||
              isWallets
            ? "opacity-100 backdrop-blur-2xl bg-black/50 pointer-events-auto"
            : effectiveTab === "character" ||
                effectiveTab === "character-select"
              ? "opacity-100"
              : "opacity-0";

    const showOverlayContent =
      isSkills ||
      effectiveTab === "character" ||
      effectiveTab === "character-select" ||
      isSettings ||
      isPlugins ||
      isAdvancedOverlay ||
      isApps ||
      isConnectors ||
      isKnowledge ||
      isLifo ||
      isStream ||
      isWallets;

    return (
      <BugReportProvider value={bugReport}>
        <div className="relative w-full h-[100vh] overflow-hidden bg-[#0a0c12]">
          <CompanionView />

          {/* Hub Modals (Overlay on top of CompanionView) */}
          <div
            className={`absolute inset-0 z-[60] flex ${isCentered ? "items-center justify-center" : "justify-end"} transition-all duration-300 pointer-events-none ${overlayBackdropClass}`}
          >
            {showOverlayContent && (
              <div
                className={
                  isCentered ? "relative pointer-events-auto" : "contents"
                }
              >
                <div
                  className={`relative flex flex-col pointer-events-auto ${
                    isSkills
                      ? "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl"
                      : isPluginsLike
                        ? "w-[97vw] h-[92vh] md:w-[88vw] md:h-[80vh] max-w-[1460px] overflow-visible"
                        : isAdvancedOverlay
                          ? "w-[95vw] h-[95vh] max-w-[1500px] backdrop-blur-3xl border rounded-2xl overflow-hidden"
                          : isSettings || isApps || isKnowledge || isWallets
                            ? "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl overflow-hidden"
                            : "w-[65vw] min-w-[700px] h-[100vh] border-l backdrop-blur-2xl"
                  } transition-all duration-500`}
                  style={{
                    background: isSkills
                      ? cardColor
                      : isPluginsLike
                        ? "transparent"
                        : isSettings ||
                            isAdvancedOverlay ||
                            isApps ||
                            isKnowledge ||
                            isWallets
                          ? "rgba(18, 22, 32, 0.92)"
                          : "linear-gradient(to left, rgba(6, 8, 12, 0.95) 40%, rgba(6, 8, 12, 0.7) 80%, rgba(6, 8, 12, 0.2) 100%)",
                    borderColor: isSkills
                      ? "rgba(0,225,255,0.2)"
                      : isPluginsLike
                        ? "transparent"
                        : isSettings ||
                            isAdvancedOverlay ||
                            isApps ||
                            isKnowledge ||
                            isWallets
                          ? "rgba(255, 255, 255, 0.08)"
                          : "rgba(255,255,255,0.05)",
                    boxShadow: isSkills
                      ? shadowFx
                      : isPluginsLike
                        ? "none"
                        : isSettings ||
                            isAdvancedOverlay ||
                            isApps ||
                            isKnowledge ||
                            isWallets
                          ? "0 8px 60px rgba(0,0,0,0.6), 0 2px 24px rgba(0,0,0,0.4)"
                          : "-60px 0 100px -20px rgba(0,0,0,0.8)",
                    borderTopRightRadius: isPluginsLike
                      ? "0"
                      : isCentered
                        ? "1rem"
                        : "0",
                    borderBottomLeftRadius: isPluginsLike
                      ? "0"
                      : isCentered
                        ? "1rem"
                        : "0",
                  }}
                >
                  {/* Top bar accent line */}
                  {(effectiveTab === "character" ||
                    effectiveTab === "character-select") && (
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
                  {isCentered && !isPluginsLike && (
                    <div
                      className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
                      style={{
                        background: `linear-gradient(to right, transparent, ${topBarColor}, transparent)`,
                      }}
                    />
                  )}

                  {/* Decorative Elements */}
                  <div
                    className={`pointer-events-none absolute inset-0 overflow-hidden ${isPluginsLike ? "" : "rounded-[16px]"}`}
                  >
                    {isSkills && (
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
                    {isSettings && (
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
                    {isAdvancedOverlay && !isLifo && !isStream && (
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
                    {isLifo && (
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
                    {isStream && (
                      <>
                        <div className="absolute top-[12%] right-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
                        <div className="absolute bottom-[12%] left-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
                        <div className="absolute top-3 right-4 text-[#ef4444]/20 text-[9px] font-mono tracking-widest">
                          STREAM.LIVE_V1
                        </div>
                      </>
                    )}
                    {isKnowledge && (
                      <>
                        <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
                        <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
                        <div className="absolute bottom-3 right-4 text-[#a78bfa]/20 text-[9px] font-mono tracking-widest">
                          KNOW.BASE_V1
                        </div>
                      </>
                    )}
                    {isWallets && (
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
                    {isApps && (
                      <>
                        <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
                        <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
                        <div className="absolute bottom-3 right-4 text-[#10b981]/20 text-[9px] font-mono tracking-widest">
                          APP.PANEL_V1
                        </div>
                      </>
                    )}
                    {(effectiveTab === "character" ||
                      effectiveTab === "character-select") && (
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

                  {/* Close Modal Button — character (non-centered) modal only */}
                  {!isCentered && (
                    <button
                      type="button"
                      onClick={() => setTab("companion")}
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
                  )}

                  {/* View Wrapper with Overridden CSS Variables */}
                  <div
                    className={`flex-1 min-h-0 ${
                      isPluginsLike
                        ? "overflow-visible"
                        : isSettings ||
                            isAdvancedOverlay ||
                            isApps ||
                            isConnectors ||
                            isWallets
                          ? "overflow-hidden"
                          : "overflow-y-auto"
                    } ${
                      isSkills
                        ? "px-10 pb-10 pt-4"
                        : isSettings ||
                            isAdvancedOverlay ||
                            isApps ||
                            isConnectors ||
                            isPlugins ||
                            isWallets
                          ? "p-0"
                          : isKnowledge
                            ? "px-8 py-8"
                            : "px-16 pt-32 pb-16"
                    } custom-scrollbar text-white anime-theme-scope relative z-10`}
                    style={
                      isSettings ||
                      isPlugins ||
                      isAdvancedOverlay ||
                      isApps ||
                      isConnectors ||
                      isKnowledge ||
                      isWallets
                        ? ({
                            "--bg": "transparent",
                            "--card": "rgba(255, 255, 255, 0.05)",
                            "--border": "rgba(255, 255, 255, 0.08)",
                            "--accent": isPluginsLike
                              ? "#f0b232"
                              : isApps
                                ? "#10b981"
                                : isKnowledge
                                  ? "#a78bfa"
                                  : isWallets
                                    ? "#f0b90b"
                                    : isLifo
                                      ? "#8b5cf6"
                                      : isStream
                                        ? "#ef4444"
                                        : "#7b8fb5",
                            "--accent-foreground": "#ffffff",
                            "--accent-subtle": isPluginsLike
                              ? "rgba(240, 178, 50, 0.12)"
                              : isApps
                                ? "rgba(16, 185, 129, 0.12)"
                                : isKnowledge
                                  ? "rgba(167, 139, 250, 0.12)"
                                  : isWallets
                                    ? "rgba(240, 185, 11, 0.12)"
                                    : isLifo
                                      ? "rgba(139, 92, 246, 0.12)"
                                      : isStream
                                        ? "rgba(239, 68, 68, 0.12)"
                                        : "rgba(123, 143, 181, 0.12)",
                            "--accent-rgb": isPluginsLike
                              ? "240, 178, 50"
                              : isApps
                                ? "16, 185, 129"
                                : isKnowledge
                                  ? "167, 139, 250"
                                  : isWallets
                                    ? "240, 185, 11"
                                    : isLifo
                                      ? "139, 92, 246"
                                      : isStream
                                        ? "239, 68, 68"
                                        : "123, 143, 181",
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
                          } as React.CSSProperties)
                        : ({
                            "--bg": "transparent",
                            "--card": isSkills
                              ? "rgba(255, 255, 255, 0.05)"
                              : "transparent",
                            "--border": isSkills
                              ? "rgba(0,225,255,0.3)"
                              : "rgba(255,255,255,0.08)",
                            "--accent": accentColor,
                            "--accent-foreground": isSkills
                              ? "#000000"
                              : "#ffffff",
                            "--muted": "rgba(255, 255, 255, 0.55)",
                            "--txt": "#ffffff",
                          } as React.CSSProperties)
                    }
                  >
                    {isSkills && <SkillsView inModal />}
                    {(effectiveTab === "character" ||
                      effectiveTab === "character-select") && (
                      <CharacterView inModal />
                    )}
                    {isSettings && <SettingsView inModal />}
                    {isPlugins && <PluginsView inModal />}
                    {isAdvancedOverlay && <AdvancedPageView inModal />}
                    {isApps && <AppsPageView inModal />}
                    {isConnectors && <ConnectorsPageView inModal />}
                    {isKnowledge && <KnowledgeView inModal />}
                    {isLifo && <LifoSandboxView inModal />}
                    {isStream && <StreamView inModal />}
                    {isWallets && <InventoryView inModal />}
                  </div>
                </div>
                {/* Close button — outside the modal card, anchored to its top-right corner */}
                {isCentered && (
                  <button
                    type="button"
                    onClick={() => setTab("companion")}
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
                )}
              </div>
            )}
          </div>
        </div>
        <CommandPalette />
        <EmotePicker />
        <RestartBanner />
        <MemoryDebugPanel />
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

  /* ── Native shell mode (all fork features intact) ─────────────────── */
  return (
    <BugReportProvider value={bugReport}>
      {tab === "stream" && !streamPoppedOut ? (
        <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
          <Header />
          <Nav />
          <main className="flex-1 min-h-0 overflow-hidden">
            <StreamView />
          </main>
        </div>
      ) : isChat || (tab === "stream" && streamPoppedOut) ? (
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
      <MemoryDebugPanel />
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
