import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp, VRM_COUNT } from "../AppContext.js";
import type { CompanionPolicyLevel } from "../api-client.js";
import { VrmViewer } from "./avatar/VrmViewer";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { resolveCompanionAnimationIntent } from "./avatar/companionAnimationIntent";

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
  if (ms <= 0) return "ready";
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
  } = useApp();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autopostEnabled, setAutopostEnabled] = useState(true);
  const [autopostDryRun, setAutopostDryRun] = useState(true);
  const [quietStart, setQuietStart] = useState(1);
  const [quietEnd, setQuietEnd] = useState(8);
  const [policyLevel, setPolicyLevel] = useState<CompanionPolicyLevel>("balanced");
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);

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
          title: `milady-${String(index).padStart(2, "0")}`,
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

  const handleVrmEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    currentAmbientIntentIdRef.current = null;
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (!state.vrmLoaded) return;
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  useEffect(() => {
    currentAmbientIntentIdRef.current = null;
    applyAmbientIntent();
  }, [vrmPath, applyAmbientIntent]);

  useEffect(() => {
    applyAmbientIntent();
  }, [applyAmbientIntent]);

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
    ctx.fillText("Milady Companion", 80, 130);

    ctx.font = "500 40px sans-serif";
    ctx.fillStyle = "#e5e5e5";
    ctx.fillText(`Level ${state.level} | XP ${state.xp}/${snapshot.nextLevelXp}`, 80, 210);

    ctx.fillStyle = "#d4d4d4";
    ctx.font = "500 36px sans-serif";
    ctx.fillText(`Mood ${Math.round(state.stats.mood)}  Hunger ${Math.round(state.stats.hunger)}`, 80, 320);
    ctx.fillText(`Energy ${Math.round(state.stats.energy)}  Social ${Math.round(state.stats.social)}`, 80, 380);
    ctx.fillText(`Streak ${state.streakDays} day(s)`, 80, 440);

    ctx.fillStyle = "#c7c7c7";
    ctx.font = "500 30px sans-serif";
    ctx.fillText(
      `Today: chat ${snapshot.today.chatCount}/${snapshot.today.chatCap}  external ${snapshot.today.externalCount}/${snapshot.today.externalCap}`,
      80,
      530,
    );
    ctx.fillText(
      `Manual share ${snapshot.today.manualShareCount}/${snapshot.today.manualShareCap}  autopost ${snapshot.today.autoPostCount}/${snapshot.today.autoPostCap}`,
      80,
      585,
    );

    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 28px sans-serif";
    ctx.fillText(`Mood tier: ${snapshot.moodTier}`, 80, 675);
    ctx.fillText(`Timezone: ${snapshot.today.timezone}`, 80, 725);

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
      `Milady Companion Level ${state.level} (${companionSnapshot.moodTier})`,
      `Mood ${Math.round(state.stats.mood)} | Hunger ${Math.round(state.stats.hunger)} | Energy ${Math.round(state.stats.energy)} | Social ${Math.round(state.stats.social)}`,
      `XP ${state.xp}/${companionSnapshot.nextLevelXp} | Streak ${state.streakDays} day(s)`,
      `Today: chat ${companionSnapshot.today.chatCount}/${companionSnapshot.today.chatCap}, external ${companionSnapshot.today.externalCount}/${companionSnapshot.today.externalCap}, manual-share ${companionSnapshot.today.manualShareCount}/${companionSnapshot.today.manualShareCap}, autopost ${companionSnapshot.today.autoPostCount}/${companionSnapshot.today.autoPostCap}`,
    ].join("\n");
    await copyToClipboard(text);
  };

  if (companionLoading && !companionSnapshot) {
    return <div className="text-muted text-sm">Loading companion status...</div>;
  }

  if (!companionSnapshot) {
    return (
      <div className="border border-border bg-card p-4 text-sm text-muted">
        Companion state is not available.
        <button
          className="ml-3 px-3 py-1 border border-border bg-bg-hover text-txt hover:border-accent"
          onClick={() => {
            void loadCompanion();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const state = companionSnapshot.state;
  const statItems = [
    { id: "mood", label: "Mood", value: state.stats.mood },
    { id: "hunger", label: "Hunger", value: state.stats.hunger },
    { id: "energy", label: "Energy", value: state.stats.energy },
    { id: "social", label: "Social", value: state.stats.social },
  ] as const;

  const autopostProgress = ratioPercent(
    companionSnapshot.today.autoPostCount,
    companionSnapshot.today.autoPostCap,
  );

  const softPenalty = companionSnapshot.thresholds.softPenalty;
  const autopostEligible = companionSnapshot.thresholds.autopostEligible;
  const reasons = companionSnapshot.thresholds.reasons;
  const reasonsSummary = reasons.length > 0 ? reasons.slice(0, 2).join(" | ") : "All thresholds healthy.";

  const manualShareCapReached =
    companionSnapshot.today.manualShareCount >= companionSnapshot.today.manualShareCap;

  const quickActions = [
    {
      id: "feed",
      label: "Feed",
      cooldownMs: cooldowns.feed,
      disabled: companionActionBusy || cooldowns.feed > 0,
      onRun: () => { void runCompanionAction("feed"); },
      kind: "feed" as QuickActionGlyph,
    },
    {
      id: "rest",
      label: "Rest",
      cooldownMs: cooldowns.rest,
      disabled: companionActionBusy || cooldowns.rest > 0,
      onRun: () => { void runCompanionAction("rest"); },
      kind: "rest" as QuickActionGlyph,
    },
    {
      id: "manual_share",
      label: "Share",
      cooldownMs: cooldowns.manualShare,
      disabled: companionActionBusy || cooldowns.manualShare > 0 || manualShareCapReached,
      onRun: () => { void runCompanionAction("manual_share"); },
      kind: "manual_share" as QuickActionGlyph,
    },
  ];

  return (
    <div className="companion-game relative min-h-[820px] overflow-hidden rounded-[34px] border border-[rgba(180,184,195,0.75)] px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-7">
      <div className="companion-game__line-art" aria-hidden="true" />
      <div className="companion-game__line-art-secondary" aria-hidden="true" />

      <div className="relative z-[1] flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="companion-game__utility-pill" data-testid="companion-top-bar">
            <span className="companion-game__utility-dot" />
            <span className="companion-game__utility-text">Companion Console</span>
          </div>
          <div className="companion-game__logo-mark">milady</div>
          <div className="flex items-center gap-2">
            <button
              className="companion-game__top-btn"
              onClick={() => { void loadCompanion(); }}
            >
              Sync
            </button>
            <button
              className="companion-game__top-btn companion-game__top-btn--primary"
              onClick={() => setDrawerOpen(true)}
            >
              Control Hub
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[148px_minmax(0,1fr)_296px]">
          <aside className="companion-game__left-rail">
            <div className="companion-game__rail-actions" data-testid="companion-quick-actions">
              <div className="companion-game__rail-title">Quick Actions</div>
              <div className="companion-game__action-list">
                {quickActions.map((action) => {
                  const isLimit =
                    action.id === "manual_share" && manualShareCapReached;
                  const isCooldown = !isLimit && action.cooldownMs > 0;
                  const tone: QuickActionTone = isLimit
                    ? "limit"
                    : isCooldown
                    ? "cooldown"
                    : "ready";
                  const statusText = isLimit
                    ? "limit reached"
                    : isCooldown
                    ? formatDuration(action.cooldownMs)
                    : "ready";

                  return (
                    <div key={`quick-${action.id}`} className="companion-game__action-item">
                      <button
                        className="companion-game__action-icon-btn"
                        data-testid={`companion-action-${action.id}`}
                        aria-label={`${action.label} (${statusText})`}
                        title={`${action.label}: ${statusText}`}
                        disabled={action.disabled}
                        onClick={action.onRun}
                      >
                        <span className="companion-game__action-icon">
                          <QuickActionIcon kind={action.kind} />
                        </span>
                        <span className={`companion-game__action-state-dot is-${tone}`} />
                      </button>
                      <span className="companion-game__action-title">{action.label}</span>
                      <span className={`companion-game__action-state-text is-${tone}`}>
                        {statusText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {softPenalty && (
              <div className="companion-game__warning-chip">
                Soft penalty active
              </div>
            )}
          </aside>

          <section className="companion-game__stage" data-testid="companion-stage">
            <div className="companion-game__stage-head">
              <div>
                <div className="companion-game__headline">Cyber Companion</div>
                <p className="companion-game__subline">
                  Level {state.level} | XP {state.xp}/{companionSnapshot.nextLevelXp} | Streak {state.streakDays}d
                </p>
              </div>
              <div className="companion-game__tier-chip">{companionSnapshot.moodTier}</div>
            </div>

            <div className="companion-game__vrm-shell">
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
          </section>

          <aside className="companion-game__roster" data-testid="companion-roster">
            <div className="companion-game__panel-title">Character Roster</div>
            {selectedVrmIndex === 0 && (
              <div className="companion-game__status-notes">
                Custom VRM active. Choose a roster slot to switch back.
              </div>
            )}
            <div className="companion-game__roster-list">
              {rosterItems.map((item) => {
                const active = selectedVrmIndex !== 0 && item.index === safeSelectedVrmIndex;
                return (
                  <button
                    key={`roster-${item.index}`}
                    className={`companion-game__roster-item ${active ? "is-active" : ""}`}
                    data-testid={`companion-roster-item-${item.index}`}
                    onClick={() => setState("selectedVrmIndex", item.index)}
                  >
                    <span className="companion-game__roster-node" aria-hidden="true" />
                    <span className="companion-game__roster-thumb">
                      <img src={item.previewUrl} alt={item.title} />
                    </span>
                    <span className="companion-game__roster-meta">
                      <span className="companion-game__roster-title">{item.title}</span>
                      <span className="companion-game__roster-subtitle">
                        {active ? "active companion" : "switch avatar"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              className="companion-game__panel-btn"
              onClick={() => setDrawerOpen(true)}
            >
              Open Control Hub
            </button>
          </aside>
        </div>

        <section className="companion-game__kpi-grid" data-testid="companion-kpi">
          {statItems.map((item) => {
            const value = Math.round(item.value);
            let note = "core status";
            if (item.id === "mood") note = companionSnapshot.moodTier;
            if (item.id === "hunger") note = `feed ${formatDuration(cooldowns.feed)}`;
            if (item.id === "energy") note = `rest ${formatDuration(cooldowns.rest)}`;
            if (item.id === "social") {
              note = `chat ${companionSnapshot.today.chatCount}/${companionSnapshot.today.chatCap}`;
            }
            return (
              <article key={`kpi-${item.id}`} className="companion-game__kpi-card">
                <div className="companion-game__kpi-label">{item.label}</div>
                <div className="companion-game__kpi-value">{value}</div>
                <div className="companion-game__kpi-note">{note}</div>
              </article>
            );
          })}
        </section>

        <div className="companion-game__footer-meta">
          <span>Timezone: {companionSnapshot.today.timezone}</span>
          <span>Day bucket: {companionSnapshot.today.dayKey}</span>
          <span>Manual share: {companionSnapshot.today.manualShareCount}/{companionSnapshot.today.manualShareCap}</span>
        </div>
      </div>

      <div
        className={`companion-game__drawer-overlay ${drawerOpen ? "is-open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      <aside className={`companion-game__drawer ${drawerOpen ? "is-open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="companion-game__drawer-header">
          <div>
            <h3>Control Hub</h3>
            <p>Settings, share tools, and recent activity.</p>
          </div>
          <button className="companion-game__drawer-close" onClick={() => setDrawerOpen(false)}>
            Close
          </button>
        </div>

        <section className="companion-game__drawer-section">
          <div className="companion-game__drawer-title">Status Overview</div>
          <div className="companion-game__mini-progress">
            <div className="companion-game__mini-progress-label">
              <span>Autopost</span>
              <span>{companionSnapshot.today.autoPostCount}/{companionSnapshot.today.autoPostCap}</span>
            </div>
            <div className="companion-game__mini-progress-track">
              <div className="companion-game__mini-progress-fill" style={{ width: `${autopostProgress}%` }} />
            </div>
          </div>

          <div className={`companion-game__status-chip ${autopostEligible ? "is-good" : "is-danger"}`}>
            {autopostEligible ? "Autopost eligible" : "Autopost paused"}
          </div>

          {!autopostEligible && (
            <div className="companion-game__status-notes">{reasonsSummary}</div>
          )}

          {softPenalty && (
            <div className="companion-game__status-notes companion-game__status-notes--danger">
              Low core stats are reducing gains and XP multipliers.
            </div>
          )}

          <div className="companion-game__panel-metrics">
            <div>Autopost today: {companionSnapshot.today.autoPostCount}/{companionSnapshot.today.autoPostCap}</div>
            <div>Chat scored: {companionSnapshot.today.chatCount}/{companionSnapshot.today.chatCap}</div>
            <div>External scored: {companionSnapshot.today.externalCount}/{companionSnapshot.today.externalCap}</div>
          </div>
        </section>

        <section className="companion-game__drawer-section">
          <div className="companion-game__drawer-title">Autopost Controls</div>
          <label className="companion-game__checkbox">
            <input
              type="checkbox"
              checked={autopostEnabled}
              onChange={(event) => setAutopostEnabled(event.target.checked)}
            />
            <span>Enable Autopost</span>
          </label>
          <label className="companion-game__checkbox">
            <input
              type="checkbox"
              checked={autopostDryRun}
              onChange={(event) => setAutopostDryRun(event.target.checked)}
            />
            <span>Dry Run Mode</span>
          </label>

          <div className="companion-game__drawer-grid">
            <label className="companion-game__field">
              <span>Quiet Start</span>
              <select value={quietStart} onChange={(event) => setQuietStart(Number(event.target.value))}>
                {Array.from({ length: 24 }).map((_, hour) => (
                  <option key={`qs-${hour}`} value={hour}>{formatClockHour(hour)}</option>
                ))}
              </select>
            </label>
            <label className="companion-game__field">
              <span>Quiet End</span>
              <select value={quietEnd} onChange={(event) => setQuietEnd(Number(event.target.value))}>
                {Array.from({ length: 24 }).map((_, hour) => (
                  <option key={`qe-${hour}`} value={hour}>{formatClockHour(hour)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="companion-game__field">
            <span>Policy</span>
            <select
              value={policyLevel}
              onChange={(event) => setPolicyLevel(event.target.value as CompanionPolicyLevel)}
            >
              <option value="strict">Strict</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>

          <div className="companion-game__drawer-actions">
            <button
              className="companion-game__drawer-btn companion-game__drawer-btn--primary"
              disabled={companionActionBusy}
              onClick={() => { void handleApplySettings(); }}
            >
              Save Settings
            </button>
            <button
              className="companion-game__drawer-btn"
              onClick={() => { void refreshCompanionActivity(); }}
            >
              Refresh Activity
            </button>
          </div>
        </section>

        <section className="companion-game__drawer-section">
          <div className="companion-game__drawer-title">Share Card</div>
          <p className="companion-game__helper">
            Export your current companion snapshot as text or PNG.
          </p>
          <div className="companion-game__drawer-actions">
            <button
              className="companion-game__drawer-btn"
              onClick={() => { void handleCopySummary(); }}
            >
              Copy Summary
            </button>
            <button
              className="companion-game__drawer-btn"
              onClick={() => { void handleExportShareCard(); }}
            >
              Download PNG
            </button>
          </div>
        </section>

        <section className="companion-game__drawer-section">
          <div className="companion-game__drawer-title">Activity</div>
          {companionActivity.length === 0 ? (
            <div className="companion-game__helper">No events yet.</div>
          ) : (
            <div className="companion-game__activity-list">
              {companionActivity.map((event) => (
                <div key={event.id} className="companion-game__activity-item">
                  <div className="companion-game__activity-meta">
                    {new Date(event.ts).toLocaleString()} | {event.kind}
                  </div>
                  <div>{event.message}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
