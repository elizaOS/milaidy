/**
 * Terminal panel — shows output from agent-initiated commands.
 *
 * Listens for "terminal-output" WebSocket events from the server and renders
 * a collapsible bottom panel with command output. Auto-opens when a command starts.
 */

import {
  ChevronUp,
  Maximize2,
  Minimize2,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { client } from "../api-client";

export interface TerminalPanelHandle {
  /** Programmatically run a command via the API. */
  runCommand: (command: string) => void;
  /** Toggle panel open/closed state */
  toggle: () => void;
  /** Check if panel is open */
  isOpen: () => boolean;
}

interface TerminalLine {
  id: string;
  type: "command" | "stdout" | "stderr" | "exit" | "error";
  text: string;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle>(
  function TerminalPanel(_props, ref) {
    const [open, setOpen] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);
    const prevLinesLength = useRef(0);

    const addLine = useCallback(
      (type: TerminalLine["type"], text: string) => {
        const id = String(++lineIdRef.current);
        setLines((prev) => {
          // Cap at 500 lines to prevent memory bloat
          const next = [...prev, { id, type, text }];
          return next.length > 500 ? next.slice(-500) : next;
        });
        // Track unread lines when panel is minimized
        if (minimized || !open) {
          setUnreadCount((prev) => prev + 1);
        }
      },
      [minimized, open],
    );

    // Auto-scroll to bottom on new lines
    useEffect(() => {
      const el = scrollRef.current;
      if (el && lines.length !== prevLinesLength.current) {
        el.scrollTop = el.scrollHeight;
        prevLinesLength.current = lines.length;
      }
    }, [lines]);

    // Listen for terminal-output WebSocket events
    useEffect(() => {
      const unbind = client.onWsEvent(
        "terminal-output",
        (data: Record<string, unknown>) => {
          const event = data.event as string;
          switch (event) {
            case "start":
              setOpen(true);
              addLine("command", `$ ${data.command as string}`);
              break;
            case "stdout":
              addLine("stdout", data.data as string);
              break;
            case "stderr":
              addLine("stderr", data.data as string);
              break;
            case "exit":
              addLine(
                "exit",
                `Process exited with code ${data.code as number}`,
              );
              break;
            case "error":
              addLine("error", `Error: ${data.data as string}`);
              break;
          }
        },
      );
      return unbind;
    }, [addLine]);

    // Keyboard shortcut to toggle terminal (Ctrl+Shift+T)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
          e.preventDefault();
          setOpen((prev) => !prev);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Imperative handle for programmatic control
    useImperativeHandle(ref, () => ({
      runCommand: async (command: string) => {
        setOpen(true);
        setMinimized(false);
        try {
          await client.runTerminalCommand(command);
        } catch (err) {
          addLine(
            "error",
            `Failed to send command: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
      toggle: () => {
        setOpen((prev) => !prev);
      },
      isOpen: () => open,
    }));

    const handleClear = useCallback(() => {
      setLines([]);
      lineIdRef.current = 0;
      setUnreadCount(0);
    }, []);

    const handleToggleMinimize = useCallback(() => {
      setMinimized((prev) => !prev);
      if (!minimized) {
        // When minimizing, keep unread count, when maximizing, clear it
      } else {
        setUnreadCount(0);
      }
    }, [minimized]);

    const handleClose = useCallback(() => {
      setOpen(false);
      setMinimized(false);
      setUnreadCount(0);
    }, []);

    // Collapsed indicator bar when minimized
    if (minimized && open) {
      return (
        <div className="border-t border-border bg-bg-elevated">
          <button
            type="button"
            onClick={handleToggleMinimize}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent" />
              <span className="text-xs font-mono text-muted">Terminal</span>
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-accent text-accent-fg text-[10px] rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <ChevronUp className="w-4 h-4 text-muted" />
          </button>
        </div>
      );
    }

    // Closed state - show nothing or a collapsed bar
    if (!open) {
      return (
        <div className="border-t border-border bg-bg">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-1.5 hover:bg-bg-hover transition-colors text-[11px] text-muted"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Show Terminal</span>
            {unreadCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-accent text-accent-fg text-[10px] rounded-full">
                {unreadCount}
              </span>
            )}
            <span className="ml-1 text-[10px] opacity-60">(Ctrl+Shift+T)</span>
          </button>
        </div>
      );
    }

    return (
      <div
        className="border-t border-border bg-bg-elevated flex flex-col shadow-lg"
        style={{ height: minimized ? "auto" : 220 }}
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-accent shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-mono text-muted-strong tracking-wide">
              TERMINAL
            </span>
          </div>
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-muted hover:text-txt hover:bg-bg-hover rounded transition-colors"
              title="Clear terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleToggleMinimize}
              className="p-1.5 text-muted hover:text-txt hover:bg-bg-hover rounded transition-colors"
              title={minimized ? "Maximize" : "Minimize"}
            >
              {minimized ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Minimize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
              title="Close terminal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Output area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-all bg-[#0a0a0a]"
        >
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Terminal className="w-8 h-8 text-muted opacity-30 mb-2" />
              <span className="text-muted opacity-60 text-[11px]">
                Terminal output will appear here
                <br />
                when the agent runs commands.
              </span>
            </div>
          ) : (
            lines.map((line) => (
              <div
                key={line.id}
                className={
                  line.type === "command"
                    ? "text-accent font-bold"
                    : line.type === "stderr" || line.type === "error"
                      ? "text-destructive"
                      : line.type === "exit"
                        ? "text-muted"
                        : "text-[#ccc]"
                }
              >
                {line.text}
              </div>
            ))
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-bg-accent text-[10px] text-muted">
          <span>{lines.length} lines</span>
          <span>Ctrl+Shift+T to toggle</span>
        </div>
      </div>
    );
  },
);
