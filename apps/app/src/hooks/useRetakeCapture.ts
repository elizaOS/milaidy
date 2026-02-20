/**
 * Hook that captures frames from an iframe and POSTs them to the server
 * for retake.tv browser-capture streaming mode.
 *
 * Does nothing unless `active` is true. Safe to call unconditionally.
 * Only works on same-origin iframes (cross-origin will silently no-op).
 *
 * Looks for a <canvas> inside the iframe (game clients render to canvas)
 * and draws it to an offscreen canvas for JPEG export.
 */

import { useEffect, useRef } from "react";

const DEFAULT_FPS = 15;
const JPEG_QUALITY = 0.7;
const FRAME_ENDPOINT = "/api/retake/frame";

export function useRetakeCapture(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  active: boolean,
  fps = DEFAULT_FPS,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    const interval = Math.round(1000 / fps);

    timerRef.current = setInterval(() => {
      if (pendingRef.current) return; // Skip if previous frame still uploading

      const iframe = iframeRef.current;
      if (!iframe) return;

      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Find the game's canvas element inside the iframe
        const sourceCanvas = doc.querySelector("canvas");
        if (!sourceCanvas || sourceCanvas.width === 0) return;

        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }
        const canvas = canvasRef.current;
        canvas.width = sourceCanvas.width;
        canvas.height = sourceCanvas.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(sourceCanvas, 0, 0);

        pendingRef.current = true;
        canvas.toBlob(
          (blob) => {
            if (blob) {
              fetch(FRAME_ENDPOINT, { method: "POST", body: blob })
                .catch((err) => {
                  console.warn("[retake] frame push failed:", err);
                })
                .finally(() => {
                  pendingRef.current = false;
                });
            } else {
              pendingRef.current = false;
            }
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      } catch {
        // Cross-origin or other DOM access error — silently skip
        pendingRef.current = false;
      }
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, fps, iframeRef]);
}
