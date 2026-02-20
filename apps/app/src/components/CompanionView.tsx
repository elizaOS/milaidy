import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  useApp,
  VRM_COUNT,
} from "../AppContext.js";
import type { CompanionAction, CompanionPolicyLevel } from "../api-client.js";
import { VrmViewer } from "./avatar/VrmViewer";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import {
  resolveCompanionAnimationIntent,
  MOOD_ANIMATION_POOLS,
  ACTION_ANIMATION_MAP,
  pickRandomAnimationDef,
} from "./avatar/companionAnimationIntent";
import { BubbleEmote } from "./BubbleEmote";
import { createTranslator } from "../i18n";

type QuickActionGlyph = "feed" | "rest" | "manual_share";
type QuickActionTone = "ready" | "cooldown" | "limit";

function QuickActionIcon({ kind }: { kind: QuickActionGlyph }) {
  if (kind === "feed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 15h14" />
        <path d="M7 15a5 5 0 0 0 10 0" />
        <path d="M9 10V5" />
        <path d="M12 10V4" />
        <path d="M15 10v4" />
        <path d="M18 10v4" />
      </svg>
    );
  }

  if (kind === "rest") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h16" />
        <rect x="4" y="12" width="16" height="5" rx="1.5" />
        <path d="M6 17v2" />
        <path d="M18 17v2" />
        <path d="M8 12V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratioPercent(value: number, cap: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(cap) || cap <= 0) return 0;
  return toPercent((value / cap) * 100);
}

function formatClockHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, Math.trunc(hour)));
  return `${String(safe).padStart(2, "0")}:00`;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function CompanionView() {
  const {
    companionSnapshot,
    companionActivity,
    companionLoading,
    companionActionBusy,
    loadCompanion,
    refreshCompanionActivity,
    runCompanionAction,
    updateCompanionSettings,
    setState,
    selectedVrmIndex,
    customVrmUrl,
    copyToClipboard,
    uiLanguage,
    setTab,
  } = useApp();
  const t = createTranslator(uiLanguage);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autopostEnabled, setAutopostEnabled] = useState(true);
  const [autopostDryRun, setAutopostDryRun] = useState(true);
  const [quietStart, setQuietStart] = useState(1);
  const [quietEnd, setQuietEnd] = useState(8);
  const [policyLevel, setPolicyLevel] = useState<CompanionPolicyLevel>("balanced");
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const [lastTriggeredAction, setLastTriggeredAction] = useState<CompanionAction | null>(null);
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);
  const idleCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionAnimatingRef = useRef(false);
  const scheduleNextAccentRef = useRef<() => void>(() => { });
  const prevSnapshotVersionRef = useRef<number | null>(null);
  const prevStatsRef = useRef<Record<string, number>>({});

  const [changedStats, setChangedStats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!companionSnapshot && !companionLoading) {
      void loadCompanion();
    }
  }, [companionSnapshot, companionLoading, loadCompanion]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!companionSnapshot) return;
    const autopost = companionSnapshot.state.autopost;
    setAutopostEnabled(autopost.enabled);
    setAutopostDryRun(autopost.dryRun);
    setQuietStart(autopost.quietHoursStart);
    setQuietEnd(autopost.quietHoursEnd);
    setPolicyLevel(autopost.policyLevel);
  }, [companionSnapshot]);

  useEffect(() => {
    if (!companionSnapshot) return;
    const stats = companionSnapshot.state.stats;
    const prev = prevStatsRef.current;
    const changed = new Set<string>();
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === "number" && prev[key] !== undefined && prev[key] !== value) {
        changed.add(key);
      }
    }
    if (changed.size > 0) {
      setChangedStats(changed);
      const timer = setTimeout(() => setChangedStats(new Set()), 1200);
      prevStatsRef.current = Object.fromEntries(
        Object.entries(stats).filter(([, v]) => typeof v === "number")
      ) as Record<string, number>;
      return () => clearTimeout(timer);
    }
    prevStatsRef.current = Object.fromEntries(
      Object.entries(stats).filter(([, v]) => typeof v === "number")
    ) as Record<string, number>;
  }, [companionSnapshot]);

  const cooldowns = useMemo(() => {
    const state = companionSnapshot?.state;
    if (!state) {
      return {
        feed: 0,
        rest: 0,
        manualShare: 0,
      };
    }
    return {
      feed: Math.max(0, state.cooldowns.feedAvailableAtMs - nowMs),
      rest: Math.max(0, state.cooldowns.restAvailableAtMs - nowMs),
      manualShare: Math.max(0, state.cooldowns.manualShareAvailableAtMs - nowMs),
    };
  }, [companionSnapshot, nowMs]);

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath = selectedVrmIndex === 0 && customVrmUrl
    ? customVrmUrl
    : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl = selectedVrmIndex > 0
    ? getVrmPreviewUrl(safeSelectedVrmIndex)
    : getVrmPreviewUrl(1);
  const ambientIntent = useMemo(
    () => resolveCompanionAnimationIntent(companionSnapshot),
    [companionSnapshot],
  );
  const rosterItems = useMemo(
    () =>
      Array.from({ length: VRM_COUNT }, (_, i) => {
        const index = i + 1;
        return {
          index,
          previewUrl: getVrmPreviewUrl(index),
          title: getVrmTitle(index),
        };
      }),
    [],
  );

  const applyAmbientIntent = useCallback(() => {
    const engine = vrmEngineRef.current;
    if (!engine || !ambientIntent) return;
    if (currentAmbientIntentIdRef.current === ambientIntent.id) return;

    currentAmbientIntentIdRef.current = ambientIntent.id;
    void engine.playEmote(
      ambientIntent.url,
      ambientIntent.durationSec,
      ambientIntent.loop,
    );
  }, [ambientIntent]);

  // --- Feature A: Idle accent cycling ---
  const scheduleNextAccent = useCallback(() => {
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    if (actionAnimatingRef.current) return;

    const engine = vrmEngineRef.current;
    if (!engine) return;

    const moodTier = companionSnapshot?.moodTier ?? "neutral";
    const pool = MOOD_ANIMATION_POOLS[moodTier];
    if (!pool || pool.accents.length === 0) return;

    const delayMs = (10 + Math.random() * 8) * 1000;

    idleCycleTimerRef.current = setTimeout(() => {
      if (actionAnimatingRef.current) return;
      const anim = pickRandomAnimationDef(pool.accents);
      if (anim) {
        void engine.playEmote(anim.url, anim.durationSec, false);
        idleCycleTimerRef.current = setTimeout(() => {
          scheduleNextAccentRef.current();
        }, (anim.durationSec + 0.5) * 1000);
      } else {
        scheduleNextAccentRef.current();
      }
    }, delayMs);
  }, [companionSnapshot?.moodTier]);

  scheduleNextAccentRef.current = scheduleNextAccent;

  // --- Feature C: Action feedback animation ---
  const playActionAnimation = useCallback((action: CompanionAction) => {
    const engine = vrmEngineRef.current;
    if (!engine) return;
    const anim = pickRandomAnimationDef(ACTION_ANIMATION_MAP[action]);
    if (!anim) return;

    actionAnimatingRef.current = true;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    void engine.playEmote(anim.url, anim.durationSec, false);

    setTimeout(() => {
      actionAnimatingRef.current = false;
      scheduleNextAccentRef.current();
    }, (anim.durationSec + 0.5) * 1000);
  }, []);

  const handleVrmEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    currentAmbientIntentIdRef.current = null;
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (!state.vrmLoaded) return;
    setVrmLoaded(true);
    setShowVrmFallback(false);
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  useEffect(() => {
    setVrmLoaded(false);
    setShowVrmFallback(false);
    currentAmbientIntentIdRef.current = null;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    applyAmbientIntent();
    const timer = window.setTimeout(() => {
      setShowVrmFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath, applyAmbientIntent]);

  useEffect(() => {
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  // --- Feature A lifecycle: start idle accent cycling when VRM is loaded ---
  useEffect(() => {
    if (!vrmLoaded) return;
    scheduleNextAccent();
    return () => {
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }
    };
  }, [vrmLoaded, scheduleNextAccent]);

  // --- Feature B: state-change reaction animations ---
  useEffect(() => {
    const version = companionSnapshot?.state.version ?? null;
    const prevVersion = prevSnapshotVersionRef.current;
    prevSnapshotVersionRef.current = version;

    if (prevVersion === null || version === null || version === prevVersion) return;
    if (actionAnimatingRef.current) return;

    const engine = vrmEngineRef.current;
    if (!engine) return;

    const moodTier = companionSnapshot?.moodTier ?? "neutral";
    const reactionPool: Record<string, string[]> = {
      excited: ["cheering", "happy", "clapping"],
      calm: ["agreeing", "acknowledging", "thankful"],
      neutral: ["hard-head-nod", "agreeing"],
      low: ["relieved-sigh", "shoulder-rubbing"],
      burnout: ["crying", "relieved-sigh"],
    };

    const candidates = reactionPool[moodTier] ?? reactionPool.neutral;
    const anim = pickRandomAnimationDef(candidates);
    if (!anim) return;

    actionAnimatingRef.current = true;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    void engine.playEmote(anim.url, anim.durationSec, false);

    setTimeout(() => {
      actionAnimatingRef.current = false;
      scheduleNextAccentRef.current();
    }, (anim.durationSec + 0.5) * 1000);
  }, [companionSnapshot?.state.version, companionSnapshot?.moodTier]);

  useEffect(() => {
    if (!lastTriggeredAction) return;
    const t = setTimeout(() => setLastTriggeredAction(null), 3200);
    return () => clearTimeout(t);
  }, [lastTriggeredAction]);

  // --- Proactive trigger animations ---
  const PROACTIVE_ANIMATION_MAP: Record<string, string[]> = {
    hunger_critical: ["shoulder-rubbing", "bored"],
    hunger_low: ["yawn", "shoulder-rubbing"],
    energy_critical: ["yawn", "relieved-sigh"],
    mood_burnout: ["crying", "relieved-sigh"],
    mood_excited: ["cheering", "happy", "joyful-jump"],
    streak_milestone: ["clapping", "cheering", "blow-a-kiss"],
    level_up: ["cheering", "joyful-jump", "hip-hop-dancing"],
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const triggerId = (e as CustomEvent<{ triggerId: string }>).detail?.triggerId;
      if (!triggerId) return;
      const pool = PROACTIVE_ANIMATION_MAP[triggerId];
      if (!pool) return;
      const anim = pickRandomAnimationDef(pool);
      if (!anim) return;

      const engine = vrmEngineRef.current;
      if (!engine) return;

      actionAnimatingRef.current = true;
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }
      void engine.playEmote(anim.url, anim.durationSec, false);
      setTimeout(() => {
        actionAnimatingRef.current = false;
        scheduleNextAccentRef.current();
      }, (anim.durationSec + 0.5) * 1000);
    };

    window.addEventListener("milady:proactive-trigger", handler);
    return () => window.removeEventListener("milady:proactive-trigger", handler);
  }, []);

  const handleApplySettings = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await updateCompanionSettings({
      timezone,
      autopostEnabled,
      autopostDryRun,
      policyLevel,
      quietHours: {
        start: quietStart,
        end: quietEnd,
      },
    });
  };

  const handleExportShareCard = async () => {
    if (!companionSnapshot) return;

    const snapshot = companionSnapshot;
    const state = snapshot.state;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
    gradient.addColorStop(0, "#111111");
    gradient.addColorStop(1, "#2d2d2d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1080);

    const avatarUrl = getVrmPreviewUrl(safeSelectedVrmIndex);
    const avatar = await loadImage(avatarUrl);
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(860, 220, 150, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 710, 70, 300, 300);
      ctx.restore();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(860, 220, 152, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#f5f5f5";
    ctx.font = "700 64px serif";
    ctx.fillText(t("companion.share.title"), 80, 130);

    ctx.font = "500 40px sans-serif";
    ctx.fillStyle = "#e5e5e5";
    ctx.fillText(
      `${t("companion.level")} ${state.level} | XP ${state.xp}/${snapshot.nextLevelXp}`,
      80,
      210,
    );

    ctx.fillStyle = "#d4d4d4";
    ctx.font = "500 36px sans-serif";
    ctx.fillText(
      `${t("companion.stat.mood")} ${Math.round(state.stats.mood)}  ${t("companion.stat.hunger")} ${Math.round(state.stats.hunger)}`,
      80,
      320,
    );
    ctx.fillText(
      `${t("companion.stat.energy")} ${Math.round(state.stats.energy)}  ${t("companion.stat.social")} ${Math.round(state.stats.social)}`,
      80,
      380,
    );
    ctx.fillText(`${t("companion.streak")} ${state.streakDays} ${t("companion.daySuffix")}`, 80, 440);

    ctx.fillStyle = "#c7c7c7";
    ctx.font = "500 30px sans-serif";
    ctx.fillText(
      `${t("companion.today")}: ${t("companion.chat")} ${snapshot.today.chatCount}/${snapshot.today.chatCap}  ${t("companion.external")} ${snapshot.today.externalCount}/${snapshot.today.externalCap}`,
      80,
      530,
    );
    ctx.fillText(
      `${t("companion.manualShare")} ${snapshot.today.manualShareCount}/${snapshot.today.manualShareCap}  ${t("companion.autopost")} ${snapshot.today.autoPostCount}/${snapshot.today.autoPostCap}`,
      80,
      585,
    );

    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 28px sans-serif";
    ctx.fillText(`${t("companion.moodTier")}: ${snapshot.moodTier}`, 80, 675);
    ctx.fillText(`${t("companion.timezone")}: ${snapshot.today.timezone}`, 80, 725);

    const dataUrl = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `milady-companion-lv${state.level}.png`;
    anchor.click();
  };

  const handleCopySummary = async () => {
    if (!companionSnapshot) return;
    const state = companionSnapshot.state;
    const text = [
      `${t("companion.share.title")} ${t("companion.level")} ${state.level} (${companionSnapshot.moodTier})`,
      `${t("companion.stat.mood")} ${Math.round(state.stats.mood)} | ${t("companion.stat.hunger")} ${Math.round(state.stats.hunger)} | ${t("companion.stat.energy")} ${Math.round(state.stats.energy)} | ${t("companion.stat.social")} ${Math.round(state.stats.social)}`,
      `XP ${state.xp}/${companionSnapshot.nextLevelXp} | ${t("companion.streak")} ${state.streakDays} ${t("companion.daySuffix")}`,
      `${t("companion.today")}: ${t("companion.chat")} ${companionSnapshot.today.chatCount}/${companionSnapshot.today.chatCap}, ${t("companion.external")} ${companionSnapshot.today.externalCount}/${companionSnapshot.today.externalCap}, ${t("companion.manualShare")} ${companionSnapshot.today.manualShareCount}/${companionSnapshot.today.manualShareCap}, ${t("companion.autopost")} ${companionSnapshot.today.autoPostCount}/${companionSnapshot.today.autoPostCap}`,
    ].join("\n");
    await copyToClipboard(text);
  };

  if (companionLoading && !companionSnapshot) {
    return <div className="text-muted text-sm">{t("companion.loading")}</div>;
  }

  if (!companionSnapshot) {
    return (
      <div className="border border-border bg-card p-4 text-sm text-muted">
        {t("companion.notAvailable")}
        <button
          className="ml-3 px-3 py-1 border border-border bg-bg-hover text-txt hover:border-accent"
          onClick={() => {
            void loadCompanion();
          }}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const state = companionSnapshot.state;

  // Tooltip descriptions shown on each KPI card and via the inline ? icon.
  const STAT_TOOLTIPS: Record<string, string> = {
    mood: t("companion.tooltip.mood"),
    hunger: t("companion.tooltip.hunger"),
    energy: t("companion.tooltip.energy"),
    social: t("companion.tooltip.social"),
    level: t("companion.tooltip.level"),
    xp: t("companion.tooltip.xp"),
    streak: t("companion.tooltip.streak"),
  };

  const statItems = [
    { id: "mood", label: t("companion.stat.mood"), value: state.stats.mood },
    { id: "hunger", label: t("companion.stat.hunger"), value: state.stats.hunger },
    { id: "energy", label: t("companion.stat.energy"), value: state.stats.energy },
    { id: "social", label: t("companion.stat.social"), value: state.stats.social },
  ] as const;

  const autopostProgress = ratioPercent(
    companionSnapshot.today.autoPostCount,
    companionSnapshot.today.autoPostCap,
  );

  const softPenalty = companionSnapshot.thresholds.softPenalty;
  const autopostEligible = companionSnapshot.thresholds.autopostEligible;
  const reasons = companionSnapshot.thresholds.reasons;
  const reasonsSummary =
    reasons.length > 0
      ? reasons.slice(0, 2).join(" | ")
      : t("companion.thresholdsHealthy");

  const MOOD_TIER_LABELS: Record<string, string> = {
    excited: t("companion.mood.excited"),
    calm: t("companion.mood.calm"),
    neutral: t("companion.mood.neutral"),
    low: t("companion.mood.low"),
    burnout: t("companion.mood.burnout"),
  };

  const PENALTY_REASON_LABELS: Record<string, string> = {
    hunger_too_low: t("companion.penalty.hunger"),
    energy_too_low: t("companion.penalty.energy"),
    mood_too_low: t("companion.penalty.mood"),
    social_too_low: t("companion.penalty.social"),
  };

  const penaltyHint = reasons
    .map((r) => PENALTY_REASON_LABELS[r])
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ") || t("companion.penalty.needsCare");

  const daysTogether = companionSnapshot.state.firstMetAt
    ? Math.floor((Date.now() - (companionSnapshot.state.firstMetAt as number)) / (24 * 60 * 60 * 1000))
    : 0;

  const manualShareCapReached =
    companionSnapshot.today.manualShareCount >= companionSnapshot.today.manualShareCap;

  const quickActions = [
    {
      id: "feed",
      label: t("companion.action.feed"),
      cooldownMs: cooldowns.feed,
      disabled: companionActionBusy || cooldowns.feed > 0,
      onRun: () => { setLastTriggeredAction("feed"); playActionAnimation("feed"); void runCompanionAction("feed"); },
      kind: "feed" as QuickActionGlyph,
      // Text shown only while the action is in cooldown.
      cooldownHint: t("companion.action.feedHint"),
    },
    {
      id: "rest",
      label: t("companion.action.rest"),
      cooldownMs: cooldowns.rest,
      disabled: companionActionBusy || cooldowns.rest > 0,
      onRun: () => { setLastTriggeredAction("rest"); playActionAnimation("rest"); void runCompanionAction("rest"); },
      kind: "rest" as QuickActionGlyph,
      cooldownHint: t("companion.action.restHint"),
    },
    {
      id: "manual_share",
      label: t("companion.action.share"),
      cooldownMs: cooldowns.manualShare,
      disabled: companionActionBusy || cooldowns.manualShare > 0 || manualShareCapReached,
      onRun: () => { setLastTriggeredAction("manual_share"); playActionAnimation("manual_share"); void runCompanionAction("manual_share"); },
      kind: "manual_share" as QuickActionGlyph,
      cooldownHint: t("companion.action.shareHint"),
    },
  ];

  return (
    <div className="anime-comp-screen font-display">
      <div className="anime-comp-bg-graphic"></div>

      {/* Model Layer */}
      <div className="anime-comp-model-layer">
        <div
          className="absolute inset-0"
          style={{
            opacity: vrmLoaded ? 1 : 0,
            transition: "opacity 400ms ease",
          }}
        >
          <VrmViewer
            vrmPath={vrmPath}
            mouthOpen={0}
            isSpeaking={false}
            interactive
            cameraProfile="companion"
            interactiveMode="orbitZoom"
            onEngineReady={handleVrmEngineReady}
            onEngineState={handleVrmEngineState}
          />
        </div>
        {showVrmFallback && !vrmLoaded && (
          <img
            src={fallbackPreviewUrl}
            alt={t("companion.avatarPreviewAlt")}
            className="anime-vrm-fallback"
          />
        )}
        <div className="anime-comp-bubble-wrap">
          <BubbleEmote
            moodTier={companionSnapshot.moodTier}
            activeAction={lastTriggeredAction}
            visible={vrmLoaded}
          />
        </div>
      </div>

      {/* UI Overlay */}
      <div className="anime-comp-ui-layer">

        {/* Top Header */}
        <header className="anime-comp-header">
          <div className="anime-comp-header-left">
            <button
              className="anime-btn-ghost"
              onClick={() => setTab("chat")}
              title={t("nav.chat")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            
            <div className="anime-status-pill">
              <div className="anime-logo-circle">M</div>
              <span className="text-sm font-black mr-2 text-[var(--ac-text-primary)]">milady</span>
            </div>
            
            <button className="anime-btn-ghost" onClick={() => { void loadCompanion(); }} title={t("companion.sync")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            </button>
          </div>

          <div className="anime-comp-header-right">
            <div className="anime-level-badge">
              <span className="anime-level-number">Lv.{state.level}</span>
              <div className="anime-xp-track">
                <div
                  className="anime-xp-fill"
                  style={{ width: `${ratioPercent(state.xp, companionSnapshot.nextLevelXp)}%` }}
                />
              </div>
            </div>
            <div className="anime-tier-badge">
              {MOOD_TIER_LABELS[companionSnapshot.moodTier] ?? companionSnapshot.moodTier}
            </div>
            <button className="anime-nav-toggle" onClick={() => setDrawerOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="anime-comp-main-grid">

          {/* Left Panel: Profile & Stats */}
          <aside className="anime-comp-left-panel">
            <div className="anime-profile-header">
              <h2>{t("companion.headline")}</h2>
              <p>
                <span className="text-accent">{companionSnapshot.evolutionStage.label}</span>
                <span className="mx-2 opacity-50">/</span>
                <span>{t("companion.day")} {daysTogether}</span>
                <span className="mx-2 opacity-50">/</span>
                <span>{t("companion.streak")} {state.streakDays}d</span>
              </p>
            </div>

            {softPenalty && (
              <div className="anime-warning-banner">
                {penaltyHint}
              </div>
            )}

            <div className="anime-kpi-panel glass-panel">
              {statItems.map((item) => {
                const value = Math.round(item.value);
                const tooltip = STAT_TOOLTIPS[item.id] ?? "";
                let note = t("companion.coreStatus");
                if (item.id === "mood") note = MOOD_TIER_LABELS[companionSnapshot.moodTier] ?? companionSnapshot.moodTier;
                if (item.id === "hunger") {
                  note = `${cooldowns.feed > 0 ? formatDuration(cooldowns.feed) : t("companion.status.ready")}`;
                }
                if (item.id === "energy") {
                  note = `${cooldowns.rest > 0 ? formatDuration(cooldowns.rest) : t("companion.status.ready")}`;
                }
                if (item.id === "social") {
                  note = `${companionSnapshot.today.chatCount}/${companionSnapshot.today.chatCap}`;
                }

                return (
                  <div key={item.id} className="anime-kpi-item" title={tooltip}>
                    <div className="anime-kpi-info">
                      <span className="anime-kpi-label">{item.label}</span>
                      <span className="anime-kpi-note">{note}</span>
                    </div>
                    <div className="anime-kpi-track-wrap">
                      <div className="anime-kpi-val">{value}</div>
                      <div className="anime-kpi-mini-track">
                        <div className="anime-kpi-mini-fill" style={{ width: `${toPercent(value)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Center (Empty to show character) */}
          <div className="anime-comp-center"></div>

          {/* Right Panel: Roster & Actions */}
          <aside className="anime-comp-right-panel">

            <div className="anime-roster glass-panel">
              <div className="anime-panel-title">{t("companion.roster")}</div>
              {selectedVrmIndex === 0 && <div className="text-xs text-accent mt-1 mb-2">{t("companion.customVrmActive")}</div>}
              <div className="anime-roster-list">
                {rosterItems.map((item) => {
                  const active = selectedVrmIndex !== 0 && item.index === safeSelectedVrmIndex;
                  return (
                    <button
                      key={item.index}
                      className={`anime-roster-item ${active ? "is-active" : ""}`}
                      onClick={() => setState("selectedVrmIndex", item.index)}
                    >
                      <img src={item.previewUrl} alt={item.title} className="anime-roster-img" />
                      <div className="anime-roster-meta">
                        <span className="anime-roster-name">{item.title}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="anime-action-cluster">
              {quickActions.map(action => {
                const isLimit = action.id === "manual_share" && manualShareCapReached;
                const isCooldown = !isLimit && action.cooldownMs > 0;
                const statusText = isLimit ? "LIMIT" : isCooldown ? formatDuration(action.cooldownMs) : "READY";

                return (
                  <button
                    key={action.id}
                    className={`anime-action-btn ${action.disabled ? "is-disabled" : ""}`}
                    disabled={action.disabled}
                    onClick={action.onRun}
                    title={action.cooldownHint}
                  >
                    <div className={`anime-action-ring ${!action.disabled ? "is-pulsing" : ""}`} />
                    <div className="anime-action-inner">
                      <QuickActionIcon kind={action.kind} />
                      <span className="anime-action-label">{action.label}</span>
                      <span className="anime-action-status">{statusText}</span>
                    </div>
                  </button>
                );
              })}
            </div>

          </aside>
        </div>
      </div>

      <div className={`anime-drawer-overlay ${drawerOpen ? "is-open" : ""}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`anime-drawer ${drawerOpen ? "is-open" : ""}`}>
        <div className="anime-drawer-content">
          <div className="anime-drawer-header">
            <h2>{t("companion.controlHub")}</h2>
            <p>{t("companion.drawer.subtitle")}</p>
            <button className="anime-drawer-close" onClick={() => setDrawerOpen(false)}>×</button>
          </div>

          <div className="anime-drawer-body">
            {/* Global Nav for immersive view */}
            <div className="anime-nav-menu">
              <button className="anime-nav-link" onClick={() => { setDrawerOpen(false); setTab("chat"); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>
                {t("nav.chat")}
              </button>
              <button className="anime-nav-link" onClick={() => { setDrawerOpen(false); setTab("knowledge"); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                {t("nav.knowledge")}
              </button>
              <button className="anime-nav-link" onClick={() => { setDrawerOpen(false); setTab("wallets"); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                {t("nav.inventory")}
              </button>
              <button className="anime-nav-link" onClick={() => { setDrawerOpen(false); setTab("settings"); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
                {t("nav.settings")}
              </button>
            </div>

            <section className="anime-drawer-sec">
              <h3>{t("companion.statusOverview")}</h3>
              <p className="text-sm opacity-80 mb-2">{t("companion.autopost")} {companionSnapshot.today.autoPostCount}/{companionSnapshot.today.autoPostCap}</p>
              <div className={`anime-status-chip ${autopostEligible ? "is-good" : "is-warn"}`}>
                {autopostEligible ? t("companion.autopostEligible") : t("companion.autopostPaused")}
              </div>
              {!autopostEligible && <div className="text-xs text-red-300 mt-2">{reasonsSummary}</div>}
              {softPenalty && <div className="text-xs text-red-400 mt-2">{t("companion.softPenaltyHint")}</div>}
            </section>

            <section className="anime-drawer-sec">
              <h3>{t("companion.autopostControls")}</h3>
              <div className="anime-drawer-form">
                <label className="anime-checkbox">
                  <input type="checkbox" checked={autopostEnabled} onChange={e => setAutopostEnabled(e.target.checked)} />
                  <span>{t("companion.enableAutopost")}</span>
                </label>
                <label className="anime-checkbox">
                  <input type="checkbox" checked={autopostDryRun} onChange={e => setAutopostDryRun(e.target.checked)} />
                  <span>{t("companion.dryRunMode")}</span>
                </label>

                <div className="flex gap-4 mt-2">
                  <label className="anime-field flex-1">
                    <span>{t("companion.quietStart")}</span>
                    <select value={quietStart} onChange={e => setQuietStart(Number(e.target.value))}>
                      {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{formatClockHour(h)}</option>)}
                    </select>
                  </label>
                  <label className="anime-field flex-1">
                    <span>{t("companion.quietEnd")}</span>
                    <select value={quietEnd} onChange={e => setQuietEnd(Number(e.target.value))}>
                      {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{formatClockHour(h)}</option>)}
                    </select>
                  </label>
                </div>

                <label className="anime-field mt-2">
                  <span>{t("companion.policy")}</span>
                  <select value={policyLevel} onChange={e => setPolicyLevel(e.target.value as CompanionPolicyLevel)}>
                    <option value="strict">{t("companion.policyStrict")}</option>
                    <option value="balanced">{t("companion.policyBalanced")}</option>
                    <option value="aggressive">{t("companion.policyAggressive")}</option>
                  </select>
                </label>

                <div className="flex gap-3 mt-4">
                  <button className="anime-btn-solid flex-1" disabled={companionActionBusy} onClick={() => { void handleApplySettings(); }}>
                    {t("companion.saveSettings")}
                  </button>
                  <button className="anime-btn-ghost flex-1" onClick={() => { void refreshCompanionActivity(); }}>
                    {t("companion.refreshActivity")}
                  </button>
                </div>
              </div>
            </section>

            <section className="anime-drawer-sec">
              <h3>{t("companion.shareCard")}</h3>
              <p className="text-xs opacity-70 mb-3">{t("companion.shareCardHint")}</p>
              <div className="flex gap-3">
                <button className="anime-btn-ghost flex-1" onClick={() => { void handleCopySummary(); }}>{t("companion.copySummary")}</button>
                <button className="anime-btn-ghost flex-1" onClick={() => { void handleExportShareCard(); }}>{t("companion.downloadPng")}</button>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
