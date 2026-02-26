/**
 * StreamView — Dynamic agent activity screen for retake.tv streaming.
 *
 * Shows what the agent is actively doing as the primary content:
 * - Terminal output when running commands
 * - Game iframe when playing a game
 * - Chat exchanges when conversing
 * - Activity dashboard when idle
 *
 * VRM avatar floats as a small picture-in-picture overlay (bottom-left).
 * Activity feed runs along the right sidebar. Chat ticker at the bottom.
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "../AppContext";
import type { ConversationMessage, StreamEventEnvelope } from "../api-client";
import { client, isApiError } from "../api-client";
import { ChatAvatar } from "./ChatAvatar";
import { formatTime } from "./shared/format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_ACTIVE_WINDOW_MS = 30_000;
const TERMINAL_ACTIVE_WINDOW_MS = 15_000;

/** PIP window dimensions (640×360 → captures at 1280×720 on Retina 2× displays). */
const PIP_SIZE = { width: 640, height: 360 };
const FULL_SIZE = { width: 1280, height: 720 };

const CHANNEL_COLORS: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  retake: {
    border: "border-fuchsia-500/30",
    bg: "bg-fuchsia-500/5",
    text: "text-fuchsia-400",
  },
  discord: {
    border: "border-indigo-500/30",
    bg: "bg-indigo-500/5",
    text: "text-indigo-400",
  },
};

function getEventFrom(event: StreamEventEnvelope): string | undefined {
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.displayName === "string" && payload.displayName.trim())
    return payload.displayName.trim();
  if (typeof payload.from === "string" && payload.from.trim())
    return payload.from.trim();
  return undefined;
}

function getEventText(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<string, unknown>;
  const text = payload.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const preview = payload.preview;
  if (typeof preview === "string" && preview.trim()) return preview.trim();
  const reason = payload.reason;
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return event.stream ? `${event.stream} event` : event.type;
}

function getEventSource(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.source === "string") return payload.source;
  if (typeof payload.channel === "string") return payload.channel;
  return event.stream ?? "agent";
}

type AgentMode = "gaming" | "terminal" | "chatting" | "idle";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Detect popout mode from URL. */
const IS_POPOUT = (() => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.has("popout");
})();

/** Toggle always-on-top for the current window (Electron only). */
async function toggleAlwaysOnTop(pinned: boolean): Promise<boolean> {
  try {
    // Try Capacitor Desktop plugin
    const cap = (window as unknown as Record<string, unknown>).Capacitor as
      | Record<string, unknown>
      | undefined;
    if (cap?.Plugins) {
      const plugins = cap.Plugins as Record<string, unknown>;
      const desktop = plugins.Desktop as
        | { setAlwaysOnTop?: (opts: { flag: boolean }) => Promise<void> }
        | undefined;
      if (desktop?.setAlwaysOnTop) {
        await desktop.setAlwaysOnTop({ flag: pinned });
        return pinned;
      }
    }
    // Fallback: try Electron IPC directly
    const electron = (window as unknown as Record<string, unknown>).electron as
      | { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> }
      | undefined;
    if (electron?.invoke) {
      await electron.invoke("desktop:setAlwaysOnTop", { flag: pinned });
      return pinned;
    }
  } catch {
    // Non-fatal — may not be in Electron
  }
  return false;
}

