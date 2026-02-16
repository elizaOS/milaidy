import { useEffect, useRef, useMemo } from "react";
import { useApp } from "../AppContext";

const dispatchAppEvent = (event: CustomEvent) => {
  const target = typeof window.dispatchEvent === "function" ? window : document;
  target.dispatchEvent(event);
};

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    commandQuery,
    commandActiveIndex,
    agentStatus,
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    setTab,
    loadPlugins,
    loadSkills,
    loadLogs,
    loadWorkbench,
    handleChatClear,
    activeGameViewerUrl,
    setState,
    closeCommandPalette,
  } = useApp();

  const inputRef = useRef<HTMLInputElement>(null);

  const agentState = agentStatus?.state ?? "stopped";
  const isRunning = agentState === "running";
  const isPaused = agentState === "paused";
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";

  // Build command list
  const allCommands = useMemo<CommandItem[]>(() => {
    const commands: CommandItem[] = [];
    const dispatchEvent = (name: string, detail?: Record<string, unknown>) => {
      dispatchAppEvent(new CustomEvent(name, { detail }));
    };
    const dispatchAppCommand = (command: string, detail: Record<string, unknown> = {}) => {
      dispatchEvent("milaidy:app-command", { command, ...detail });
    };

    // Lifecycle commands
    if (agentState === "stopped" || agentState === "not_started") {
      commands.push({
        id: "start-agent",
        label: "Start Agent",
        action: handleStart,
        hint: "start",
      });
    }
    if (isRunning || isPaused) {
      commands.push({
        id: "pause-resume-agent",
        label: isPaused ? "Resume Agent" : "Pause Agent",
        action: handlePauseResume,
      });
    }
    if (isRunning || isPaused || agentState === "stopped") {
      commands.push({
        id: "stop-agent",
        label: "Stop Agent",
        action: () => handleStop(),
        hint: "stop",
      });
    }
    commands.push({
      id: "restart-agent",
      label: "Restart Agent",
      action: handleRestart,
    });

    // Navigation commands
    commands.push(
      {
        id: "open-notes-edit",
        label: "Open Notes (Edit)",
        action: () => dispatchEvent("milaidy:open-notes-panel", { mode: "edit" }),
        hint: "Ctrl/Cmd+Shift+N",
      },
      {
        id: "open-notes-view",
        label: "Open Notes (View)",
        action: () => dispatchEvent("milaidy:open-notes-panel", { mode: "view" }),
        hint: "Ctrl/Cmd+Shift+V",
      },
      {
        id: "open-notes-skill-draft",
        label: "New Skill Draft",
        action: () => dispatchAppCommand("open-notes-with-seed", {
          seedText: "## Skill Draft\n- Inputs:\n- Output:\n- Edge cases:\n",
        }),
      },
      {
        id: "open-notes-action-prompt",
        label: "New Action Prompt",
        action: () => dispatchAppCommand("open-notes-with-seed", {
          seedText: "## Action\n\nGoal:\n- Why now:\n- Inputs:\n- Expected output:\n",
        }),
      },
      {
        id: "open-notes-runbook",
        label: "New Runbook Draft",
        action: () => dispatchAppCommand("open-notes-with-seed", {
          seedText: "## Runbook\n\n## Trigger\n\n## Steps\n1.\n2.\n3.\n\n## Validation\n- [ ] \n",
        }),
      },
      {
        id: "open-notes-incident-log",
        label: "New Incident Log",
        action: () => dispatchAppCommand("open-notes-with-seed", {
          seedText: "## Incident\n\n- Reported:\n- Impact:\n- Detection:\n- Resolution:\n- Next actions:\n",
        }),
      },
      {
        id: "open-notes-split",
        label: "Open Notes (Split View)",
        action: () => dispatchAppCommand("open-notes-split"),
      },
      {
        id: "open-command-palette",
        label: "Open Command Palette",
        action: () => dispatchEvent("milaidy:app-command", { command: "open-command-palette" }),
      },
      {
        id: "open-custom-actions",
        label: "Open Custom Actions",
        action: () => dispatchAppCommand("open-custom-actions-panel"),
      },
      { id: "open-custom-actions-page", label: "Open Custom Actions Page", action: () => setTab("actions") },
      {
        id: "open-custom-action-editor",
        label: "Create New Custom Action",
        action: () => dispatchEvent("milaidy:open-custom-action-editor"),
      },
      {
        id: "open-custom-action-editor-with-prompt",
        label: "Generate Custom Action from Prompt",
        action: () => dispatchAppCommand("open-custom-action-editor-with-prompt", {
          seedPrompt: "Generate a custom action that does the following:",
        }),
      },
      { id: "nav-chat", label: "Open Chat", action: () => setTab("chat") },
      { id: "nav-apps", label: "Open Apps", action: () => setTab("apps") },
      { id: "nav-character", label: "Open Character", action: () => setTab("character") },
      { id: "nav-triggers", label: "Open Triggers", action: () => setTab("triggers") },
      { id: "nav-wallets", label: "Open Wallets", action: () => setTab("wallets") },
      { id: "nav-knowledge", label: "Open Knowledge", action: () => setTab("knowledge") },
      { id: "nav-connectors", label: "Open Social", action: () => setTab("connectors") },
      { id: "nav-plugins", label: "Open Plugins", action: () => setTab("plugins") },
      { id: "nav-config", label: "Open Config", action: () => setTab("settings") },
      { id: "nav-database", label: "Open Database", action: () => setTab("database") },
      { id: "nav-settings", label: "Open Settings", action: () => setTab("settings") },
      { id: "nav-logs", label: "Open Logs", action: () => setTab("logs") }
    );

    if (currentGameViewerUrl.trim()) {
      commands.push({
        id: "nav-current-game",
        label: "Open Current Game",
        action: () => {
          setTab("apps");
          setState("appsSubTab", "games");
        },
      });
    }

    // Refresh commands
    commands.push(
      { id: "refresh-plugins", label: "Refresh Plugins", action: () => dispatchAppCommand("refresh-plugins"), hint: "runtime" },
      { id: "refresh-skills", label: "Refresh Skills", action: () => dispatchAppCommand("refresh-skills"), hint: "runtime" },
      { id: "refresh-logs", label: "Refresh Logs", action: () => dispatchAppCommand("refresh-logs"), hint: "runtime" },
      { id: "refresh-workbench", label: "Refresh Workbench", action: () => dispatchAppCommand("refresh-workbench"), hint: "runtime" },
    );

    // Chat commands
    commands.push({
      id: "chat-clear",
      label: "Clear Chat",
      action: handleChatClear,
    });

    return commands;
  }, [
    agentState,
    isRunning,
    isPaused,
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    setTab,
    currentGameViewerUrl,
    setState,
    handleChatClear,
    loadPlugins,
    loadSkills,
    loadLogs,
    loadWorkbench,
  ]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!commandQuery.trim()) return allCommands;
    const query = commandQuery.toLowerCase();
    return allCommands.filter((cmd) => cmd.label.toLowerCase().includes(query));
  }, [allCommands, commandQuery]);

  // Auto-focus input when opened
  useEffect(() => {
    if (commandPaletteOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [commandPaletteOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!commandPaletteOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCommandPalette();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex < filteredCommands.length - 1 ? commandActiveIndex + 1 : 0
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex > 0 ? commandActiveIndex - 1 : filteredCommands.length - 1
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filteredCommands[commandActiveIndex];
        if (cmd) {
          cmd.action();
          closeCommandPalette();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    commandPaletteOpen,
    commandActiveIndex,
    filteredCommands,
    setState,
    closeCommandPalette,
  ]);

  // Reset active index when query changes
  useEffect(() => {
    if (commandQuery !== "") {
      setState("commandActiveIndex", 0);
    }
  }, [commandQuery, setState]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9999] flex items-start justify-center pt-30"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeCommandPalette();
        }
      }}
    >
      <div
        className="bg-bg border border-border w-[520px] max-h-[420px] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="w-full px-4 py-3.5 border-b border-border bg-transparent text-[15px] text-txt outline-none font-body"
          placeholder="Type to search commands..."
          value={commandQuery}
          onChange={(e) => setState("commandQuery", e.target.value)}
        />
        <div className="flex-1 overflow-y-auto py-1">
          {filteredCommands.length === 0 ? (
            <div className="py-5 text-center text-muted text-[13px]">
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                className={`w-full px-4 py-2.5 cursor-pointer flex justify-between items-center text-left text-sm font-body ${
                  idx === commandActiveIndex ? "bg-bg-hover" : "hover:bg-bg-hover"
                }`}
                onClick={() => {
                  cmd.action();
                  closeCommandPalette();
                }}
                onMouseEnter={() => setState("commandActiveIndex", idx)}
              >
                <span>{cmd.label}</span>
                {cmd.hint && <span className="text-xs text-muted">{cmd.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
