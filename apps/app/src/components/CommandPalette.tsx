import { Clock3, Command, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useApp } from "../AppContext";
import { useTabNavigation } from "../hooks/useTabNavigation";
import { useBugReport } from "../hooks/useBugReport";
import { ShortcutHintRail } from "./shared/ShortcutHintRail";

const RECENT_COMMANDS_STORAGE_KEY = "milady:palette-recents";
const RECENT_COMMANDS_LIMIT = 8;

type CommandKind =
  | "chat"
  | "lifecycle"
  | "nav"
  | "quick"
  | "refresh"
  | "utility";

interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  searchTerms: string[];
  action: () => Promise<void> | void;
  dataTestId?: string;
}

function loadRecentCommands(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecentCommands(commandIds: string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify(commandIds.slice(0, RECENT_COMMANDS_LIMIT)),
    );
  } catch {
    // Ignore persistence failures.
  }
}

function recordRecentCommand(commandId: string): string[] {
  const next = [
    commandId,
    ...loadRecentCommands().filter((existingId) => existingId !== commandId),
  ].slice(0, RECENT_COMMANDS_LIMIT);
  saveRecentCommands(next);
  return next;
}

function fuzzyScore(query: string, values: string[]): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 1;

  let best = 0;
  for (const value of values) {
    const normalizedValue = value.toLowerCase();
    if (!normalizedValue) continue;

    if (normalizedValue === normalizedQuery) {
      best = Math.max(best, 500);
      continue;
    }
    if (normalizedValue.startsWith(normalizedQuery)) {
      best = Math.max(best, 400 - normalizedValue.length);
      continue;
    }
    const substringIndex = normalizedValue.indexOf(normalizedQuery);
    if (substringIndex >= 0) {
      best = Math.max(best, 300 - substringIndex);
      continue;
    }

    let queryIndex = 0;
    let valueIndex = 0;
    let gapPenalty = 0;
    while (
      queryIndex < normalizedQuery.length &&
      valueIndex < normalizedValue.length
    ) {
      if (normalizedQuery[queryIndex] === normalizedValue[valueIndex]) {
        queryIndex += 1;
      } else {
        gapPenalty += 1;
      }
      valueIndex += 1;
    }
    if (queryIndex === normalizedQuery.length) {
      best = Math.max(best, 150 - gapPenalty);
    }
  }

  return best;
}

function recentWeight(commandId: string, recents: string[]): number {
  const index = recents.indexOf(commandId);
  return index === -1 ? 0 : RECENT_COMMANDS_LIMIT - index;
}

