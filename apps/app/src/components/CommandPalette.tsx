/**
 * Enhanced Command Palette with fuzzy search and comprehensive commands.
 */

import {
  Bot,
  Bug,
  ChevronRight,
  Command,
  Compass,
  Database,
  FileText,
  FolderOpen,
  Keyboard,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ThemeName, useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ElementType;
  category: string;
  action: () => void;
}

// Fuzzy matching algorithm
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.includes(q)) return 2; // Exact substring match

  // Fuzzy match
  let qIdx = 0;
  let score = 0;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score++;
      qIdx++;
    }
  }

  return qIdx === q.length ? score / t.length : 0;
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
    currentTheme,
    setTheme,
  } = useApp();
  const { open: openBugReport } = useBugReport();
  const closeCommandPalette = useCallback(
    () => setState("commandPaletteOpen", false),
    [setState],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const agentState = agentStatus?.state ?? "stopped";
  const isRunning = agentState === "running";
  const isPaused = agentState === "paused";
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";

  // Build comprehensive command list
  const allCommands = useMemo<CommandItem[]>(() => {
    const commands: CommandItem[] = [];

    // Lifecycle commands
    commands.push({
      id: "agent-status",
      label: `Agent Status: ${agentState}`,
      icon: Bot,
      category: "Agent",
      action: () => {}, // Info only
    });

    if (agentState === "stopped" || agentState === "not_started") {
      commands.push({
        id: "start-agent",
        label: "Start Agent",
        shortcut: "Space",
        icon: Play,
        category: "Agent",
        action: () => {
          handleStart();
          closeCommandPalette();
        },
      });
    }
    if (isRunning || isPaused) {
      commands.push({
        id: "pause-resume-agent",
        label: isPaused ? "Resume Agent" : "Pause Agent",
        shortcut: "Space",
        icon: isPaused ? Play : Pause,
        category: "Agent",
        action: () => {
          handlePauseResume();
          closeCommandPalette();
        },
      });
    }
    commands.push({
      id: "restart-agent",
      label: "Restart Agent",
      shortcut: "Ctrl+R",
      icon: RotateCcw,
      category: "Agent",
      action: () => {
        handleRestart();
        closeCommandPalette();
      },
    });

    // Navigation commands
    const navCommands = [
      {
        id: "nav-chat",
        label: "Open Chat",
        icon: MessageSquare,
        tab: "chat" as const,
      },
      {
        id: "nav-character",
        label: "Open Character",
        icon: Bot,
        tab: "character" as const,
      },
      {
        id: "nav-wallets",
        label: "Open Wallets",
        icon: Wallet,
        tab: "wallets" as const,
      },
      {
        id: "nav-knowledge",
        label: "Open Knowledge",
        icon: FolderOpen,
        tab: "knowledge" as const,
      },
      {
        id: "nav-connectors",
        label: "Open Social",
        icon: Compass,
        tab: "connectors" as const,
      },
      {
        id: "nav-plugins",
        label: "Open Plugins",
        icon: Zap,
        tab: "plugins" as const,
      },
      {
        id: "nav-settings",
        label: "Open Settings",
        icon: Settings,
        tab: "settings" as const,
      },
      {
        id: "nav-database",
        label: "Open Database",
        icon: Database,
        tab: "database" as const,
      },
      {
        id: "nav-logs",
        label: "Open Logs",
        icon: FileText,
        tab: "logs" as const,
      },
      {
        id: "nav-security",
        label: "Open Security",
        icon: Shield,
        tab: "security" as const,
      },
    ];

    navCommands.forEach((cmd) => {
      commands.push({
        id: cmd.id,
        label: cmd.label,
        icon: cmd.icon,
        category: "Navigation",
        action: () => {
          setTab(cmd.tab);
          closeCommandPalette();
        },
      });
    });

    if (currentGameViewerUrl.trim()) {
      commands.push({
        id: "nav-current-game",
        label: "Open Current Game",
        icon: Sparkles,
        category: "Navigation",
        action: () => {
          setTab("apps");
          setState("appsSubTab", "games");
          closeCommandPalette();
        },
      });
    }

    // Theme commands
    const themes = [
      { id: "theme-milady", label: "Milady Theme", value: "milady" },
      { id: "theme-dark", label: "Dark Theme", value: "dark" },
      { id: "theme-qt314", label: "Qt3.14 Theme", value: "qt314" },
      { id: "theme-web2000", label: "Web2000 Theme", value: "web2000" },
      {
        id: "theme-programmer",
        label: "Programmer Theme",
        value: "programmer",
      },
      { id: "theme-haxor", label: "Haxor Theme", value: "haxor" },
    ];

    themes.forEach((theme) => {
      commands.push({
        id: theme.id,
        label: theme.label,
        icon: currentTheme === theme.value ? Command : Plus,
        category: "Appearance",
        action: () => {
          setTheme(theme.value as ThemeName);
          closeCommandPalette();
        },
      });
    });

    // Refresh commands
    commands.push(
      {
        id: "refresh-plugins",
        label: "Refresh Features",
        icon: RefreshCw,
        category: "Refresh",
        action: () => {
          loadPlugins();
          closeCommandPalette();
        },
      },
      {
        id: "refresh-skills",
        label: "Refresh Skills",
        icon: RefreshCw,
        category: "Refresh",
        action: () => {
          loadSkills();
          closeCommandPalette();
        },
      },
      {
        id: "refresh-logs",
        label: "Refresh Logs",
        icon: RefreshCw,
        category: "Refresh",
        action: () => {
          loadLogs();
          closeCommandPalette();
        },
      },
      {
        id: "refresh-workbench",
        label: "Refresh Workbench",
        icon: RefreshCw,
        category: "Refresh",
        action: () => {
          loadWorkbench();
          closeCommandPalette();
        },
      },
    );

    // Chat commands
    commands.push({
      id: "chat-clear",
      label: "Clear Chat",
      shortcut: "Ctrl+Shift+C",
      icon: Trash2,
      category: "Chat",
      action: () => {
        handleChatClear();
        closeCommandPalette();
      },
    });

    // Support commands
    commands.push({
      id: "report-bug",
      label: "Report Bug",
      icon: Bug,
      category: "Support",
      action: () => {
        openBugReport();
        closeCommandPalette();
      },
    });

    commands.push({
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      shortcut: "Shift+?",
      icon: Keyboard,
      category: "Support",
      action: () => {
        // Show shortcuts modal
        closeCommandPalette();
      },
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
    openBugReport,
    currentTheme,
    setTheme,
    closeCommandPalette,
  ]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    allCommands.forEach((cmd) => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [allCommands]);

  // Filter and score commands with fuzzy search
  const filteredCommands = useMemo(() => {
    let commands = allCommands;

    // Filter by category if selected
    if (selectedCategory) {
      commands = commands.filter((cmd) => cmd.category === selectedCategory);
    }

    // Apply fuzzy search
    if (commandQuery.trim()) {
      const scored = commands
        .map((cmd) => ({
          cmd,
          score: fuzzyMatch(commandQuery, cmd.label),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      commands = scored.map((item) => item.cmd);
    }

    return commands;
  }, [allCommands, commandQuery, selectedCategory]);

  // Auto-focus input when opened
  useEffect(() => {
    if (commandPaletteOpen && inputRef.current) {
      inputRef.current.focus();
      setSelectedCategory(null);
    }
  }, [commandPaletteOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!commandPaletteOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeCommandPalette();
          break;
        case "ArrowDown":
          e.preventDefault();
          setState(
            "commandActiveIndex",
            Math.min(filteredCommands.length - 1, commandActiveIndex + 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setState("commandActiveIndex", Math.max(0, commandActiveIndex - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[commandActiveIndex]) {
            filteredCommands[commandActiveIndex].action();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    commandPaletteOpen,
    commandActiveIndex,
    filteredCommands,
    closeCommandPalette,
    setState,
  ]);

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm border-0 cursor-pointer"
        onClick={closeCommandPalette}
        aria-label="Close command palette"
      />

      <div className="w-full max-w-2xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="w-5 h-5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={commandQuery}
            onChange={(e) => {
              setState("commandQuery", e.target.value);
              setState("commandActiveIndex", 0);
            }}
            placeholder="Search commands..."
            className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-muted"
            aria-label="Search commands"
          />
          <button
            type="button"
            onClick={closeCommandPalette}
            className="p-1 hover:bg-bg-hover rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Category Filter */}
        {!commandQuery && (
          <div className="flex gap-2 px-4 py-3 border-b border-border overflow-x-auto scrollbar-hide">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                !selectedCategory
                  ? "bg-accent text-accent-foreground"
                  : "bg-bg-hover text-muted hover:text-txt"
              }`}
            >
              All
            </button>
            {Object.keys(groupedCommands).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? "bg-accent text-accent-foreground"
                    : "bg-bg-hover text-muted hover:text-txt"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* Command List */}
        <div className="max-h-[50vh] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-muted">
              <Command className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No commands found</p>
              <p className="text-sm opacity-60 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filteredCommands.map((cmd, index) => {
                const Icon = cmd.icon;
                const isActive = index === commandActiveIndex;

                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => cmd.action()}
                    onMouseEnter={() => setState("commandActiveIndex", index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? "bg-accent-subtle" : "hover:bg-bg-hover"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "bg-bg-accent text-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-medium ${isActive ? "text-accent" : ""}`}
                      >
                        {cmd.label}
                      </div>
                      <div className="text-xs text-muted">{cmd.category}</div>
                    </div>

                    {cmd.shortcut && (
                      <kbd className="px-2 py-1 text-xs bg-bg-accent border border-border rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}

                    {isActive && (
                      <ChevronRight className="w-4 h-4 text-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-bg-accent/50 text-xs text-muted">
          <div className="flex items-center gap-4">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>ESC to close</span>
          </div>
          <span>
            {filteredCommands.length} command
            {filteredCommands.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