function StatusBar({
  agentName,
  mode,
  viewerCount,
  isPip,
  onTogglePip,
  streamLive,
  streamLoading,
  onToggleStream,
}: {
  agentName: string;
  mode: AgentMode;
  viewerCount: number | null;
  isPip: boolean;
  onTogglePip: () => void;
  streamLive: boolean;
  streamLoading: boolean;
  onToggleStream: () => void;
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

function ActivityFeed({ events }: { events: StreamEventEnvelope[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (events.length > prevLenRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  return (
    <div className="flex flex-col h-full border-l border-border bg-bg">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Activity
        </span>
      </div>
      <div
        ref={feedRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2"
      >
        {events.length === 0 ? (
          <div className="text-muted text-xs py-4 text-center">
            No events yet
          </div>
        ) : (
          events.map((event) => {
            const isThought = event.stream === "thought";
            const isAction = event.stream === "action";
            const isAssistant = event.stream === "assistant";
            const isMessage = event.stream === "message";
            const isNewViewer = event.stream === "new_viewer";
            const source = getEventSource(event);
            const from = getEventFrom(event);
            const channelStyle =
              isMessage || isNewViewer
                ? (CHANNEL_COLORS[source] ?? null)
                : null;
            return (
              <div
                key={event.eventId}
                className={`rounded border px-2 py-1.5 ${
                  isNewViewer
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : isThought
                      ? "border-yellow-500/30 bg-yellow-500/5"
                      : isAction
                        ? "border-blue-500/30 bg-blue-500/5"
                        : isAssistant
                          ? "border-green-500/30 bg-green-500/5"
                          : channelStyle
                            ? `${channelStyle.border} ${channelStyle.bg}`
                            : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-semibold uppercase ${
                      isNewViewer
                        ? "text-emerald-400"
                        : isThought
                          ? "text-yellow-400"
                          : isAction
                            ? "text-blue-400"
                            : isAssistant
                              ? "text-green-400"
                              : channelStyle
                                ? channelStyle.text
                                : "text-accent"
                    }`}
                  >
                    {isNewViewer
                      ? "new viewer"
                      : isThought
                        ? "thought"
                        : isAction
                          ? "action"
                          : from
                            ? `@${from}`
                            : `[${source}]`}
                  </span>
                  <span className="text-[10px] text-muted">
                    {formatTime(event.ts, { fallback: "" })}
                  </span>
                </div>
                <div
                  className={`text-[12px] mt-0.5 break-words line-clamp-3 ${
                    isThought ? "text-yellow-200/70 italic" : "text-txt"
                  }`}
                >
                  {getEventText(event)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatTicker({ events }: { events: StreamEventEnvelope[] }) {
  // Build ticker entries directly from inbound message events (retake, discord, etc.)
  const recent = useMemo(() => {
    const entries: Array<{
      id: string;
      from: string;
      text: string;
      source: string;
    }> = [];
    for (const evt of events) {
      if (evt.stream !== "message") continue;
      const payload = evt.payload as Record<string, unknown>;
      if (payload.direction !== "inbound") continue;
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      const from =
        (typeof payload.displayName === "string" &&
          payload.displayName.trim()) ||
        (typeof payload.from === "string" && payload.from.trim()) ||
        "";
      const source =
        typeof payload.source === "string" ? payload.source : "retake";
      if (text) {
        entries.push({ id: evt.eventId, from: from || "viewer", text, source });
      }
    }
    return entries.slice(-10);
  }, [events]);

  if (recent.length === 0) return null;

  return (
    <div className="px-4 py-1.5 bg-bg border-t border-border overflow-hidden shrink-0">
      <div className="flex items-center gap-4 text-xs text-muted overflow-x-auto whitespace-nowrap scrollbar-hide">
        <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">
          chat
        </span>
        {recent.map((entry) => {
          const color = CHANNEL_COLORS[entry.source]?.text;
          return (
            <span key={entry.id} className="shrink-0">
              <span className={color ?? "text-accent"}>@{entry.from}</span>
              <span className="text-txt">: {entry.text.slice(0, 80)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** PIP avatar overlay — small VRM in bottom-left corner of the main area. */
function AvatarPip({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[140px] h-[180px] xl:w-[180px] xl:h-[220px] rounded-lg overflow-hidden border border-border/50 bg-bg/60 backdrop-blur-sm shadow-lg pointer-events-none">
      <ChatAvatar isSpeaking={isSpeaking} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal view — inline terminal output for stream display
// ---------------------------------------------------------------------------

interface TerminalLine {
  id: string;
  type: "command" | "stdout" | "stderr" | "exit" | "error";
  text: string;
  ts: number;
}

function StreamTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);

  const addLine = useCallback((type: TerminalLine["type"], text: string) => {
    const id = String(++lineIdRef.current);
    setLines((prev) => {
      const next = [...prev, { id, type, text, ts: Date.now() }];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    const unbind = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = data.event as string;
        switch (event) {
          case "start":
            addLine("command", `$ ${data.command as string}`);
            break;
          case "stdout":
            addLine("stdout", data.data as string);
            break;
          case "stderr":
            addLine("stderr", data.data as string);
            break;
          case "exit":
            addLine("exit", `Process exited with code ${data.code as number}`);
            break;
          case "error":
            addLine("error", `Error: ${data.data as string}`);
            break;
        }
      },
    );
    return unbind;
  }, [addLine]);

  return (
    <div className="h-full w-full bg-[#1a1a1a] flex flex-col">
      <div className="flex items-center px-3 py-1.5 border-b border-border bg-[#111] shrink-0">
        <span className="text-[11px] font-mono text-muted tracking-wide">
          TERMINAL
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-all"
      >
        {lines.length === 0 ? (
          <span className="text-muted italic text-[11px]">
            Waiting for terminal activity...
          </span>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={
                line.type === "command"
                  ? "text-accent font-bold"
                  : line.type === "stderr" || line.type === "error"
                    ? "text-destructive"
                    : line.type === "exit"
                      ? "text-muted"
                      : "text-[#ccc]"
              }
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat content — large chat bubbles for stream display
// ---------------------------------------------------------------------------

function ChatContent({
  events,
  messages,
}: {
  events: StreamEventEnvelope[];
  messages: ConversationMessage[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const recentExchanges = useMemo(() => {
    const exchanges: Array<{
      id: string;
      role: "user" | "assistant" | "event";
      text: string;
      source?: string;
      from?: string;
      ts: number;
    }> = [];

    // Build lookup from events for username resolution
    const eventFromLookup = new Map<string, string>();
    for (const evt of events) {
      if (evt.stream !== "message") continue;
      const p = evt.payload as Record<string, unknown>;
      const text = typeof p.text === "string" ? p.text.trim() : "";
      const from = typeof p.from === "string" ? p.from : "";
      if (text && from) eventFromLookup.set(text, from);
    }

    for (const msg of messages.slice(-8)) {
      exchanges.push({
        id: msg.id,
        role: msg.role,
        text: msg.text,
        source: msg.source,
        from: msg.from ?? eventFromLookup.get(msg.text.trim()),
        ts: msg.timestamp,
      });
    }

    const assistantEvents = events
      .filter((e) => e.stream === "assistant")
      .slice(-4);
    for (const evt of assistantEvents) {
      const text = getEventText(evt);
      if (!exchanges.some((e) => e.text === text)) {
        exchanges.push({
          id: evt.eventId,
          role: "event",
          text,
          source: getEventSource(evt),
          ts: evt.ts,
        });
      }
    }

    return exchanges.sort((a, b) => a.ts - b.ts).slice(-10);
  }, [events, messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-auto px-5 py-4 space-y-3"
    >
      {recentExchanges.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted text-sm">
          Waiting for messages...
        </div>
      ) : (
        recentExchanges.map((exchange) => {
          const channelStyle =
            exchange.role === "user" && exchange.source
              ? CHANNEL_COLORS[exchange.source]
              : undefined;
          return (
            <div
              key={exchange.id}
              className={`flex ${
                exchange.role === "assistant" || exchange.role === "event"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                  exchange.role === "assistant" || exchange.role === "event"
                    ? "bg-accent/20 text-txt-strong"
                    : channelStyle
                      ? `${channelStyle.bg} text-txt border ${channelStyle.border}`
                      : "bg-bg-muted text-txt"
                }`}
              >
                <div
                  className={`text-[10px] uppercase mb-1 ${channelStyle?.text ?? "text-muted"}`}
                >
                  {exchange.role === "user"
                    ? exchange.from
                      ? `@${exchange.from}`
                      : (exchange.source ?? "viewer")
                    : "agent"}
                </div>
                <div className="text-sm leading-relaxed break-words">
                  {exchange.text}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle dashboard — agent status + recent thoughts/actions
// ---------------------------------------------------------------------------

function IdleContent({ events }: { events: StreamEventEnvelope[] }) {
  const latestThought = useMemo(
    () =>
      [...events]
        .reverse()
        .find((e) => e.stream === "assistant" || e.stream === "evaluator"),
    [events],
  );

  const recentActions = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.stream === "action" ||
            e.stream === "tool" ||
            e.stream === "provider",
        )
        .slice(-6),
    [events],
  );

  return (
    <div className="h-full w-full flex flex-col justify-center px-8 py-6">
      {latestThought ? (
        <div className="mb-5">
          <div className="text-[10px] uppercase text-muted mb-1">Thought</div>
          <div className="text-base text-txt italic leading-relaxed">
            "{getEventText(latestThought).slice(0, 250)}"
          </div>
        </div>
      ) : (
        <div className="text-muted text-base mb-5">
          Agent is idle — awaiting activity...
        </div>
      )}
      {recentActions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-muted mb-2">
            Recent Actions
          </div>
          <div className="space-y-1.5">
            {recentActions.map((a) => (
              <div
                key={a.eventId}
                className="flex items-center gap-2 text-[12px]"
              >
                <span className="text-ok font-mono">
                  {a.stream ?? "action"}
                </span>
                <span className="text-txt truncate">
                  {getEventText(a).slice(0, 80)}
                </span>
                <span className="text-[10px] text-muted ml-auto shrink-0">
                  {formatTime(a.ts, { fallback: "" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StreamView
// ---------------------------------------------------------------------------

export function StreamView() {
  const {
    agentStatus,
    autonomousEvents,
    conversationMessages,
    activeGameViewerUrl,
    activeGameSandbox,
    chatAvatarSpeaking,
  } = useApp();

  const agentName = agentStatus?.agentName ?? "Milady";

  // ── Stream status polling ─────────────────────────────────────────────
  const [streamLive, setStreamLive] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const loadingRef = useRef(false);

  const [retakeAvailable, setRetakeAvailable] = useState(true);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (loadingRef.current || !retakeAvailable) return;
      try {
        const status = await client.retakeStatus();
        if (mounted && !loadingRef.current) {
          setStreamLive(status.running && status.ffmpegAlive);
        }
      } catch (err: unknown) {
        // 404 means retake connector is not configured — stop polling
        if (isApiError(err) && err.status === 404) {
          setRetakeAvailable(false);
          return;
        }
        // Other errors — API not yet available, leave as offline
      }
    };
    if (!retakeAvailable) return;
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [retakeAvailable]);

  const toggleStream = useCallback(async () => {
    if (loadingRef.current) return; // guard against concurrent calls
    loadingRef.current = true;
    setStreamLoading(true);
    try {
      if (streamLive) {
        await client.retakeGoOffline();
        setStreamLive(false);
      } else {
        const result = await client.retakeGoLive();
        setStreamLive(result.live);
      }
    } catch {
      // Toggle failed — re-fetch actual state. The 5s poll also
      // serves as a recovery mechanism if this status fetch fails.
      try {
        const status = await client.retakeStatus();
        setStreamLive(status.running && status.ffmpegAlive);
      } catch {
        /* poll will recover within 5s */
      }
    } finally {
      loadingRef.current = false;
      setStreamLoading(false);
    }
  }, [streamLive]);

  // PIP mode state — small overlay window
  const [isPip, setIsPip] = useState(false);

  const togglePip = useCallback(() => {
    if (!IS_POPOUT) return;
    const next = !isPip;
    if (next) {
      // Enter PIP: small window positioned at bottom-right
      window.resizeTo(PIP_SIZE.width, PIP_SIZE.height);
      const sw = window.screen.availWidth;
      const sh = window.screen.availHeight;
      window.moveTo(sw - PIP_SIZE.width - 20, sh - PIP_SIZE.height - 20);
    } else {
      // Exit PIP: restore full size, centered
      window.resizeTo(FULL_SIZE.width, FULL_SIZE.height);
      const sw = window.screen.availWidth;
      const sh = window.screen.availHeight;
      window.moveTo(
        Math.round((sw - FULL_SIZE.width) / 2),
        Math.round((sh - FULL_SIZE.height) / 2),
      );
    }
    setIsPip(next);
  }, [isPip]);

  // Track whether terminal is active (received output recently)
  const [terminalActive, setTerminalActive] = useState(false);
  const terminalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unbind = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = data.event as string;
        if (event === "start" || event === "stdout" || event === "stderr") {
          setTerminalActive(true);
          if (terminalTimeoutRef.current) {
            clearTimeout(terminalTimeoutRef.current);
          }
          terminalTimeoutRef.current = setTimeout(() => {
            setTerminalActive(false);
          }, TERMINAL_ACTIVE_WINDOW_MS);
        }
      },
    );
    return () => {
      unbind();
      if (terminalTimeoutRef.current) clearTimeout(terminalTimeoutRef.current);
    };
  }, []);

  // Detect current mode (priority order)
  const mode: AgentMode = useMemo(() => {
    if (activeGameViewerUrl.trim()) return "gaming";
    if (terminalActive) return "terminal";

    const now = Date.now();
    const recentChat = autonomousEvents.find(
      (e) => e.stream === "assistant" && now - e.ts < CHAT_ACTIVE_WINDOW_MS,
    );
    if (recentChat) return "chatting";

    return "idle";
  }, [activeGameViewerUrl, terminalActive, autonomousEvents]);

  const feedEvents = useMemo(
    () =>
      autonomousEvents
        .filter((e) => e.stream !== "viewer_stats")
        .slice(-80)
        .reverse(),
    [autonomousEvents],
  );

  // Extract latest viewer stats from events
  const viewerCount = useMemo(() => {
    for (let i = autonomousEvents.length - 1; i >= 0; i--) {
      const evt = autonomousEvents[i];
      if (evt.stream === "viewer_stats") {
        const p = evt.payload as Record<string, unknown>;
        if (typeof p.apiViewerCount === "number") return p.apiViewerCount;
        if (typeof p.uniqueChatters === "number") return p.uniqueChatters;
      }
    }
    return null;
  }, [autonomousEvents]);

  // In PIP mode, render the full 1280×720 layout and CSS-transform-scale it
  // down to fit the PIP window. This keeps the stream capture identical to
  // the normal view — capturePage() captures the full layout at native pixels.
  const pipScale = isPip ? PIP_SIZE.width / FULL_SIZE.width : 1;
  const pipStyle: CSSProperties | undefined = isPip
    ? {
        width: FULL_SIZE.width,
        height: FULL_SIZE.height,
        transform: `scale(${pipScale})`,
        transformOrigin: "top left",
      }
    : undefined;

  return (
    <div
      data-stream-view
      className={`flex flex-col bg-bg text-txt font-body ${isPip ? "" : "h-full w-full"}`}
      style={pipStyle}
    >
      <StatusBar
        agentName={agentName}
        mode={mode}
        viewerCount={viewerCount}
        isPip={isPip}
        onTogglePip={togglePip}
        streamLive={streamLive}
        streamLoading={streamLoading}
        onToggleStream={toggleStream}
      />

      <div className="flex flex-1 min-h-0">
        {/* Main content area — shows what the agent is doing */}
        <div className="flex-1 min-w-0 relative">
          {mode === "gaming" ? (
            <iframe
              src={activeGameViewerUrl}
              title="Game"
              className="w-full h-full border-0"
              sandbox={
                activeGameSandbox ||
                "allow-scripts allow-same-origin allow-popups"
              }
            />
          ) : mode === "terminal" ? (
            <StreamTerminal />
          ) : mode === "chatting" ? (
            <ChatContent
              events={autonomousEvents.slice(-20)}
              messages={conversationMessages}
            />
          ) : (
            <IdleContent events={autonomousEvents.slice(-20)} />
          )}

          {/* VRM avatar — picture-in-picture overlay */}
          <AvatarPip isSpeaking={chatAvatarSpeaking} />
        </div>

        {/* Activity sidebar */}
        <div className="w-[260px] min-w-[260px] xl:w-[300px] xl:min-w-[300px]">
          <ActivityFeed events={feedEvents} />
        </div>
      </div>

      <ChatTicker events={autonomousEvents} />
    </div>
  );
}
