import { useEffect, useRef, useMemo } from "react";
import { useApp } from "../AppContext.js";
import { createTranslator } from "../i18n";

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
    uiLanguage,
    setState,
    closeCommandPalette,
  } = useApp();
  const t = createTranslator(uiLanguage);

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
        label: t("command.startAgent"),
        action: handleStart,
      });
    }
    if (isRunning || isPaused) {
      commands.push({
        id: "pause-resume-agent",
        label: isPaused ? t("command.resumeAgent") : t("command.pauseAgent"),
        action: handlePauseResume,
      });
    }
    commands.push({
      id: "restart-agent",
      label: t("command.restartAgent"),
      action: handleRestart,
    });

    // Navigation commands
    commands.push(
      { id: "nav-chat", label: t("command.openChat"), action: () => setTab("chat") },
      { id: "nav-companion", label: t("command.openCompanion"), action: () => setTab("companion") },
      { id: "nav-apps", label: t("command.openApps"), action: () => setTab("apps") },
      { id: "nav-character", label: t("command.openCharacter"), action: () => setTab("character") },
      { id: "nav-triggers", label: t("command.openTriggers"), action: () => setTab("triggers") },
      { id: "nav-wallets", label: t("command.openWallets"), action: () => setTab("wallets") },
      { id: "nav-knowledge", label: t("command.openKnowledge"), action: () => setTab("knowledge") },
      { id: "nav-connectors", label: t("command.openSocial"), action: () => setTab("connectors") },
      { id: "nav-plugins", label: t("command.openPlugins"), action: () => setTab("plugins") },
      { id: "nav-config", label: t("command.openConfig"), action: () => setTab("settings") },
      { id: "nav-database", label: t("command.openDatabase"), action: () => setTab("database") },
      { id: "nav-settings", label: t("command.openSettings"), action: () => setTab("settings") },
      { id: "nav-logs", label: t("command.openLogs"), action: () => setTab("logs") }
    );

    if (currentGameViewerUrl.trim()) {
      commands.push({
        id: "nav-current-game",
        label: t("command.openCurrentGame"),
        action: () => {
          setTab("apps");
          setState("appsSubTab", "games");
        },
      });
    }

    // Refresh commands
    commands.push(
      { id: "refresh-plugins", label: t("command.refreshFeatures"), action: loadPlugins },
      { id: "refresh-skills", label: t("command.refreshSkills"), action: loadSkills },
      { id: "refresh-logs", label: t("command.refreshLogs"), action: loadLogs },
      { id: "refresh-workbench", label: t("command.refreshWorkbench"), action: loadWorkbench }
    );

    // Chat commands
    commands.push({
      id: "chat-clear",
      label: t("command.clearChat"),
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
    t,
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
          placeholder={t("command.searchPlaceholder")}
          value={commandQuery}
          onChange={(e) => setState("commandQuery", e.target.value)}
        />
        <div className="flex-1 overflow-y-auto py-1">
          {filteredCommands.length === 0 ? (
            <div className="py-5 text-center text-muted text-[13px]">
              {t("command.empty")}
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
