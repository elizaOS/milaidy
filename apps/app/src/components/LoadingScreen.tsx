/**
 * Loading screen — ASCII "milady" logo with per-character dither fade.
 *
 * Each letter independently cycles through quantised opacity steps on its
 * own random schedule, producing a constantly shifting dither pattern that
 * resolves into the logo and dissolves again.
 */

import { useEffect, useMemo, useState } from "react";
import type { StartupPhase } from "../AppContext";

/* ── ASCII source ──────────────────────────────────────────────────── */

const ASCII_LINES = [
  "        miladym                        iladym      ",
  "    iladymil                                ady    ",
  "    mil                                         ad   ",
  "ymi                                   ladymila     ",
  "dym                                    ila dymila    ",
  "dy       miladymil                     ady   milady   ",
  "    miladymilad                     ymila dymilady  ",
  "    mi    ladymila                   dymiladymil     ",
  "adymiladymiladymi                  l  adymila d    ",
  "ym   iladymiladymil                 ad ymilad  y    ",
  "m  il  adymiladym  i                  l   ad   y     ",
  "    mi  ladymila  dy                    mi           ",
  "    la          dy                         mil      ",
  "        ad      ym                                   ",
  "        iladym",
];

/* ── Types ─────────────────────────────────────────────────────────── */

interface CharCell {
  char: string;
  isLetter: boolean;
  /** Random animation-delay in seconds */
  delay: number;
  /** Random animation-duration in seconds */
  duration: number;
}

/* ── Component ─────────────────────────────────────────────────────── */

const PHASE_LABELS: Record<StartupPhase, string> = {
  "starting-backend": "starting backend",
  "initializing-agent": "initializing agent",
};

interface LoadingScreenProps {
  phase?: StartupPhase;
  elapsedSeconds?: number;
}

export function LoadingScreen({
  phase = "starting-backend",
  elapsedSeconds,
}: LoadingScreenProps) {
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

  const displayedElapsedSeconds =
    typeof elapsedSeconds === "number"
      ? Math.max(0, Math.floor(elapsedSeconds))
      : runtimeElapsedSeconds;

  /* Build the character grid once — each non-space character gets its
     own random timing so the dither pattern is never uniform. */
  const grid = useMemo<CharCell[][]>(
    () =>
      ASCII_LINES.map((line) =>
        [...line].map((char) => ({
          char,
          isLetter: char !== " ",
          delay: Math.random() * 5,
          duration: 1.4 + Math.random() * 3,
        })),
      ),
    [],
  );

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-bg gap-8">
      <div
        aria-live="polite"
        style={{
          fontFamily: "var(--mono)",
          fontSize: "clamp(7px, 1.4vw, 14px)",
          lineHeight: 1.35,
          color: "var(--text)",
          userSelect: "none",
        }}
      >
        {grid.map((line) => (
          <div
            key={line.map((c) => c.char).join("")}
            style={{ whiteSpace: "pre" }}
          >
            {line.map((c) =>
              c.isLetter ? (
                <span
                  key={`${c.char}-${c.delay.toFixed(3)}-${c.duration.toFixed(3)}`}
                  className="dither-char"
                  style={{
                    animationDelay: `${c.delay.toFixed(2)}s`,
                    animationDuration: `${c.duration.toFixed(2)}s`,
                  }}
                >
                  {c.char}
                </span>
              ) : (
                <span
                  key={`${c.char}-${c.delay.toFixed(3)}-${c.duration.toFixed(3)}`}
                >
                  {c.char}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <div
        className="text-muted text-xs tracking-widest uppercase"
        style={{ fontFamily: "var(--mono)" }}
      >
        {PHASE_LABELS[phase]} ({displayedElapsedSeconds}s)
      </div>
    </div>
  );
}
