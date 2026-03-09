/**
 * Typed command registry — single source of truth for all app commands.
 *
 * Shared by CommandPalette, Header, Nav, and any future surfaces.
 * Adding a command here makes it automatically available everywhere.
 */

import type { Tab } from "./navigation";

// ── Types ────────────────────────────────────────────────────────────────

export type CommandCategory =
  | "agent"
  | "navigation"
  | "refresh"
  | "utility";

export interface CommandDef {
  id: string;
  label: string;
  category: CommandCategory;
  /** Keyboard shortcut hint shown in palette / tooltips. */
  shortcut?: string;
  /** Extra hint text (e.g., current state). */
  hint?: string;
}

export interface CommandItem extends CommandDef {
  action: () => void;
}

// ── Static navigation commands ───────────────────────────────────────────
// These are always present; the palette builder just binds the setTab action.

export const NAV_COMMANDS: readonly { id: string; label: string; tab: Tab }[] = [
  { id: "nav-chat", label: "Open Chat", tab: "chat" },
  { id: "nav-apps", label: "Open Apps", tab: "apps" },
  { id: "nav-character", label: "Open Character", tab: "character" },
  { id: "nav-triggers", label: "Open Triggers", tab: "triggers" },
  { id: "nav-wallets", label: "Open Wallets", tab: "wallets" },
  { id: "nav-knowledge", label: "Open Knowledge", tab: "knowledge" },
  { id: "nav-connectors", label: "Open Social", tab: "connectors" },
  { id: "nav-plugins", label: "Open Plugins", tab: "plugins" },
  { id: "nav-settings", label: "Open Settings", tab: "settings" },
  { id: "nav-database", label: "Open Database", tab: "database" },
  { id: "nav-logs", label: "Open Logs", tab: "logs" },
  { id: "nav-security", label: "Open Security", tab: "security" },
  { id: "nav-lifo", label: "Open Lifo", tab: "lifo" },
] as const;

// ── Builder ──────────────────────────────────────────────────────────────

export interface BuildCommandsArgs {
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

export function buildCommands(args: BuildCommandsArgs): CommandItem[] {
  const {
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
  } = args;

  const commands: CommandItem[] = [];
  const isRunning = agentState === "running";
  const isPaused = agentState === "paused";

  // Agent control
  if (agentState === "stopped" || agentState === "not_started") {
    commands.push({
      id: "start-agent",
      label: "Start Agent",
      category: "agent",
      action: handleStart,
    });
  }
  if (isRunning || isPaused) {
    commands.push({
      id: "pause-resume-agent",
      label: isPaused ? "Resume Agent" : "Pause Agent",
      category: "agent",
      shortcut: "Space",
      action: handlePauseResume,
    });
  }
  commands.push({
    id: "restart-agent",
    label: "Restart Agent",
    category: "agent",
    shortcut: "Ctrl+R",
    action: handleRestart,
  });

  // Navigation
  for (const nav of NAV_COMMANDS) {
    commands.push({
      id: nav.id,
      label: nav.label,
      category: "navigation",
      action: () => setTab(nav.tab),
    });
  }

  if (activeGameViewerUrl.trim()) {
    commands.push({
      id: "nav-current-game",
      label: "Open Current Game",
      category: "navigation",
      action: () => {
        setTab("apps");
        setAppsSubTab();
      },
    });
  }

  // Refresh
  commands.push(
    { id: "refresh-plugins", label: "Refresh Features", category: "refresh", action: loadPlugins },
    { id: "refresh-skills", label: "Refresh Skills", category: "refresh", action: loadSkills },
    { id: "refresh-logs", label: "Refresh Logs", category: "refresh", action: loadLogs },
    { id: "refresh-workbench", label: "Refresh Workbench", category: "refresh", action: loadWorkbench },
  );

  // Utility
  commands.push(
    { id: "chat-clear", label: "Clear Chat", category: "utility", action: handleChatClear },
    { id: "report-bug", label: "Report Bug", category: "utility", action: openBugReport },
  );

  return commands;
}
