import { useEffect, useRef } from "react";
import type { StreamEventEnvelope } from "../../api-client";
import { formatTime } from "../shared/format";
import {
  CHANNEL_COLORS,
  getEventFrom,
  getEventSource,
  getEventText,
} from "./helpers";

export function ActivityFeed({ events }: { events: StreamEventEnvelope[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (events.length > prevLenRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  return (
    <div className="flex flex-col h-full bg-[#141720]">
      <div className="px-3 py-2.5 border-b border-[#1e2230] shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Activity
        </span>
      </div>
      <div
        ref={feedRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5"
      >
        {events.length === 0 ? (
          <div className="text-gray-600 text-xs py-8 text-center">
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
                className={`rounded-lg px-2.5 py-2 ${
                  isNewViewer
                    ? "bg-emerald-500/5 border-l-2 border-l-emerald-500/40"
                    : isThought
                      ? "bg-yellow-500/5 border-l-2 border-l-yellow-500/40"
                      : isAction
                        ? "bg-blue-500/5 border-l-2 border-l-blue-500/40"
                        : isAssistant
                          ? "bg-green-500/5 border-l-2 border-l-green-500/40"
                          : channelStyle
                            ? `${channelStyle.bg} border-l-2`
                            : "bg-[#1a1f2e]/50 border-l-2 border-l-[#2a3040]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-semibold uppercase ${
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
                                : "text-indigo-400"
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
                  <span className="text-[10px] text-gray-600">
                    {formatTime(event.ts, { fallback: "" })}
                  </span>
                </div>
                <div
                  className={`text-[12px] mt-0.5 break-words line-clamp-3 ${
                    isThought
                      ? "text-yellow-200/60 italic"
                      : "text-gray-300"
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
