import { useEffect, useRef, useMemo } from "react";
import { useApp } from "../AppContext.js";

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

    // Lifecycle commands
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

    // Navigation commands
    commands.push(
      { id: "nav-chat", label: "Open Chat", action: () => setTab("chat") },
      { id: "nav-apps", label: "Open Apps", action: () => setTab("apps") },
      { id: "nav-character", label: "Open Character", action: () => setTab("character") },
      { id: "nav-triggers", label: "Open Triggers", action: () => setTab("triggers") },
      { id: "nav-wallets", label: "Open Wallets", action: () => setTab("wallets") },
      { id: "nav-knowledge", label: "Open Knowledge", action: () => setTab("knowledge") },
      { id: "nav-connectors", label: "Open Connectors", action: () => setTab("connectors") },
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
      { id: "refresh-plugins", label: "Refresh Features", action: loadPlugins },
      { id: "refresh-skills", label: "Refresh Skills", action: loadSkills },
      { id: "refresh-logs", label: "Refresh Logs", action: loadLogs },
      { id: "refresh-workbench", label: "Refresh Workbench", action: loadWorkbench }
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
