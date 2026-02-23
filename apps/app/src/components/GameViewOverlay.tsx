/**
 * GameViewOverlay — compact floating iframe overlay that persists across tabs.
 *
 * Rendered at the App.tsx level so it stays visible when the user navigates
 * away from the Apps tab. Provides drag, resize, and close controls.
 */

import { useCallback, useRef, useState } from "react";
import { useApp } from "../AppContext";

export function GameViewOverlay() {
  const {
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    setState,
  } = useApp();

  // --- Drag state ---
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      setPos({
        x: ev.clientX - dragOffset.current.x,
        y: ev.clientY - dragOffset.current.y,
      });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleClose = useCallback(() => {
    setState("gameOverlayEnabled", false);
  }, [setState]);

  const handleExpand = useCallback(() => {
    setState("gameOverlayEnabled", false);
    setState("tab", "apps");
    setState("appsSubTab", "games");
  }, [setState]);

  if (!activeGameViewerUrl) return null;

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 16, bottom: 16 };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={containerRef}
        className="absolute w-[480px] h-[360px] pointer-events-auto rounded-lg overflow-hidden shadow-2xl border border-border bg-bg flex flex-col"
        style={{ resize: "both", ...style }}
      >
        {/* Drag handle / header */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border select-none"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          <button
            type="button"
            className="font-bold text-[11px] truncate flex-1 text-left cursor-inherit"
            onMouseDown={handleDragStart}
            aria-label="Drag overlay"
          >
            {activeGameDisplayName || "Game"}
          </button>
          <button
            type="button"
            className="text-[10px] px-2 py-0.5 border border-border bg-card cursor-pointer hover:border-accent hover:text-accent"
            onClick={handleExpand}
            title="Expand back to Apps tab"
          >
            Expand
          </button>
          <button
            type="button"
            className="text-[10px] px-2 py-0.5 border border-border bg-card cursor-pointer hover:border-danger hover:text-danger"
            onClick={handleClose}
            title="Close overlay"
          >
            Close
          </button>
        </div>
        {/* Iframe */}
        <iframe
          src={activeGameViewerUrl}
          sandbox={activeGameSandbox}
          className="flex-1 w-full border-none"
          title={activeGameDisplayName || "Game Overlay"}
        />
      </div>
    </div>
  );
}
