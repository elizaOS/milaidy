/**
 * Retake.tv streaming hook for Electron.
 *
 * Starts FFmpeg in "pipe" mode on the backend, then tells the Electron main
 * process to open the game URL in a dedicated offscreen BrowserWindow and
 * capture its frames via capturePage(). Frames are POSTed as JPEG to
 * /api/stream/frame → FFmpeg stdin → H.264 → RTMP to retake.tv.
 *
 * This streams ONLY the game content, not the full Milady app UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveKitStreamState {
  active: boolean;
  status: "idle" | "connecting" | "live" | "error";
  error?: string;
  room?: string;
}

export function useLiveKitStream(gameUrl?: string) {
  const [state, setState] = useState<LiveKitStreamState>({
    active: false,
    status: "idle",
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      const ipc = window.electron?.ipcRenderer;
      if (ipc?.invoke) {
        await ipc.invoke("screencapture:stopFrameCapture").catch(() => {});
      }
    } catch {}
    try {
      const apiBase = window.__MILADY_API_BASE__ || window.location.origin;
      await fetch(`${apiBase}/api/stream/stop`, { method: "POST" });
    } catch {}
    setState({ active: false, status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (state.active) return;
    setState({ active: true, status: "connecting" });

    try {
      const apiBase = window.__MILADY_API_BASE__ || window.location.origin;

      // 1. Start FFmpeg in pipe mode via backend
      console.log("[Stream] Starting FFmpeg pipe stream...");
      const res = await fetch(`${apiBase}/api/stream/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: "pipe",
          resolution: "1280x720",
          bitrate: "2500k",
          framerate: 10,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Stream start failed: ${res.status} ${text}`);
      }

      // 2. Start frame capture — use game URL for offscreen capture
      const ipc = window.electron?.ipcRenderer;
      if (ipc?.invoke) {
        console.log(
          `[Stream] Starting frame capture for: ${gameUrl || "main window"}`,
        );
        await ipc.invoke("screencapture:startFrameCapture", {
          fps: 10,
          quality: 70,
          apiBase,
          endpoint: "/api/stream/frame",
          gameUrl: gameUrl || undefined,
        });
      } else {
        console.warn("[Stream] No Electron IPC — frame capture unavailable");
      }

      console.log("[Stream] Stream pipeline active — live on retake.tv!");
      setState({ active: true, status: "live", room: "live" });

      // Poll health every 10s
      pollRef.current = setInterval(async () => {
        try {
          const healthRes = await fetch(`${apiBase}/api/stream/status`);
          if (healthRes.ok) {
            const health = await healthRes.json();
            if (!health.running || !health.ffmpegAlive) {
              console.warn("[Stream] Stream stopped (FFmpeg exited)");
              if (ipc?.invoke) {
                ipc.invoke("screencapture:stopFrameCapture").catch(() => {});
              }
              setState({ active: false, status: "idle" });
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          }
        } catch {}
      }, 10000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Stream] Stream failed:", message);
      setState({ active: false, status: "error", error: message });
    }
  }, [state.active, gameUrl]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return { state, start, stop };
}
