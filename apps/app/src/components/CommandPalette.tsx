import { useCallback, useEffect, useMemo, useRef } from "react";
import { useApp } from "../AppContext";
import { COMMAND_PALETTE_EVENT } from "../events";
import { useBugReport } from "../hooks/useBugReport";
import {
  buildCommandPaletteCommands,
  type CommandItem,
} from "./command-palette-commands";

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
    t,
  } = useApp();
  const { open: openBugReport } = useBugReport();
  const closeCommandPalette = useCallback(
    () => setState("commandPaletteOpen", false),
    [setState],
  );

  const inputRef = useRef<HTMLInputElement>(null);

  const agentState = agentStatus?.state ?? "stopped";
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";

  const allCommands = useMemo<CommandItem[]>(() => {
    return buildCommandPaletteCommands({
      agentState,
      activeGameViewerUrl: currentGameViewerUrl,
      handleStart,
      handlePauseResume,
      handleRestart,
      setTab,
      setAppsSubTab: () => setState("appsSubTab", "games"),
      loadPlugins,
      loadSkills,
      loadLogs,
      loadWorkbench,
      handleChatClear,
      openBugReport,
    });
  }, [
    agentState,
    currentGameViewerUrl,
    handleStart,
    handlePauseResume,
    handleRestart,
    setTab,
    setState,
    loadPlugins,
    loadSkills,
    loadLogs,
    loadWorkbench,
    handleChatClear,
    openBugReport,
  ]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!commandQuery.trim()) return allCommands;
    const query = commandQuery.toLowerCase();
    return allCommands.filter((cmd) => cmd.label.toLowerCase().includes(query));
  }, [allCommands, commandQuery]);

  // Listen for milady:command-palette from main.tsx (electron shortcut Cmd/Ctrl+K)
  useEffect(() => {
    const toggle = () => {
      setState("commandPaletteOpen", !commandPaletteOpen);
      if (!commandPaletteOpen) {
        setState("commandQuery", "");
        setState("commandActiveIndex", 0);
      }
    };
    document.addEventListener(COMMAND_PALETTE_EVENT, toggle);
    return () => document.removeEventListener(COMMAND_PALETTE_EVENT, toggle);
  }, [commandPaletteOpen, setState]);

  // Also listen for Ctrl/Meta+K in the browser (non-native context)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setState("commandPaletteOpen", !commandPaletteOpen);
        if (!commandPaletteOpen) {
          setState("commandQuery", "");
          setState("commandActiveIndex", 0);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, setState]);

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
        if (filteredCommands.length === 0) return;
        e.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex < filteredCommands.length - 1
            ? commandActiveIndex + 1
            : 0,
        );
        return;
      }

      if (e.key === "ArrowUp") {
        if (filteredCommands.length === 0) return;
        e.preventDefault();
        setState(
          "commandActiveIndex",
          commandActiveIndex > 0
            ? commandActiveIndex - 1
            : filteredCommands.length - 1,
        );
        return;
      }

      if (e.key === "Enter") {
        if (filteredCommands.length === 0) return;
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

  useEffect(() => {
    if (filteredCommands.length === 0) {
      if (commandActiveIndex !== 0) {
        setState("commandActiveIndex", 0);
      }
      return;
    }

    const maxIndex = filteredCommands.length - 1;
    if (commandActiveIndex < 0 || commandActiveIndex > maxIndex) {
      setState(
        "commandActiveIndex",
        Math.min(Math.max(commandActiveIndex, 0), maxIndex),
      );
    }
  }, [commandActiveIndex, filteredCommands.length, setState]);

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
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeCommandPalette();
        }
      }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div
        className="bg-bg border border-border w-[520px] max-h-[420px] flex flex-col shadow-2xl"
        role="document"
      >
        <input
          ref={inputRef}
          type="text"
          className="w-full px-4 py-3.5 border-b border-border bg-transparent text-[15px] text-txt outline-none font-body"
          placeholder={t("commandpalette.TypeToSearchComma")}
          value={commandQuery}
          onChange={(e) => setState("commandQuery", e.target.value)}
        />
        <div className="flex-1 overflow-y-auto py-1">
          {filteredCommands.length === 0 ? (
            <div className="py-5 text-center text-muted text-[13px]">

              {t("commandpalette.NoCommandsFound")}
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                type="button"
                key={cmd.id}
                className={`w - full px - 4 py - 2.5 cursor - pointer flex justify - between items - center text - left text - sm font - body ${idx === commandActiveIndex
                    ? "bg-bg-hover"
                    : "hover:bg-bg-hover"
                  } `}
                onClick={() => {
                  cmd.action();
                  closeCommandPalette();
                }}
                onMouseEnter={() => setState("commandActiveIndex", idx)}
              >
                <span>{cmd.label}</span>
                {cmd.hint && (
                  <span className="text-xs text-muted">{cmd.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
