import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { client } from "../api-client";

/**
 * Embedded xterm.js terminal pane for a PTY session.
 *
 * Lifecycle:
 * 1. Mount → create Terminal + FitAddon, open in container
 * 2. Subscribe to live PTY output via WS
 * 3. Hydrate with buffered output via REST
 * 4. Forward keyboard input to PTY
 * 5. Resize on container resize
 * 6. Unmount → unsubscribe, dispose
 */
export function XTerminal({ sessionId }: { sessionId: string }) {
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
      terminal.open(container);

      termRef.current = terminal;
      fitRef.current = fitAddon;

      // Fit to container
      try {
        fitAddon.fit();
      } catch {
        // Container may not be visible yet
      }

      // 1. Subscribe to live output BEFORE hydrating so no data is missed
      client.subscribePtyOutput(sessionId);
      wsUnsub = client.onWsEvent("pty-output", (msg) => {
        if (
          msg.sessionId === sessionId &&
          typeof msg.data === "string" &&
          !disposed
        ) {
          terminal.write(msg.data);
        }
      });

      // 2. Hydrate with buffered output
      const buffered = await client.getPtyBufferedOutput(sessionId);
      if (!disposed && buffered) {
        terminal.write(buffered);
      }

      // 3. Forward keyboard input
      terminal.onData((data) => {
        if (!disposed) {
          client.sendPtyInput(sessionId, data);
        }
      });

      // 4. Resize handling
      resizeObserver = new ResizeObserver(() => {
        if (disposed) return;
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0"
      style={{ minHeight: 0 }}
    />
  );
}
