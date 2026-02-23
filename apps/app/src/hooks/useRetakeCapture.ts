/**
 * Hook that controls Electron main-process frame capture for retake.tv streaming.
 *
 * Uses Electron's `webContents.capturePage()` via IPC — this captures the full
 * compositor output including cross-origin iframes (unlike the old canvas approach
 * which was blocked by same-origin policy).
 *
 * The main process handles capture + HTTP POST to /api/retake/frame directly.
 * This hook just sends start/stop signals.
 */

import { useEffect, useRef } from "react";

const DEFAULT_FPS = 15;
const JPEG_QUALITY = 70;

declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      };
    };
  }
}

export function useRetakeCapture(
  _iframeRef: React.RefObject<HTMLIFrameElement | null>,
  active: boolean,
  fps = DEFAULT_FPS,
) {
  const activeRef = useRef(false);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) {
      // Not running in Electron — fall back to no-op
      return;
    }

    if (active && !activeRef.current) {
      activeRef.current = true;
      ipc
        .invoke("screencapture:startFrameCapture", {
          fps,
          quality: JPEG_QUALITY,
          endpoint: "/api/retake/frame",
        })
        .catch((err) => {
          console.warn("[retake] Failed to start frame capture:", err);
          activeRef.current = false;
        });
    } else if (!active && activeRef.current) {
      activeRef.current = false;
      ipc.invoke("screencapture:stopFrameCapture").catch((err) => {
        console.warn("[retake] Failed to stop frame capture:", err);
      });
    }

    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        ipc.invoke("screencapture:stopFrameCapture").catch(() => {});
      }
    };
  }, [active, fps]);
}
