/**
 * ChatOverlayWidget — Floating chat messages overlay for streams.
 *
 * Shows recent inbound chat messages with usernames, styled like
 * a Twitch/YouTube chat overlay.
 */

import { useMemo } from "react";
import type { WidgetDefinition, WidgetRenderProps } from "../types";
import { registerWidget } from "../registry";

function ChatOverlayComponent({
  instance,
  events,
}: WidgetRenderProps) {
  const maxMessages = (instance.config.maxMessages as number) ?? 8;
  const showSource = (instance.config.showSource as boolean) ?? false;

  const messages = useMemo(() => {
    const msgs: Array<{
      id: string;
      from: string;
      text: string;
      source: string;
      ts: number;
    }> = [];

    for (const evt of events) {
      const p = evt.payload as Record<string, unknown>;
      if (p.direction !== "inbound" && evt.stream !== "new_viewer") continue;

      const text = typeof p.text === "string" ? p.text.trim() : "";
      const from =
        (typeof p.displayName === "string" && p.displayName.trim()) ||
        (typeof p.from === "string" && p.from.trim()) ||
        (typeof p.username === "string" && p.username.trim()) ||
        "viewer";
      const source = typeof p.source === "string" ? p.source : "chat";

      if (evt.stream === "new_viewer") {
        msgs.push({
          id: evt.eventId,
          from,
          text: `${from} joined!`,
          source: "system",
          ts: evt.ts,
        });
      } else if (text) {
        msgs.push({ id: evt.eventId, from, text, source, ts: evt.ts });
      }
    }

    return msgs.slice(-maxMessages);
  }, [events, maxMessages]);

  return (
    <div
      className="w-full h-full flex flex-col justify-end overflow-hidden"
      style={{ pointerEvents: "none" }}
    >
      {messages.map((msg) => {
        const isSystem = msg.source === "system";
        return (
          <div
            key={msg.id}
            className="px-2 py-0.5 animate-in fade-in slide-in-from-bottom duration-300"
          >
            <span
              className="inline-block rounded px-2 py-1 text-[12px] leading-tight"
              style={{
                background: isSystem
                  ? "rgba(52, 211, 153, 0.15)"
                  : "rgba(0, 0, 0, 0.65)",
                backdropFilter: "blur(4px)",
              }}
            >
              {showSource && !isSystem && (
                <span className="text-[9px] text-gray-500 mr-1">
                  [{msg.source}]
                </span>
              )}
              <span
                className={`font-bold mr-1 ${isSystem ? "text-emerald-400" : "text-indigo-400"}`}
              >
                {msg.from}
              </span>
              <span className={isSystem ? "text-emerald-200/80 italic" : "text-white/90"}>
                {isSystem ? msg.text : msg.text.slice(0, 150)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const definition: WidgetDefinition = {
  type: "chat-overlay",
  name: "Chat Overlay",
  description: "Floating chat messages overlay (Twitch-style)",
  subscribesTo: ["message", "new_viewer"],
  defaultPosition: { x: 0, y: 60, width: 35, height: 35 },
  defaultZIndex: 25,
  configSchema: {
    maxMessages: {
      type: "number",
      label: "Max Messages",
      default: 8,
      min: 3,
      max: 20,
    },
    showSource: {
      type: "boolean",
      label: "Show Source (Discord, Retake, etc.)",
      default: false,
    },
  },
  defaultConfig: { maxMessages: 8, showSource: false },
  render: ChatOverlayComponent,
};

registerWidget(definition);
export default definition;
