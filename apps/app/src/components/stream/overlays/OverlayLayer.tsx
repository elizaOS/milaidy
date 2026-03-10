/**
 * OverlayLayer — Renders all enabled widget instances as absolute-positioned
 * DOM elements inside the StreamView content area.
 *
 * Z-index strategy:
 *   Content 0 | Widgets 10-39 | Alerts 40-49 | GameViewOverlay 50+
 *
 * When `editable` is true, widgets can be dragged to reposition and
 * corner-resized via pointer events (no external library needed).
 */

import { useCallback, useRef, useMemo } from "react";
import type { StreamEventEnvelope } from "../../../api-client";
import type { AgentMode } from "../helpers";
import { getWidget } from "./registry";
import type { OverlayLayout, WidgetPosition } from "./types";

// Ensure all built-in widgets are registered
import "./built-in";

interface OverlayLayerProps {
  layout: OverlayLayout;
  events: StreamEventEnvelope[];
  agentMode: AgentMode;
  agentName: string;
  /** When true, widgets are draggable and resizable. */
  editable?: boolean;
  /** Called when a widget is moved or resized. */
  onMoveWidget?: (id: string, position: WidgetPosition) => void;
}

export function OverlayLayer({
  layout,
  events,
  agentMode,
  agentName,
  editable,
  onMoveWidget,
}: OverlayLayerProps) {
  const enabledWidgets = useMemo(
    () => layout.widgets.filter((w) => w.enabled),
    [layout.widgets],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  if (enabledWidgets.length === 0 && !editable) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {enabledWidgets.map((instance) => {
        const def = getWidget(instance.type);
        if (!def) return null;

        const filtered = events.filter(
          (e) => e.stream != null && def.subscribesTo.includes(e.stream),
        );
        const Widget = def.render;

        return (
          <DraggableWidget
            key={instance.id}
            id={instance.id}
            position={instance.position}
            zIndex={instance.zIndex}
            editable={editable}
            containerRef={containerRef}
            onMove={onMoveWidget}
          >
            <Widget
              instance={instance}
              events={filtered}
              agentMode={agentMode}
              agentName={agentName}
            />
          </DraggableWidget>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draggable widget wrapper
// ---------------------------------------------------------------------------

function DraggableWidget({
  id,
  position,
  zIndex,
  editable,
  containerRef,
  onMove,
  children,
}: {
  id: string;
  position: WidgetPosition;
  zIndex: number;
  editable?: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMove?: (id: string, position: WidgetPosition) => void;
  children: React.ReactNode;
}) {
  const dragging = useRef<{
    type: "move" | "resize";
    startX: number;
    startY: number;
    origPos: WidgetPosition;
  } | null>(null);

  const pctFromPx = useCallback(
    (dxPx: number, dyPx: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { dx: 0, dy: 0 };
      return {
        dx: (dxPx / rect.width) * 100,
        dy: (dyPx / rect.height) * 100,
      };
    },
    [containerRef],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize") => {
      if (!editable || !onMove) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origPos: { ...position },
      };
    },
    [editable, onMove, position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || !onMove) return;
      const { type, startX, startY, origPos } = dragging.current;
      const { dx, dy } = pctFromPx(e.clientX - startX, e.clientY - startY);

      if (type === "move") {
        onMove(id, {
          ...origPos,
          x: Math.max(0, Math.min(100 - origPos.width, origPos.x + dx)),
          y: Math.max(0, Math.min(100 - origPos.height, origPos.y + dy)),
        });
      } else {
        // Resize: adjust width/height
        onMove(id, {
          ...origPos,
          width: Math.max(3, Math.min(100 - origPos.x, origPos.width + dx)),
          height: Math.max(3, Math.min(100 - origPos.y, origPos.height + dy)),
        });
      }
    },
    [id, onMove, pctFromPx],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  return (
    <div
      className={`absolute pointer-events-auto ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: `${position.width}%`,
        height: `${position.height}%`,
        zIndex,
        outline: editable ? "1px dashed rgba(99,102,241,0.5)" : undefined,
      }}
      onPointerDown={editable ? (e) => handlePointerDown(e, "move") : undefined}
      onPointerMove={editable ? handlePointerMove : undefined}
      onPointerUp={editable ? handlePointerUp : undefined}
    >
      {children}
      {/* Resize handle */}
      {editable && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
          style={{
            background: "rgba(99,102,241,0.7)",
            borderRadius: "2px 0 0 0",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, "resize");
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}
    </div>
  );
}
