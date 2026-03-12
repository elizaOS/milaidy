/**
 * Loading screen — NieR: Automata inspired loader with horizontal progress bar,
 * phase label, and percentage indicator.
 */

import { useEffect, useState } from "react";
import type { StartupPhase } from "../AppContext";

/* ── Phase config ──────────────────────────────────────────────────── */

const PHASE_META: Record<StartupPhase, { label: string; progress: number }> = {
  "starting-backend": { label: "Initializing systems", progress: 20 },
  "initializing-agent": { label: "Loading neural network", progress: 50 },
  ready: { label: "Systems online", progress: 100 },
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
  const [, setRuntimeElapsedSeconds] = useState(0);

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

  const meta = PHASE_META[phase];
  const progress = vrmCached ? Math.max(meta.progress, 80) : meta.progress;
  const label = vrmCached && phase !== "ready" ? "Loading avatar" : meta.label;

  return (
    <div className="loading-screen">
      {/* Center content block */}
      <div className="loading-screen__center">
        {/* LOADING label */}
        <div className="loading-screen__title">
          LOADING
          <span className="loading-screen__dots" />
        </div>

        {/* Progress bar row */}
        <div className="loading-screen__bar-row">
          <div className="loading-screen__progress-track">
            <div
              className="loading-screen__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="loading-screen__percent">{progress} %</div>
        </div>

        {/* Phase label */}
        <div className="loading-screen__phase">{label}</div>
      </div>
    </div>
  );
}
