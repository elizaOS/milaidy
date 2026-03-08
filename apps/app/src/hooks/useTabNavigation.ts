import { useCallback, useMemo } from "react";
import { useApp } from "../AppContext";
import {
  QUICK_ACTION_REGISTRY,
  type QuickActionDefinition,
  type QuickActionId,
} from "../quick-actions";
import {
  getTabGroups,
  getTabRegistry,
  STREAM_ENABLED,
  type Tab,
  type TabGroup,
  type TabRegistryEntry,
} from "../navigation";
import {
  readShellPanelState,
  writeShellPanelState,
  type ShellPanelState,
} from "../shell-panels";

export interface BoundQuickAction extends QuickActionDefinition {
  available: boolean;
  run: () => Promise<void>;
}

export interface UseTabNavigationResult {
  activeTab: Tab;
  navGroups: TabGroup[];
  tabs: TabRegistryEntry[];
  streamEnabled: boolean;
  navigateToTab: (tab: Tab) => void;
  persistShellPanels: (tab: Tab, nextState: Partial<ShellPanelState>) => ShellPanelState;
  restoreShellPanels: (tab: Tab) => ShellPanelState;
  quickActions: BoundQuickAction[];
  runQuickAction: (id: QuickActionId) => Promise<void>;
}

export function useTabNavigation(): UseTabNavigationResult {
  const {
    activeGameViewerUrl,
    agentStatus,
    handlePauseResume,
    handleRestart,
    plugins,
    setState,
    setTab,
    tab,
  } = useApp();
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";

  const streamEnabled = useMemo(
    () =>
      STREAM_ENABLED ||
      plugins.some((plugin) => plugin.id === "streaming-base" && plugin.enabled),
    [plugins],
  );

  const tabs = useMemo(
    () => getTabRegistry({ streamEnabled, includeHidden: false }),
    [streamEnabled],
  );
  const navGroups = useMemo(() => getTabGroups(streamEnabled), [streamEnabled]);

  const persistShellPanels = useCallback(
    (tab: Tab, nextState: Partial<ShellPanelState>) =>
      writeShellPanelState(tab, nextState),
    [],
  );

  const restoreShellPanels = useCallback((tab: Tab) => readShellPanelState(tab), []);

  const navigateToTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
  }, [setTab]);

  const runQuickAction = useCallback(
    async (id: QuickActionId) => {
      switch (id) {
        case "restart-open-logs":
          setTab("logs");
          await handleRestart();
          break;
        case "open-active-game":
          if (!currentGameViewerUrl.trim()) return;
          setState("appsSubTab", "games");
          setTab("apps");
          break;
        case "mute-voice-pause-agent":
          setState("chatAgentVoiceMuted", true);
          if (agentStatus?.state === "running") {
            await handlePauseResume();
          }
          break;
      }
    },
    [
      currentGameViewerUrl,
      agentStatus?.state,
      handlePauseResume,
      handleRestart,
      setState,
      setTab,
    ],
  );

  const quickActions = useMemo<BoundQuickAction[]>(
    () =>
      QUICK_ACTION_REGISTRY.map((definition) => ({
        ...definition,
        available:
          definition.id !== "open-active-game" ||
          currentGameViewerUrl.trim().length > 0,
        run: () => runQuickAction(definition.id),
      })),
    [currentGameViewerUrl, runQuickAction],
  );

  return {
    activeTab: tab,
    navGroups,
    tabs,
    streamEnabled,
    navigateToTab,
    persistShellPanels,
    restoreShellPanels,
    quickActions,
    runQuickAction,
  };
}
