/**
 * Root App component — routing shell.
 */

import type { Tab } from "@milady/app-core/navigation";
import { APPS_ENABLED } from "@milady/app-core/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { AvatarLoader } from "./components/avatar/AvatarLoader";
import {
  COMPANION_OVERLAY_TABS,
  CompanionShell,
} from "./components/CompanionShell";
import { ConnectionFailedBanner } from "./components/ConnectionFailedBanner";
import { CustomActionEditor } from "./components/CustomActionEditor";
import { CustomActionsPanel } from "./components/CustomActionsPanel";
import { GameViewOverlay } from "./components/GameViewOverlay";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PairingView } from "./components/PairingView";
import { SaveCommandModal } from "./components/SaveCommandModal";
import { ShellOverlays } from "./components/ShellOverlays";
import { StartupFailureView } from "./components/StartupFailureView";
import { StreamView } from "./components/StreamView";
import { SystemWarningBanner } from "./components/SystemWarningBanner";
import { BugReportProvider, useBugReportState } from "./hooks/useBugReport";
import { useContextMenu } from "./hooks/useContextMenu";
import { useStreamPopoutNavigation } from "./hooks/useStreamPopoutNavigation";
import { isLifoPopoutValue } from "./lifo-popout";

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
    agentStatus,
    activeGameViewerUrl,
    gameOverlayEnabled,
  } = useApp();

  const isPopout = useIsPopout();
  const contextMenu = useContextMenu();
  const routedTab: Tab = !APPS_ENABLED && tab === "apps" ? "chat" : tab;
  const companionShellTab: Tab = routedTab === "chat" ? "companion" : routedTab;
  const shellTab: Tab = COMPANION_OVERLAY_TABS.has(companionShellTab)
    ? companionShellTab
    : "companion";

  useStreamPopoutNavigation(setTab);

  const [customActionsPanelOpen, setCustomActionsPanelOpen] = useState(false);
  const [customActionsEditorOpen, setCustomActionsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    import("@milady/app-core/api").CustomActionDef | null
  >(null);

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

  return (
    <BugReportProvider value={bugReport}>
      <CompanionShell tab={shellTab} actionNotice={actionNotice} />
      {/* Persistent game overlay — stays visible across all tabs */}
      {activeGameViewerUrl && gameOverlayEnabled && tab !== "apps" && (
        <GameViewOverlay />
      )}
      <ShellOverlays actionNotice={actionNotice} />
      <div className="pointer-events-none fixed inset-y-0 right-0 z-[130] flex">
        <div className="pointer-events-auto h-full">
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
