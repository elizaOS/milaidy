import { type CSSProperties, useEffect, useRef, useState, useMemo } from "react";
import {
  type AgentMode,
  IS_POPOUT,
  isSupportedStreamUrl,
  STREAM_SOURCE_LABELS,
  type StreamSourceType,
  toggleAlwaysOnTop,
} from "./helpers";
import { useApp } from "../../AppContext";
import { createTranslator } from "../../i18n";

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
  streamAvailable,
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
  streamSource,
  activeGameViewerUrl,
  onSourceChange,
  onOpenSettings,
}: {
  agentName: string;
  mode: AgentMode;
  viewerCount: number | null;
  isPip: boolean;
  onTogglePip: () => void;
  streamAvailable: boolean;
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
  streamSource: { type: StreamSourceType; url?: string };
  activeGameViewerUrl: string;
  onSourceChange: (sourceType: StreamSourceType, customUrl?: string) => void;
  onOpenSettings?: () => void;
}) {
  const { uiLanguage } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);
  const isLive = streamLive;
  const [pinned, setPinned] = useState(IS_POPOUT); // popout starts pinned
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceDropdownRef = useRef<HTMLSpanElement>(null);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const trimmedCustomUrl = customUrlInput.trim();
  const customUrlValid = isSupportedStreamUrl(trimmedCustomUrl);

  // Close source picker on click outside
  useEffect(() => {
    if (!sourceOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        sourceDropdownRef.current &&
        !sourceDropdownRef.current.contains(e.target as Node)
      ) {
        setSourceOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sourceOpen]);
  const popoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup popout polling interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (popoutPollRef.current) {
        clearInterval(popoutPollRef.current);
        popoutPollRef.current = null;
      }
    };
  }, []);

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
          className={`${isPip ? "w-2 h-2" : "w-2.5 h-2.5"} rounded-full ${isLive
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

        {/* Stream source picker — always visible */}
        {!isPip && (
          <span ref={sourceDropdownRef} className="relative flex items-center">
            <button
              type="button"
              disabled={!streamAvailable}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-muted hover:bg-accent/20 transition-colors cursor-pointer text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setSourceOpen((o) => !o)}
              title={
                streamAvailable
                  ? "Select a stream source"
                  : "Install and enable the streaming plugin to change sources"
              }
            >
              <span className="text-muted">{t("statusbar.Src")}</span>
              <span className="text-txt font-medium">
                {STREAM_SOURCE_LABELS[streamSource.type]}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <title>{t("statusbar.ToggleSourcePicker")}</title>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {sourceOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-bg border border-border rounded shadow-lg min-w-[180px]">
                {(
                  ["stream-tab", "game", "custom-url"] as StreamSourceType[]
                ).map((st) => {
                  const isGame = st === "game";
                  const disabled =
                    !streamAvailable || (isGame && !activeGameViewerUrl.trim());
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={disabled}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${streamSource.type === st
                        ? "bg-accent/20 text-accent"
                        : disabled
                          ? "text-muted/40 cursor-not-allowed"
                          : "text-txt hover:bg-bg-muted cursor-pointer"
                        }`}
                      onClick={() => {
                        if (st === "custom-url") return; // handled by input below
                        onSourceChange(
                          st,
                          isGame ? activeGameViewerUrl : undefined,
                        );
                        setSourceOpen(false);
                      }}
                    >
                      {STREAM_SOURCE_LABELS[st]}
                      {isGame && activeGameViewerUrl.trim() && (
                        <span className="ml-1 text-muted text-[10px]">
                          {t("statusbar.Active")}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* Custom URL input */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border">
                  <input
                    type="text"
                    placeholder={t("statusbar.https")}
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    disabled={!streamAvailable}
                    className={`flex-1 bg-bg-muted text-txt text-[11px] rounded px-2 py-1 border outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${trimmedCustomUrl && !customUrlValid
                      ? "border-danger"
                      : "border-border"
                      }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customUrlValid) {
                        onSourceChange("custom-url", trimmedCustomUrl);
                        setSourceOpen(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!streamAvailable || !customUrlValid}
                    className="px-2 py-1 rounded bg-accent/20 text-accent text-[10px] font-semibold hover:bg-accent/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => {
                      if (customUrlValid) {
                        onSourceChange("custom-url", trimmedCustomUrl);
                        setSourceOpen(false);
                      }
                    }}
                    title={
                      streamAvailable
                        ? "Custom URLs must start with http:// or https://"
                        : "Install and enable the streaming plugin to use custom URLs"
                    }
                  >
                    Go
                  </button>
                </div>
              </div>
            )}
          </span>
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
              disabled={!streamAvailable}
              className="p-1 rounded bg-bg-muted hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={!streamAvailable}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-16 accent-[var(--accent)]"
              title={`Volume: ${muted ? 0 : volume}%`}
            />
          </span>
        )}

        {/* Destination selector — always visible when destinations exist */}
        {!isPip && destinations.length > 0 && (
          <select
            className="bg-bg-muted text-txt border border-border text-[11px] rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            value={activeDestination?.id ?? ""}
            disabled={isLive || !streamAvailable}
            title={
              !streamAvailable
                ? "Install and enable the streaming plugin to change destinations"
                : isLive
                  ? "Stop stream to change destination"
                  : "Select destination"
            }
            onChange={(e) => onDestinationChange(e.target.value)}
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {/* Settings gear */}
        {!isPip && onOpenSettings && (
          <button
            type="button"
            disabled={!streamAvailable}
            className="px-2 py-0.5 rounded bg-bg-muted hover:bg-accent/20 hover:text-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              streamAvailable
                ? "Stream settings"
                : "Install and enable the streaming plugin to configure streaming"
            }
            onClick={onOpenSettings}
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
              <title>{t("statusbar.Settings")}</title>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {!isPip && (
          <button
            type="button"
            disabled={!streamAvailable || streamLoading}
            className={`px-3 py-0.5 rounded font-semibold text-[11px] uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${isLive
              ? "bg-danger/20 text-danger hover:bg-danger/30"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              }`}
            onClick={onToggleStream}
            title={
              streamAvailable
                ? undefined
                : "Install and enable the streaming plugin to go live"
            }
          >
            {streamLoading ? "..." : isLive ? "Stop Stream" : "Go Live"}
          </button>
        )}
        {IS_POPOUT ? (
          <>
            <button
              type="button"
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${isPip
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
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${pinned
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
            title={t("statusbar.PopOutStreamView")}
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
                // Clear any existing poll before creating a new one
                if (popoutPollRef.current) {
                  clearInterval(popoutPollRef.current);
                }
                // Poll for popout close and notify to switch back
                popoutPollRef.current = setInterval(() => {
                  if (popoutWin.closed) {
                    if (popoutPollRef.current) {
                      clearInterval(popoutPollRef.current);
                      popoutPollRef.current = null;
                    }
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
              <title>{t("statusbar.PopOut")}</title>
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
