import type { Tab } from "../navigation";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export interface BuildCommandPaletteCommandsArgs {
  agentState: string;
  activeGameViewerUrl: string;
  handleStart: () => void;
  handlePauseResume: () => void;
  handleRestart: () => void;
  setTab: (tab: Tab) => void;
  setAppsSubTab: () => void;
  loadPlugins: () => void;
  loadSkills: () => void;
  loadLogs: () => void;
  loadWorkbench: () => void;
  handleChatClear: () => void;
  openBugReport: () => void;
}

export function buildCommandPaletteCommands({
  agentState,
  activeGameViewerUrl,
  handleStart,
  handlePauseResume,
  handleRestart,
  setTab,
  setAppsSubTab,
  loadPlugins,
  loadSkills,
  loadLogs,
  loadWorkbench,
  handleChatClear,
  openBugReport,
}: BuildCommandPaletteCommandsArgs): CommandItem[] {
  const commands: CommandItem[] = [];
  const isRunning = agentState === "running";
  const isPaused = agentState === "paused";

  if (agentState === "stopped" || agentState === "not_started") {
    commands.push({
      id: "start-agent",
      label: "Start Agent",
      action: handleStart,
    });
  }
  if (isRunning || isPaused) {
    commands.push({
      id: "pause-resume-agent",
      label: isPaused ? "Resume Agent" : "Pause Agent",
      action: handlePauseResume,
    });
  }
  commands.push({
    id: "restart-agent",
    label: "Restart Agent",
    action: handleRestart,
  });

  commands.push(
    { id: "nav-chat", label: "Open Chat", action: () => setTab("chat") },
    { id: "nav-apps", label: "Open Apps", action: () => setTab("apps") },
    {
      id: "nav-character",
      label: "Open Character",
      action: () => setTab("character"),
    },
    {
      id: "nav-triggers",
      label: "Open Triggers",
      action: () => setTab("triggers"),
    },
    {
      id: "nav-wallets",
      label: "Open Wallets",
      action: () => setTab("wallets"),
    },
    {
      id: "nav-knowledge",
      label: "Open Knowledge",
      action: () => setTab("knowledge"),
    },
    {
      id: "nav-connectors",
      label: "Open Social",
      action: () => setTab("connectors"),
    },
    {
      id: "nav-plugins",
      label: "Open Plugins",
      action: () => setTab("plugins"),
    },
    {
      id: "nav-settings",
      label: "Open Settings",
      action: () => setTab("settings"),
    },
    {
      id: "nav-database",
      label: "Open Database",
      action: () => setTab("database"),
    },
    { id: "nav-logs", label: "Open Logs", action: () => setTab("logs") },
    {
      id: "nav-security",
      label: "Open Security",
      action: () => setTab("security"),
    },
    {
      id: "nav-lifo",
      label: "Open Lifo",
      action: () => setTab("lifo"),
    },
  );

  if (activeGameViewerUrl.trim()) {
    commands.push({
      id: "nav-current-game",
      label: "Open Current Game",
      action: () => {
        setTab("apps");
        setAppsSubTab();
      },
    });
  }

  commands.push(
    { id: "refresh-plugins", label: "Refresh Features", action: loadPlugins },
    { id: "refresh-skills", label: "Refresh Skills", action: loadSkills },
    { id: "refresh-logs", label: "Refresh Logs", action: loadLogs },
    {
      id: "refresh-workbench",
      label: "Refresh Workbench",
      action: loadWorkbench,
    },
    {
      id: "chat-clear",
      label: "Clear Chat",
      action: handleChatClear,
    },
    {
      id: "report-bug",
      label: "Report Bug",
      action: openBugReport,
    },
  );

  return commands;
}
