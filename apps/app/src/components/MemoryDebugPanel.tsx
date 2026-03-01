/**
 * Memory Debug Panel - Development tool for monitoring memory usage.
 *
 * Shows real-time memory metrics, growth trends, and leak detection.
 * Only renders in development mode by default.
 *
 * Usage:
 *   <MemoryDebugPanel />
 *
 * The panel is draggable and can be minimized. It displays:
 * - Current heap usage
 * - Memory growth trend
 * - Visual indicator for potential leaks
 * - Mini chart of recent memory samples
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  type MemorySample,
  useMemoryMonitor,
} from "../hooks/useMemoryMonitor";

interface MemoryDebugPanelProps {
  /** Force enable in production (default: false, only shows in dev) */
  forceEnable?: boolean;
  /** Initial position */
  initialPosition?: { x: number; y: number };
  /** Initial minimized state */
  initialMinimized?: boolean;
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MiniChart({ samples, maxSamples }: { samples: MemorySample[]; maxSamples: number }) {
  if (samples.length < 2) return null;

  const width = 120;
  const height = 30;
  const padding = 2;

  const values = samples.map((s) => s.usedHeapSize);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = samples.map((sample, i) => {
    const x = padding + (i / (maxSamples - 1)) * (width - 2 * padding);
    const y =
      height -
      padding -
      ((sample.usedHeapSize - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  return (
    <svg width={width} height={height} className="opacity-70">
      <title>Memory usage over time</title>
      <defs>
        <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path
        d={`${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`}
        fill="url(#memGradient)"
      />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MemoryDebugPanel({
  forceEnable = false,
  initialPosition = { x: 16, y: 16 },
  initialMinimized = true,
}: MemoryDebugPanelProps) {
  // Only render in dev mode unless forced
  const shouldRender = forceEnable || import.meta.env.DEV;

  const [minimized, setMinimized] = useState(initialMinimized);
  const [position, setPosition] = useState(initialPosition);
  const dragOrigin = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const { supported, metrics, trend, isLeaking, samples, clearHistory } =
    useMemoryMonitor({
      enabled: shouldRender,
      sampleInterval: 3000,
      maxSamples: 40,
      leakThresholdMbPerMin: 1.0,
      onLeakDetected: (trendInfo, metricsInfo) => {
        console.warn(
          "[MemoryDebugPanel] Potential memory leak detected!",
          {
            growthRate: `${trendInfo.mbPerMinute.toFixed(2)} MB/min`,
            currentHeap: formatMB(metricsInfo.usedHeapSize),
            samples: trendInfo.sampleCount,
          },
        );
      },
    });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      dragOrigin.current = {
        x: position.x,
        y: position.y,
        startX: e.clientX,
        startY: e.clientY,
      };

      const handleMouseMove = (moveE: MouseEvent) => {
        if (!dragOrigin.current) return;
        const dx = moveE.clientX - dragOrigin.current.startX;
        const dy = moveE.clientY - dragOrigin.current.startY;
        setPosition({
          x: Math.max(0, dragOrigin.current.x + dx),
          y: Math.max(0, dragOrigin.current.y + dy),
        });
      };

      const handleMouseUp = () => {
        dragOrigin.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [position],
  );

  const trendDisplay = useMemo(() => {
    if (!trend) return null;
    const sign = trend.mbPerMinute >= 0 ? "+" : "";
    const color =
      trend.mbPerMinute > 1
        ? "text-danger"
        : trend.mbPerMinute > 0.5
          ? "text-warning"
          : trend.mbPerMinute < -0.5
            ? "text-success"
            : "text-muted";
    return (
      <span className={color}>
        {sign}
        {trend.mbPerMinute.toFixed(2)} MB/min
      </span>
    );
  }, [trend]);

  if (!shouldRender || !supported) return null;

  return (
    <div
      className="fixed z-[9999] bg-bg border border-border rounded-lg shadow-lg text-xs font-mono select-none"
      style={{
        left: position.x,
        top: position.y,
        minWidth: minimized ? 120 : 200,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-bg-muted rounded-t-lg cursor-move">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isLeaking
                ? "bg-danger animate-pulse"
                : "bg-success"
            }`}
          />
          <span className="text-txt-muted">Memory</span>
        </div>
        <div className="flex items-center gap-1">
          {!minimized && (
            <button
              type="button"
              className="p-0.5 hover:bg-accent/20 rounded text-muted hover:text-txt"
              onClick={clearHistory}
              title="Clear history"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Clear</title>
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="p-0.5 hover:bg-accent/20 rounded text-muted hover:text-txt"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? "Expand" : "Minimize"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <title>{minimized ? "Expand" : "Minimize"}</title>
              {minimized ? (
                <polyline points="15 3 21 3 21 9" />
              ) : (
                <line x1="5" y1="12" x2="19" y2="12" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
        {minimized ? (
          <div className="text-center">
            <span className="text-txt">
              {metrics ? formatMB(metrics.usedHeapSize) : "..."}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Current usage */}
            <div className="flex justify-between">
              <span className="text-muted">Heap:</span>
              <span className="text-txt">
                {metrics ? formatMB(metrics.usedHeapSize) : "..."}
              </span>
            </div>

            {/* Limit */}
            <div className="flex justify-between">
              <span className="text-muted">Limit:</span>
              <span className="text-txt">
                {metrics ? formatMB(metrics.heapSizeLimit) : "..."}
              </span>
            </div>

            {/* Usage bar */}
            {metrics && (
              <div className="h-1.5 bg-bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    metrics.usagePercent > 80
                      ? "bg-danger"
                      : metrics.usagePercent > 60
                        ? "bg-warning"
                        : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(100, metrics.usagePercent)}%` }}
                />
              </div>
            )}

            {/* Trend */}
            <div className="flex justify-between">
              <span className="text-muted">Trend:</span>
              {trendDisplay ?? <span className="text-muted">...</span>}
            </div>

            {/* Mini chart */}
            <MiniChart samples={samples} maxSamples={40} />

            {/* Leak warning */}
            {isLeaking && (
              <div className="text-danger text-center text-[10px] font-bold animate-pulse">
                POTENTIAL LEAK DETECTED
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryDebugPanel;
