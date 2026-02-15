/**
 * Terminal panel — shows output from agent-initiated commands.
 *
 * Listens for "terminal-output" WebSocket events from the server and renders
 * a collapsible bottom panel with command output. Auto-opens when a command starts.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { client } from "../api-client";

export interface TerminalPanelHandle {
  /** Programmatically run a command via the API. */
  runCommand: (command: string) => void;
}

interface TerminalLine {
  id: string;
  type: "command" | "stdout" | "stderr" | "exit" | "error";
  text: string;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle>(
  function TerminalPanel(_props, ref) {
    const [open, setOpen] = useState(false);
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);

    const addLine = useCallback((type: TerminalLine["type"], text: string) => {
      const id = String(++lineIdRef.current);
      setLines((prev) => {
        // Cap at 500 lines to prevent memory bloat
        const next = [...prev, { id, type, text }];
        return next.length > 500 ? next.slice(-500) : next;
      });
    }, []);

    // Auto-scroll to bottom on new lines
    useEffect(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
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

    // Imperative handle for programmatic command execution
    useImperativeHandle(ref, () => ({
      runCommand: async (command: string) => {
        setOpen(true);
        try {
          await client.runTerminalCommand(command);
        } catch (err) {
          addLine(
            "error",
            `Failed to send command: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    }));

    const handleClear = useCallback(() => {
      setLines([]);
      lineIdRef.current = 0;
    }, []);

    if (!open) return null;

    return (
      <div className="border-t border-border bg-[#1a1a1a] flex flex-col" style={{ height: 220 }}>
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-[#111] shrink-0">
          <span className="text-[11px] font-mono text-muted tracking-wide">TERMINAL</span>
          <div className="flex-1" />
          <button
            type="button"
            className="text-[10px] text-muted hover:text-txt px-1.5 py-0.5 cursor-pointer"
            onClick={handleClear}
          >
            Clear
          </button>
          <button
            type="button"
            className="text-muted hover:text-txt text-sm leading-none px-1 cursor-pointer"
            onClick={() => setOpen(false)}
          >
            &times;
          </button>
        </div>

        {/* Output area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-all"
        >
          {lines.length === 0 ? (
            <span className="text-muted italic text-[11px]">
              Terminal output will appear here when the agent runs commands.
            </span>
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
      </div>
    );
  },
);
