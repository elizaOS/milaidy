import type React from "react";
import { useEffect, useRef, useState } from "react";

type BubbleAction = "feed" | "rest" | "manual_share";
type BubbleMoodTier = "excited" | "calm" | "neutral" | "low" | "burnout";

/* ── SVG icon components ─────────────────────────────────────────────── */

const svgProps = {
  viewBox: "0 0 32 32",
  "aria-hidden": true as const,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* ── Mood: Excited — 大眼笑脸 + 双闪光 ────────────────────────────── */
function IconExcited() {
  return (
    <svg {...svgProps}>
      <title>Excited mood</title>
      {/* face */}
      <circle cx="16" cy="17" r="11" strokeWidth={1.5} />
      {/* big sparkly eyes — arcs with lash */}
      <path d="M10.4 15.6a2.1 2.1 0 0 1 3.2 0" strokeWidth={1.8} />
      <circle cx="12" cy="14.6" r="0.55" fill="currentColor" stroke="none" />
      <path d="M18.4 15.6a2.1 2.1 0 0 1 3.2 0" strokeWidth={1.8} />
      <circle cx="20" cy="14.6" r="0.55" fill="currentColor" stroke="none" />
      {/* open smile */}
      <path d="M11.2 20.2c1.2 2.2 7.4 2.2 8.6 0" strokeWidth={1.6} />
      {/* blush */}
      <circle
        cx="9.6"
        cy="19.5"
        r="1.3"
        fill="currentColor"
        stroke="none"
        opacity="0.1"
      />
      <circle
        cx="22.4"
        cy="19.5"
        r="1.3"
        fill="currentColor"
        stroke="none"
        opacity="0.1"
      />
      {/* sparkle top-right */}
      <path
        d="M26 4l0.6 2.2 2.2 0.6-2.2 0.6L26 9.6l-0.6-2.2L23.2 6.8l2.2-0.6z"
        strokeWidth={1.2}
        fill="currentColor"
      />
      {/* sparkle top-left small */}
      <path
        d="M6 2.5l0.4 1.4 1.4 0.4-1.4 0.4L6 6.1l-0.4-1.4-1.4-0.4 1.4-0.4z"
        strokeWidth={1}
        fill="currentColor"
      />
    </svg>
  );
}

/* ── Mood: Calm — 闭眼弯月微笑 ──────────────────────────────────── */
function IconCalm() {
  return (
    <svg {...svgProps}>
      <title>Calm mood</title>
      <circle cx="16" cy="17" r="11" strokeWidth={1.5} />
      {/* closed happy eyes — smooth crescents */}
      <path d="M10 15c0.9-1.6 3.1-1.6 4 0" strokeWidth={1.7} />
      <path d="M18 15c0.9-1.6 3.1-1.6 4 0" strokeWidth={1.7} />
      {/* soft smile */}
      <path d="M12.5 20.6c1 1 6 1 7 0" strokeWidth={1.5} />
      {/* rosy cheeks */}
      <circle
        cx="9.8"
        cy="19"
        r="1.5"
        fill="currentColor"
        stroke="none"
        opacity="0.08"
      />
      <circle
        cx="22.2"
        cy="19"
        r="1.5"
        fill="currentColor"
        stroke="none"
        opacity="0.08"
      />
    </svg>
  );
}

/* ── Mood: Neutral — 圆眼 + 直线嘴 ──────────────────────────────── */
function IconNeutral() {
  return (
    <svg {...svgProps}>
      <title>Neutral mood</title>
      <circle cx="16" cy="17" r="11" strokeWidth={1.5} />
      {/* dot eyes */}
      <circle cx="12" cy="15.2" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="20" cy="15.2" r="1.3" fill="currentColor" stroke="none" />
      {/* flat mouth */}
      <path d="M12.5 21h7" strokeWidth={1.6} />
    </svg>
  );
}

/* ── Mood: Low — 下垂眉 + 弧形皱眉嘴 ────────────────────────────── */
function IconLow() {
  return (
    <svg {...svgProps}>
      <title>Low mood</title>
      <circle cx="16" cy="17" r="11" strokeWidth={1.5} />
      {/* worried brows */}
      <path d="M9.5 12.5c0.8-0.6 2.5-0.4 3.5 0.2" strokeWidth={1.4} />
      <path d="M19 12.7c1-0.6 2.7-0.4 3.5 0.2" strokeWidth={1.4} />
      {/* sad eyes */}
      <circle cx="12" cy="15.8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="15.8" r="1.2" fill="currentColor" stroke="none" />
      {/* frown */}
      <path d="M12 22.2c1.2-2 6.8-2 8 0" strokeWidth={1.6} />
      {/* sweat drop */}
      <path
        d="M24.5 14c0.4-1.8 0.5-0.6 0.8 0a1.2 1.2 0 0 1-0.8 0z"
        fill="currentColor"
        stroke="none"
        opacity="0.2"
      />
    </svg>
  );
}

/* ── Mood: Burnout — 螺旋X眼 + 锯齿嘴 + 裂纹 ────────────────────── */
function IconBurnout() {
  return (
    <svg {...svgProps}>
      <title>Burnout mood</title>
      <circle cx="16" cy="17" r="11" strokeWidth={1.5} />
      {/* X eyes */}
      <path d="M10 13.5l3.2 3.2" strokeWidth={2} />
      <path d="M13.2 13.5L10 16.7" strokeWidth={2} />
      <path d="M18.8 13.5l3.2 3.2" strokeWidth={2} />
      <path d="M22 13.5l-3.2 3.2" strokeWidth={2} />
      {/* zigzag mouth */}
      <path
        d="M9.5 22l2.2-1.8 2.2 1.8 2.2-1.8 2.2 1.8 2.2-1.8"
        strokeWidth={1.7}
      />
      {/* crack line on forehead */}
      <path d="M14.5 6.5l1.5 3 -1 2" strokeWidth={1.1} opacity="0.35" />
    </svg>
  );
}

/* ── Action: Feed — 饱满苹果 + 叶子 + 高光 ───────────────────────── */
function IconFeed() {
  return (
    <svg {...svgProps}>
      <title>Feed action</title>
      {/* apple body — plump heart-like shape */}
      <path
        d="M16 28c-5.5-1-9-5.5-9-10.5 0-3.8 2.8-6 5.2-6.2a4.2 4.2 0 0 1 3.8 1.8 4.2 4.2 0 0 1 3.8-1.8c2.4 0.2 5.2 2.4 5.2 6.2 0 5-3.5 9.5-9 10.5z"
        strokeWidth={1.5}
      />
      {/* stem */}
      <path d="M16 11.3V7.5" strokeWidth={1.7} />
      {/* leaf */}
      <path d="M16 8.5c2-2.5 5-2.2 5.5-1.5s-1.5 3.5-4 4" strokeWidth={1.4} />
      {/* highlight */}
      <path
        d="M11.5 16c0.2-2 1.2-3.2 2.2-3.5"
        strokeWidth={1.2}
        opacity="0.3"
      />
    </svg>
  );
}

/* ── Action: Rest — 渐变 ZZZ 字母 ────────────────────────────────── */
function IconRest() {
  return (
    <svg {...svgProps}>
      <title>Rest action</title>
      {/* big Z */}
      <path d="M8 22h6l-6 7h6" strokeWidth={2.2} />
      {/* medium Z */}
      <path d="M17 14h4.5l-4.5 5.5h4.5" strokeWidth={1.8} />
      {/* small Z */}
      <path d="M22.5 6h3.5l-3.5 4.2h3.5" strokeWidth={1.4} />
      {/* sleep particles */}
      <circle
        cx="5.5"
        cy="26"
        r="0.7"
        fill="currentColor"
        stroke="none"
        opacity="0.2"
      />
      <circle
        cx="28"
        cy="4"
        r="0.5"
        fill="currentColor"
        stroke="none"
        opacity="0.15"
      />
    </svg>
  );
}

/* ── Action: Share — 四角星 + 光芒 ───────────────────────────────── */
function IconManualShare() {
  return (
    <svg {...svgProps}>
      <title>Share action</title>
      {/* four-pointed star — smooth cubic curves */}
      <path
        d="M16 3c0.8 4.2 3.8 7.8 8.5 9-4.7 1.2-7.7 4.8-8.5 9-0.8-4.2-3.8-7.8-8.5-9 4.7-1.2 7.7-4.8 8.5-9z"
        strokeWidth={1.5}
        fill="currentColor"
        fillOpacity="0.06"
      />
      {/* inner glow lines */}
      <path d="M16 9v5" strokeWidth={1.2} opacity="0.25" />
      <path d="M16 18v5" strokeWidth={1.2} opacity="0.25" />
      <path d="M11 12h5" strokeWidth={1.2} opacity="0.25" />
      <path d="M18 12h5" strokeWidth={1.2} opacity="0.25" />
      {/* small companion sparkle */}
      <path
        d="M5.5 5l0.4 1.3 1.3 0.4-1.3 0.4L5.5 8.4l-0.4-1.3-1.3-0.4 1.3-0.4z"
        strokeWidth={0.9}
        fill="currentColor"
      />
      <path
        d="M27 23l0.3 1 1 0.3-1 0.3-0.3 1-0.3-1-1-0.3 1-0.3z"
        strokeWidth={0.8}
        fill="currentColor"
      />
    </svg>
  );
}

/* ── Icon resolvers ──────────────────────────────────────────────────── */

const moodIcons: Record<BubbleMoodTier, () => React.JSX.Element> = {
  excited: IconExcited,
  calm: IconCalm,
  neutral: IconNeutral,
  low: IconLow,
  burnout: IconBurnout,
};

const actionIcons: Record<BubbleAction, () => React.JSX.Element> = {
  feed: IconFeed,
  rest: IconRest,
  manual_share: IconManualShare,
};

/* ── BubbleEmote component ───────────────────────────────────────────── */

export interface BubbleEmoteProps {
  moodTier: BubbleMoodTier;
  activeAction: BubbleAction | null;
  visible: boolean;
}

type DisplayMode = "mood" | "action";

const ACTION_DISPLAY_MS = 2500;
const FADE_MS = 200;

export function BubbleEmote({
  moodTier,
  activeAction,
  visible,
}: BubbleEmoteProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("mood");
  const [displayedMood, setDisplayedMood] = useState<BubbleMoodTier>(moodTier);
  const [displayedAction, setDisplayedAction] = useState<BubbleAction | null>(
    null,
  );
  const [phase, setPhase] = useState<"visible" | "exiting">("visible");

  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  // Handle activeAction changes → show action bubble
  useEffect(() => {
    if (!activeAction) return;

    // Clear any pending timers
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    // Fade out current → show action
    setPhase("exiting");
    fadeTimerRef.current = setTimeout(() => {
      setDisplayedAction(activeAction);
      setDisplayMode("action");
      setPhase("visible");

      // After display duration, fade back to mood
      actionTimerRef.current = setTimeout(() => {
        setPhase("exiting");
        fadeTimerRef.current = setTimeout(() => {
          setDisplayMode("mood");
          setDisplayedMood(moodTier);
          setDisplayedAction(null);
          setPhase("visible");
        }, FADE_MS);
      }, ACTION_DISPLAY_MS);
    }, FADE_MS);
  }, [activeAction, moodTier]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle moodTier changes → fade transition
  useEffect(() => {
    if (displayMode !== "mood") return;
    if (displayedMood === moodTier) return;

    setPhase("exiting");
    fadeTimerRef.current = setTimeout(() => {
      setDisplayedMood(moodTier);
      setPhase("visible");
    }, FADE_MS);
  }, [moodTier, displayMode, displayedMood]);

  if (!visible) return null;

  const Icon =
    displayMode === "action" && displayedAction
      ? actionIcons[displayedAction]
      : moodIcons[displayedMood];

  const className = [
    "companion-bubble-emote",
    phase === "visible" ? "is-visible" : "is-exiting",
  ].join(" ");

  return (
    <div className="companion-bubble-emote__layer">
      <div className={className}>
        <div className="companion-bubble-emote__icon">
          <Icon />
        </div>
        <div className="companion-bubble-emote__tail" />
      </div>
    </div>
  );
}