export function CommandPalette() {
  const {
    agentStatus,
    closeCommandPalette,
    commandActiveIndex,
    commandPaletteOpen,
    commandQuery,
    handleChatClear,
    handlePauseResume,
    handleRestart,
    handleStart,
    loadLogs,
    loadPlugins,
    loadSkills,
    loadWorkbench,
    setState,
  } = useApp();
  const { open: openBugReport } = useBugReport();
  const { navigateToTab, quickActions, tabs } = useTabNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  const recentCommandIds = useMemo(() => loadRecentCommands(), [commandPaletteOpen]);

  const agentState = agentStatus?.state ?? "stopped";
  const isPaused = agentState === "paused";
  const isRunning = agentState === "running";

  const allCommands = useMemo<CommandItem[]>(() => {
    const commands: CommandItem[] = [];

    if (agentState === "stopped" || agentState === "not_started") {
      commands.push({
        id: "start-agent",
        kind: "lifecycle",
        label: "Start agent",
        hint: "Lifecycle",
        searchTerms: ["start agent", "boot", "launch", "run"],
        action: handleStart,
        dataTestId: "palette-command-start-agent",
      });
    }
    if (isRunning || isPaused) {
      commands.push({
        id: "pause-resume-agent",
        kind: "lifecycle",
        label: isPaused ? "Resume agent" : "Pause agent",
        hint: "Lifecycle",
        searchTerms: [
          isPaused ? "resume agent" : "pause agent",
          "toggle autonomy",
          "pause",
          "resume",
        ],
        action: handlePauseResume,
        dataTestId: "palette-command-pause-resume-agent",
      });
    }

    commands.push({
      id: "restart-agent",
      kind: "lifecycle",
      label: "Restart agent",
      hint: "Lifecycle",
      searchTerms: ["restart agent", "reboot", "reload"],
      action: handleRestart,
      dataTestId: "palette-command-restart-agent",
    });

    for (const tab of tabs) {
      commands.push({
        id: `tab-${tab.id}`,
        kind: "nav",
        label: tab.paletteLabel,
        hint: tab.title,
        searchTerms: [tab.paletteLabel, tab.title, ...tab.aliases, ...tab.keywords],
        action: () => navigateToTab(tab.id),
        dataTestId: `palette-command-tab-${tab.id}`,
      });
    }

    for (const quickAction of quickActions) {
      if (!quickAction.available) continue;
      commands.push({
        id: quickAction.id,
        kind: "quick",
        label: quickAction.label,
        hint: quickAction.hint,
        searchTerms: [
          quickAction.label,
          quickAction.hint,
          ...quickAction.aliases,
          ...quickAction.keywords,
        ],
        action: quickAction.run,
        dataTestId: quickAction.dataTestId,
      });
    }

    commands.push(
      {
        id: "refresh-plugins",
        kind: "refresh",
        label: "Refresh plugins",
        hint: "Reload plugin inventory",
        searchTerms: ["refresh plugins", "reload features", "plugins"],
        action: loadPlugins,
        dataTestId: "palette-command-refresh-plugins",
      },
      {
        id: "refresh-skills",
        kind: "refresh",
        label: "Refresh skills",
        hint: "Reload skills inventory",
        searchTerms: ["refresh skills", "reload skills", "skills"],
        action: loadSkills,
        dataTestId: "palette-command-refresh-skills",
      },
      {
        id: "refresh-logs",
        kind: "refresh",
        label: "Refresh logs",
        hint: "Reload runtime logs",
        searchTerms: ["refresh logs", "reload logs", "logs"],
        action: loadLogs,
        dataTestId: "palette-command-refresh-logs",
      },
      {
        id: "refresh-workbench",
        kind: "refresh",
        label: "Refresh workbench",
        hint: "Reload workbench overview",
        searchTerms: ["refresh workbench", "reload workbench", "workbench"],
        action: loadWorkbench,
        dataTestId: "palette-command-refresh-workbench",
      },
      {
        id: "chat-clear",
        kind: "chat",
        label: "Clear chat",
        hint: "Delete the active conversation",
        searchTerms: ["clear chat", "reset conversation", "delete chat"],
        action: handleChatClear,
        dataTestId: "palette-command-chat-clear",
      },
      {
        id: "report-bug",
        kind: "utility",
        label: "Report bug",
        hint: "Open the bug report modal",
        searchTerms: ["report bug", "issue", "feedback", "bug"],
        action: openBugReport,
        dataTestId: "palette-command-report-bug",
      },
    );

    return commands;
  }, [
    agentState,
    handleChatClear,
    handlePauseResume,
    handleRestart,
    handleStart,
    isPaused,
    isRunning,
    loadLogs,
    loadPlugins,
    loadSkills,
    loadWorkbench,
    navigateToTab,
    openBugReport,
    quickActions,
    tabs,
  ]);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();
    const ranked = allCommands
      .map((command) => ({
        command,
        recentBoost: recentWeight(command.id, recentCommandIds),
        score: fuzzyScore(normalizedQuery, command.searchTerms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (normalizedQuery) {
          if (right.score !== left.score) return right.score - left.score;
        }
        if (right.recentBoost !== left.recentBoost) {
          return right.recentBoost - left.recentBoost;
        }
        return left.command.label.localeCompare(right.command.label);
      });

    return ranked.map(({ command, recentBoost }) =>
      recentBoost > 0 && !normalizedQuery
        ? {
            ...command,
            hint: command.hint ? `Recent • ${command.hint}` : "Recent",
          }
        : command,
    );
  }, [allCommands, commandQuery, recentCommandIds]);

  const executeCommand = useCallback(
    async (command: CommandItem) => {
      recordRecentCommand(command.id);
      await command.action();
      closeCommandPalette();
    },
    [closeCommandPalette],
  );

  useEffect(() => {
    if (commandPaletteOpen) {
      inputRef.current?.focus();
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommandPalette();
        return;
      }
      if (event.key === "ArrowDown") {
        if (filteredCommands.length === 0) return;
        event.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex < filteredCommands.length - 1
            ? commandActiveIndex + 1
            : 0,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        if (filteredCommands.length === 0) return;
        event.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex > 0
            ? commandActiveIndex - 1
            : filteredCommands.length - 1,
        );
        return;
      }
      if (event.key === "Enter") {
        const command = filteredCommands[commandActiveIndex];
        if (!command) return;
        event.preventDefault();
        void executeCommand(command);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeCommandPalette,
    commandActiveIndex,
    commandPaletteOpen,
    executeCommand,
    filteredCommands,
    setState,
  ]);

  useEffect(() => {
    if (commandQuery !== "") {
      setState("commandActiveIndex", 0);
    }
  }, [commandQuery, setState]);

  useEffect(() => {
    if (filteredCommands.length === 0) {
      if (commandActiveIndex !== 0) setState("commandActiveIndex", 0);
      return;
    }
    if (commandActiveIndex > filteredCommands.length - 1) {
      setState("commandActiveIndex", filteredCommands.length - 1);
    }
  }, [commandActiveIndex, filteredCommands.length, setState]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9999] flex items-start justify-center pt-30"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeCommandPalette();
        }
      }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      data-testid="palette-root"
    >
      <div
        className="bg-bg border border-border w-[560px] max-h-[480px] flex flex-col shadow-2xl"
        role="document"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-[15px] text-txt outline-none font-body focus-ring"
            placeholder="Search tabs, quick actions, and commands..."
            value={commandQuery}
            onChange={(event) => setState("commandQuery", event.target.value)}
            data-testid="palette-input"
          />
          <Command className="h-4 w-4 text-muted" />
        </div>

        <div className="flex-1 overflow-y-auto py-1" data-testid="palette-list">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-6 text-center text-muted text-[13px]">
              No commands found. Try a tab name, alias, or quick action.
            </div>
          ) : (
            filteredCommands.map((command, index) => {
              const icon =
                command.kind === "quick" ? (
                  <Sparkles className="h-4 w-4 text-accent" />
                ) : recentCommandIds.includes(command.id) && !commandQuery ? (
                  <Clock3 className="h-4 w-4 text-muted" />
                ) : (
                  <Search className="h-4 w-4 text-muted" />
                );

              return (
                <button
                  type="button"
                  key={command.id}
                  className={`w-full px-4 py-2.5 cursor-pointer flex justify-between items-center gap-3 text-left text-sm font-body focus-ring-strong ${
                    index === commandActiveIndex
                      ? "bg-bg-hover"
                      : "hover:bg-bg-hover"
                  }`}
                  onClick={() => void executeCommand(command)}
                  onMouseEnter={() => setState("commandActiveIndex", index)}
                  data-testid={
                    command.dataTestId ?? `palette-command-${command.id}`
                  }
                >
                  <span className="flex items-center gap-3 min-w-0">
                    {icon}
                    <span className="truncate">{command.label}</span>
                  </span>
                  {command.hint ? (
                    <span className="text-xs text-muted text-right">
                      {command.hint}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <ShortcutHintRail
            hints={[
              { keys: "↑ ↓", label: "Move" },
              { keys: "Enter", label: "Run" },
              { keys: "Esc", label: "Close" },
            ]}
            dataTestId="palette-shortcut-rail"
          />
        </div>
      </div>
    </div>
  );
}
