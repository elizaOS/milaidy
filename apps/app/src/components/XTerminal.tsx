import "@xterm/xterm/css/xterm.css";
import { client } from "@milady/app-core/api";
import { useEffect, useRef } from "react";

/**
 * Regex to strip the "clear scrollback" ANSI escape (`\e[3J`) from terminal
 * output. Agents emit this to clear history, but we want to preserve it in
 * the UI so users can scroll back.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping requires control chars
export const CLEAR_SCROLLBACK_RE = /\x1b\[3J/g;

/**
 * Embedded xterm.js terminal pane for a PTY session.
 *
 * Lifecycle:
 * 1. Mount → create Terminal + FitAddon, open in container
 * 2. Hydrate with buffered output via REST (full history)
 * 3. Subscribe to live PTY output via WS (after hydrate to avoid duplicates)
 * 4. Forward keyboard input to PTY
 * 5. Resize on container resize
 * 6. Unmount → unsubscribe, dispose
 *
 * When `active` is false the component stays mounted but hidden (height:0).
 * The terminal keeps receiving WS data in the background. When re-activated,
 * a fit + scrollToBottom is triggered so the display is immediately correct.
 */
export function XTerminal({
  sessionId,
  active = true,
}: {
  sessionId: string;
  active?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let wsUnsub: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      // Dynamic import to keep xterm.js out of the main bundle when unused
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (disposed) return;

      const terminal = new Terminal({
        fontSize: 12,
        scrollback: 5000,
        cursorBlink: true,
        convertEol: true,
        theme: {
          background: "#0a0a0a",
          foreground: "#d4e8c4",
          cursor: "#5a9a2a",
          selectionBackground: "rgba(90, 154, 42, 0.3)",
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Hide until hydration completes to prevent scroll-from-top flash
      container.style.visibility = "hidden";
      terminal.open(container);

      termRef.current = terminal;
      fitRef.current = fitAddon;

      // Fit to container
      try {
        fitAddon.fit();
      } catch {
        // Container may not be visible yet
      }

      // 1. Hydrate with buffered output (full history).
      //    Strip \e[3J (clear scrollback) to preserve scroll history.
      //    Container stays hidden until write completes to prevent flash.
      const buffered = await client.getPtyBufferedOutput(sessionId);
      if (disposed) return;
      if (buffered) {
        terminal.write(buffered.replace(CLEAR_SCROLLBACK_RE, ""), () => {
          if (!disposed) {
            terminal.scrollToBottom();
            container.style.visibility = "";
          }
        });
      } else {
        container.style.visibility = "";
      }

      // 2. THEN subscribe to live output — avoids duplicate data from the
      //    overlap window between subscribe and hydration completing.
      client.subscribePtyOutput(sessionId);
      wsUnsub = client.onWsEvent("pty-output", (msg) => {
        if (
          msg.sessionId === sessionId &&
          typeof msg.data === "string" &&
          !disposed
        ) {
          terminal.write(msg.data.replace(CLEAR_SCROLLBACK_RE, ""));
        }
      });

      // 3. Forward keyboard input
      terminal.onData((data) => {
        if (!disposed) {
          client.sendPtyInput(sessionId, data);
        }
      });

      // 4. Resize handling — skip fit when container is collapsed (height < 10)
      //    to avoid sending bad dimensions to the server PTY.
      resizeObserver = new ResizeObserver(() => {
        if (disposed) return;
        if (container.clientHeight < 10) return;
        try {
          fitAddon.fit();
          client.resizePty(sessionId, terminal.cols, terminal.rows);
        } catch {
          // Ignore fit errors during transitions
        }
      });
      resizeObserver.observe(container);
    })();

    return () => {
      disposed = true;
      client.unsubscribePtyOutput(sessionId);
      wsUnsub?.();
      resizeObserver?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Re-fit and scroll to bottom when the terminal becomes visible again.
  // The container transitions from height:0 → height:300; we need rAF
  // so the layout has settled before FitAddon measures dimensions.
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    const frameId = requestAnimationFrame(() => {
      try {
        fit.fit();
        term.scrollToBottom();
      } catch {
        // Container may not have layout yet
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0"
      style={{ minHeight: 0 }}
    />
  );
}
