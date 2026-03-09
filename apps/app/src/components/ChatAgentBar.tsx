/**
 * Agent status/control bar rendered at the top of the chat view.
 *
 * Gives users one-click access to start, pause/resume the autonomous
 * heartbeat loop, and surfaces a compact view of recent autonomous
 * activity (latest thought, action, trigger count).
 */

import {
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { StreamEventEnvelope, TriggerSummary } from "../api-client";

function getEventText(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<string, unknown>;
  const text = payload.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const preview = payload.preview;
  if (typeof preview === "string" && preview.trim()) return preview.trim();
  return event.stream ? `${event.stream} event` : event.type;
}

export function ChatAgentBar() {
  const {
    agentStatus,
    handleStart,
    handlePauseResume,
    handleRestart,
    lifecycleBusy,
    lifecycleAction,
    autonomousEvents,
    workbench,
  } = useApp();

  const [expanded, setExpanded] = useState(false);

  const state = agentStatus?.state ?? "not_started";
  const isRunning = state === "running";
  const isPaused = state === "paused";
  const isStopped = state === "stopped" || state === "not_started";
  const isTransitioning =
    state === "starting" || state === "restarting";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseDisabled =
    lifecycleBusy || state === "restarting" || state === "starting";

  // Latest thought & action from autonomous events
  const latestThought = useMemo(
    () =>
      [...autonomousEvents]
        .reverse()
        .find(
          (e) => e.stream === "assistant" || e.stream === "evaluator",
        ),
    [autonomousEvents],
  );
  const latestAction = useMemo(
    () =>
      [...autonomousEvents]
        .reverse()
        .find(
          (e) =>
            e.stream === "action" ||
            e.stream === "tool" ||
            e.stream === "provider",
        ),
    [autonomousEvents],
  );

  const triggers = (workbench?.triggers ?? []) as TriggerSummary[];
  const activeTriggers = triggers.filter((t) => t.enabled);

  // Status styling
  const statusDot = isRunning
    ? "bg-ok"
    : isPaused
      ? "bg-warn animate-pulse"
      : state === "error"
        ? "bg-danger"
        : "bg-muted";
  const statusLabel = isRunning
    ? "Heartbeat Active"
    : isPaused
      ? "Paused"
      : isStopped
        ? "Stopped"
        : isTransitioning
          ? state === "starting"
            ? "Starting..."
            : "Restarting..."
          : state;

  const btnBase =
    "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium border rounded-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="border-b border-border bg-bg-accent/30 relative" style={{ zIndex: 2 }}>
      {/* ── Compact bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Status indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`}
          />
          <span className="text-[12px] font-medium text-txt truncate">
            {statusLabel}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* Start button — shown when agent is stopped */}
          {isStopped && (
            <button
              type="button"
              className={`${btnBase} border-ok text-ok bg-ok/10 hover:bg-ok/20`}
              onClick={() => void handleStart()}
              disabled={lifecycleBusy}
              title="Start autonomous heartbeat"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start</span>
            </button>
          )}

          {/* Pause/Resume — shown when running or paused */}
          {(isRunning || isPaused) && (
            <button
              type="button"
              className={`${btnBase} ${
                isPaused
                  ? "border-ok text-ok bg-ok/10 hover:bg-ok/20"
                  : "border-warn text-warn bg-warn/10 hover:bg-warn/20"
              }`}
              onClick={() => void handlePauseResume()}
              disabled={pauseDisabled}
              title={isPaused ? "Resume heartbeat" : "Pause heartbeat"}
            >
              {lifecycleBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPaused ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>
          )}

          {/* Restart — always available */}
          {!isStopped && (
            <button
              type="button"
              className={`${btnBase} border-border text-muted hover:border-accent hover:text-accent`}
              onClick={() => void handleRestart()}
              disabled={lifecycleBusy || state === "restarting"}
              title="Restart agent"
            >
              {restartBusy || state === "restarting" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Spinner for transitioning states */}
          {isTransitioning && (
            <Loader2 className="w-4 h-4 text-muted animate-spin" />
          )}

          {/* Expand toggle — show autonomous details */}
          {!isStopped && (
            <button
              type="button"
              className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-accent transition-colors cursor-pointer"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Hide details" : "Show activity"}
              aria-label={expanded ? "Collapse activity" : "Expand activity"}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded activity panel ──────────────────────────────────── */}
      {expanded && !isStopped && (
        <div className="border-t border-border px-3 py-2 space-y-2 text-[12px]">
          {/* Latest thought */}
          <div className="flex items-start gap-2">
            <Activity className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase text-muted font-medium">
                Thought
              </span>
              <p className="text-txt truncate">
                {latestThought
                  ? getEventText(latestThought)
                  : "No thoughts yet"}
              </p>
            </div>
          </div>

          {/* Latest action */}
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-ok shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase text-muted font-medium">
                Action
              </span>
              <p className="text-txt truncate">
                {latestAction
                  ? getEventText(latestAction)
                  : "No actions yet"}
              </p>
            </div>
          </div>

          {/* Trigger summary */}
          {triggers.length > 0 && (
            <div className="flex items-center gap-2 text-muted">
              <span className="text-[10px] uppercase font-medium">
                Triggers
              </span>
              <span className="text-txt text-[11px]">
                {activeTriggers.length} active / {triggers.length} total
              </span>
            </div>
          )}

          {/* Event count */}
          <div className="flex items-center gap-2 text-muted">
            <span className="text-[10px] uppercase font-medium">
              Events
            </span>
            <span className="text-txt text-[11px]">
              {autonomousEvents.length} received
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
