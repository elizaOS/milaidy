import { useEffect, useMemo, useState } from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext.js";
import type { CompanionPolicyLevel } from "../api-client.js";

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

function statColor(value: number): string {
  if (value >= 70) return "bg-ok";
  if (value >= 35) return "bg-accent";
  return "bg-danger";
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
    selectedVrmIndex,
    copyToClipboard,
  } = useApp();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [autopostEnabled, setAutopostEnabled] = useState(true);
  const [autopostDryRun, setAutopostDryRun] = useState(true);
  const [quietStart, setQuietStart] = useState(1);
  const [quietEnd, setQuietEnd] = useState(8);
  const [policyLevel, setPolicyLevel] = useState<CompanionPolicyLevel>("balanced");

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

    const avatarUrl = getVrmPreviewUrl(selectedVrmIndex);
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
    ctx.fillText("Milaidy Companion", 80, 130);

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
    anchor.download = `milaidy-companion-lv${state.level}.png`;
    anchor.click();
  };

  const handleCopySummary = async () => {
    if (!companionSnapshot) return;
    const state = companionSnapshot.state;
    const text = [
      `Milaidy Companion Level ${state.level} (${companionSnapshot.moodTier})`,
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

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div>
        <h2 className="text-lg font-bold mb-1">Companion</h2>
        <p className="text-[13px] text-muted">
          Nurture your agent with feed/rest/share actions while social progress grows from chat and posting.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Status</div>
              <div className="text-xl font-semibold text-txt">Level {state.level}</div>
              <div className="text-sm text-muted">XP {state.xp}/{companionSnapshot.nextLevelXp}</div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>Mood Tier: <span className="text-txt">{companionSnapshot.moodTier}</span></div>
              <div>Streak: <span className="text-txt">{state.streakDays}d</span></div>
              <div>
                Penalty: <span className={companionSnapshot.thresholds.softPenalty ? "text-danger" : "text-ok"}>
                  {companionSnapshot.thresholds.softPenalty ? "active" : "off"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { id: "mood", label: "Mood", value: state.stats.mood },
              { id: "hunger", label: "Hunger", value: state.stats.hunger },
              { id: "energy", label: "Energy", value: state.stats.energy },
              { id: "social", label: "Social", value: state.stats.social },
            ].map((item) => (
              <div key={item.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">{item.label}</span>
                  <span className="text-txt">{Math.round(item.value)}</span>
                </div>
                <div className="h-2 bg-bg-hover border border-border overflow-hidden">
                  <div
                    className={`h-full ${statColor(item.value)}`}
                    style={{ width: `${toPercent(item.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-muted">
            Today chat progress: {companionSnapshot.today.chatCount}/{companionSnapshot.today.chatCap}
          </div>
        </section>

        <section className="border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-2">Core Actions</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              className="px-3 py-2 border border-border bg-bg-hover text-sm hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={companionActionBusy || cooldowns.feed > 0}
              onClick={() => { void runCompanionAction("feed"); }}
            >
              Feed ({formatDuration(cooldowns.feed)})
            </button>
            <button
              className="px-3 py-2 border border-border bg-bg-hover text-sm hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={companionActionBusy || cooldowns.rest > 0}
              onClick={() => { void runCompanionAction("rest"); }}
            >
              Rest ({formatDuration(cooldowns.rest)})
            </button>
            <button
              className="px-3 py-2 border border-border bg-bg-hover text-sm hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={companionActionBusy || cooldowns.manualShare > 0 || companionSnapshot.today.manualShareCount >= companionSnapshot.today.manualShareCap}
              onClick={() => { void runCompanionAction("manual_share"); }}
            >
              Share ({formatDuration(cooldowns.manualShare)})
            </button>
          </div>

          <div className="text-xs text-muted mt-3">
            Manual share today: {companionSnapshot.today.manualShareCount}/{companionSnapshot.today.manualShareCap}
          </div>

          <div className="mt-5 text-xs uppercase tracking-wide text-muted mb-2">Autopost Controls</div>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autopostEnabled}
                onChange={(event) => setAutopostEnabled(event.target.checked)}
              />
              <span>Enable Autopost</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autopostDryRun}
                onChange={(event) => setAutopostDryRun(event.target.checked)}
              />
              <span>Dry Run Mode</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Quiet Start
                <select
                  className="mt-1 w-full border border-border bg-bg px-2 py-1 text-sm"
                  value={quietStart}
                  onChange={(event) => setQuietStart(Number(event.target.value))}
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={`qs-${hour}`} value={hour}>{formatClockHour(hour)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Quiet End
                <select
                  className="mt-1 w-full border border-border bg-bg px-2 py-1 text-sm"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(Number(event.target.value))}
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={`qe-${hour}`} value={hour}>{formatClockHour(hour)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="text-xs text-muted block">
              Policy
              <select
                className="mt-1 w-full border border-border bg-bg px-2 py-1 text-sm"
                value={policyLevel}
                onChange={(event) => setPolicyLevel(event.target.value as CompanionPolicyLevel)}
              >
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>

            <div className="flex gap-2">
              <button
                className="px-3 py-2 border border-accent bg-accent text-accent-fg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={companionActionBusy}
                onClick={() => { void handleApplySettings(); }}
              >
                Save Settings
              </button>
              <button
                className="px-3 py-2 border border-border bg-bg-hover text-sm hover:border-accent"
                onClick={() => { void refreshCompanionActivity(); }}
              >
                Refresh Activity
              </button>
            </div>

            <div className="text-xs text-muted">
              Autopost today: {companionSnapshot.today.autoPostCount}/{companionSnapshot.today.autoPostCap}
            </div>
          </div>
        </section>
      </div>

      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted">Share Card</div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 border border-border bg-bg-hover text-sm hover:border-accent"
              onClick={() => { void handleCopySummary(); }}
            >
              Copy Summary
            </button>
            <button
              className="px-3 py-1.5 border border-border bg-bg-hover text-sm hover:border-accent"
              onClick={() => { void handleExportShareCard(); }}
            >
              Download PNG
            </button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Export your current companion status card and share social progress snapshots.
        </p>
      </section>

      <section className="border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Activity</div>
        {companionActivity.length === 0 ? (
          <div className="text-sm text-muted">No events yet.</div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto border border-border">
            {companionActivity.map((event) => (
              <div key={event.id} className="px-3 py-2 border-b border-border last:border-b-0">
                <div className="text-[11px] text-muted">
                  {new Date(event.ts).toLocaleString()} · {event.kind}
                </div>
                <div className="text-sm text-txt">{event.message}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
