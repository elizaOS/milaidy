/**
 * Loading screen — modern, game-like loader with animated spinner ring
 * and smooth phase indicator. Uses the same `--bg` background as the main app.
 */

import { useEffect, useState } from "react";
import type { StartupPhase } from "../AppContext";

/* ── Phase config ──────────────────────────────────────────────────── */

const PHASE_META: Record<StartupPhase, { label: string; progress: number }> = {
  "starting-backend": { label: "Starting backend", progress: 20 },
  "initializing-agent": { label: "Initializing agent", progress: 50 },
  ready: { label: "Ready", progress: 100 },
};

/* ── Component ─────────────────────────────────────────────────────── */

interface LoadingScreenProps {
  phase?: StartupPhase;
  elapsedSeconds?: number;
  /** URL of the VRM to prefetch so it’s cached when the 3D viewer mounts. */
  vrmUrl?: string;
}

export function LoadingScreen({
  phase = "starting-backend",
  elapsedSeconds,
  vrmUrl,
}: LoadingScreenProps) {
  const [vrmCached, setVrmCached] = useState(false);
  const [runtimeElapsedSeconds, setRuntimeElapsedSeconds] = useState(0);

  useEffect(() => {
    if (typeof elapsedSeconds === "number") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRuntimeElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [elapsedSeconds]);

  // Prefetch VRM binary so the browser cache has it when VrmEngine loads later
  useEffect(() => {
    if (!vrmUrl) return;
    const controller = new AbortController();
    fetch(vrmUrl, { signal: controller.signal })
      .then(() => setVrmCached(true))
      .catch(() => {
        /* non-blocking — VRM will load normally later */
      });
    return () => controller.abort();
  }, [vrmUrl]);

  const displayedElapsedSeconds =
    typeof elapsedSeconds === "number"
      ? Math.max(0, Math.floor(elapsedSeconds))
      : runtimeElapsedSeconds;

  const meta = PHASE_META[phase];
  // Bump progress once VRM is cached
  const progress = vrmCached ? Math.max(meta.progress, 80) : meta.progress;
  const label = vrmCached && phase !== "ready" ? "Loading avatar" : meta.label;

  return (
    <div className="loading-screen">
      {/* Ambient glow behind the spinner */}
      <div className="loading-screen__glow" />

      {/* Spinner ring */}
      <div className="loading-screen__spinner">
        <svg viewBox="0 0 100 100" className="loading-screen__ring">
          <title>Loading spinner</title>
          {/* Track */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
            opacity="0.3"
          />
          {/* Animated arc */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="180 276"
            className="loading-screen__arc"
          />
        </svg>

        {/* Center logo mark */}
        <div className="loading-screen__logo">M</div>
      </div>

      {/* Progress bar */}
      <div className="loading-screen__progress-track">
        <div
          className="loading-screen__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Phase label */}
      <div className="loading-screen__label">
        {label}
        <span className="loading-screen__dots" />
      </div>

      {/* Elapsed timer */}
      <div className="loading-screen__timer">{displayedElapsedSeconds}s</div>
    </div>
  );
}
