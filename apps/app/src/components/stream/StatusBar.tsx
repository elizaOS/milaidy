import { type CSSProperties, useState } from "react";
import { type AgentMode, IS_POPOUT, toggleAlwaysOnTop } from "./helpers";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StatusBar({
  agentName,
  mode,
  viewerCount,
  isPip,
  onTogglePip,
  streamLive,
  streamLoading,
  onToggleStream,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  destinations,
  activeDestination,
  onDestinationChange,
  uptime,
  frameCount,
  audioSource,
}: {
  agentName: string;
  mode: AgentMode;
  viewerCount: number | null;
  isPip: boolean;
  onTogglePip: () => void;
  streamLive: boolean;
  streamLoading: boolean;
  onToggleStream: () => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  destinations: Array<{ id: string; name: string }>;
  activeDestination: { id: string; name: string } | null;
  onDestinationChange: (id: string) => void;
  uptime: number;
  frameCount: number;
  audioSource: string;
}) {
  const isLive = streamLive;
  const [pinned, setPinned] = useState(IS_POPOUT); // popout starts pinned
  const modeLabel =
    mode === "gaming"
      ? "gaming"
      : mode === "terminal"
        ? "terminal"
        : mode === "chatting"
          ? "chatting"
          : "idle";
  return (
    <div
      className={`flex items-center justify-between bg-bg border-b border-border shrink-0 ${isPip ? "px-2 py-1" : "px-4 py-2"}`}
      style={
        IS_POPOUT ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={`${isPip ? "w-2 h-2" : "w-2.5 h-2.5"} rounded-full ${
            isLive
              ? "bg-danger shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"
              : "bg-muted"
          }`}
        />
        {!isPip && (
          <>
            <span className="text-xs font-bold uppercase tracking-wider text-txt">
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
            <span className="text-sm font-semibold text-txt-strong">
              {agentName}
            </span>
          </>
        )}
      </div>
      <div
        className={`flex items-center ${isPip ? "gap-1" : "gap-3"} text-xs text-muted`}
        style={
          IS_POPOUT
            ? ({ WebkitAppRegion: "no-drag" } as CSSProperties)
            : undefined
        }
      >
        {!isPip && viewerCount !== null && viewerCount > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
            <span className="text-txt">{viewerCount}</span>
          </span>
        )}
        {!isPip && (
          <span className="px-2 py-0.5 rounded bg-bg-muted">{modeLabel}</span>
        )}

        {/* Health stats — live only */}
        {!isPip && isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-muted text-[10px] font-mono">
            <span className="text-txt">{formatUptime(uptime)}</span>
            <span className="text-border">|</span>
            <span className="text-txt">{frameCount.toLocaleString()}f</span>
            {audioSource && (
              <>
                <span className="text-border">|</span>
                <span className="text-txt">{audioSource}</span>
              </>
            )}
          </span>
        )}

        {/* Volume controls */}
        {!isPip && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 rounded bg-bg-muted hover:bg-accent/20 transition-colors cursor-pointer"
              title={muted ? "Unmute" : "Mute"}
              onClick={onToggleMute}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{muted ? "Unmute" : "Mute"}</title>
                {muted ? (
                  <>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                ) : (
                  <>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </>
                )}
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-16 accent-[var(--accent)]"
              title={`Volume: ${muted ? 0 : volume}%`}
            />
          </span>
        )}

        {/* Destination selector — offline only, 2+ destinations */}
        {!isPip && !isLive && destinations.length > 1 && (
          <select
            className="bg-bg-muted text-txt border border-border text-[11px] rounded px-1.5 py-0.5 cursor-pointer"
            value={activeDestination?.id ?? ""}
            onChange={(e) => onDestinationChange(e.target.value)}
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {!isPip && (
          <button
            type="button"
            disabled={streamLoading}
            className={`px-3 py-0.5 rounded font-semibold text-[11px] uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
              isLive
                ? "bg-danger/20 text-danger hover:bg-danger/30"
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
            onClick={onToggleStream}
          >
            {streamLoading ? "..." : isLive ? "Stop Stream" : "Go Live"}
          </button>
        )}
        {IS_POPOUT ? (
          <>
            <button
              type="button"
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                isPip
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-bg-muted hover:bg-purple-500/20 hover:text-purple-400"
              }`}
              title={
                isPip
                  ? "Exit picture-in-picture"
                  : "Picture-in-picture (small overlay)"
              }
              onClick={onTogglePip}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{isPip ? "Exit PIP" : "PIP"}</title>
                {isPip ? (
                  <>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <rect
                      x="10"
                      y="9"
                      width="10"
                      height="7"
                      rx="1"
                      fill="currentColor"
                      opacity="0.3"
                    />
                  </>
                ) : (
                  <>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <rect x="11" y="9" width="9" height="6" rx="1" />
                  </>
                )}
              </svg>
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                pinned
                  ? "bg-accent/20 text-accent"
                  : "bg-bg-muted hover:bg-accent/20 hover:text-accent"
              }`}
              title={pinned ? "Unpin from top" : "Pin to top (always on top)"}
              onClick={() => {
                const next = !pinned;
                toggleAlwaysOnTop(next).then((result) => {
                  if (result !== undefined) setPinned(next);
                });
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{pinned ? "Unpin" : "Pin"}</title>
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="px-2 py-0.5 rounded bg-bg-muted hover:bg-accent/20 hover:text-accent transition-colors cursor-pointer"
            title="Pop out stream view"
            onClick={() => {
              const apiBase = (window as unknown as Record<string, unknown>)
                .__MILADY_API_BASE__ as string | undefined;
              const base = window.location.origin || "";
              const sep =
                window.location.protocol === "file:" ||
                window.location.protocol === "capacitor-electron:"
                  ? "#"
                  : "";
              const qs = apiBase
                ? `popout&apiBase=${encodeURIComponent(apiBase)}`
                : "popout";
              const popoutWin = window.open(
                `${base}${sep}/?${qs}`,
                "milady-stream",
                "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no",
              );
              // Notify the main window to navigate away from stream tab
              if (popoutWin) {
                window.dispatchEvent(
                  new CustomEvent("stream-popout", { detail: "opened" }),
                );
                // Poll for popout close and notify to switch back
                const poll = setInterval(() => {
                  if (popoutWin.closed) {
                    clearInterval(poll);
                    window.dispatchEvent(
                      new CustomEvent("stream-popout", { detail: "closed" }),
                    );
                  }
                }, 500);
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Pop Out</title>
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
