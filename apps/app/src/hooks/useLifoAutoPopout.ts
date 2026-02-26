import { useEffect, useRef } from "react";
import { client } from "../api-client";
import {
  buildLifoPopoutUrl,
  isLifoPopoutMode,
  LIFO_POPOUT_WINDOW_NAME,
} from "../lifo-popout";

const MAX_TRACKED_EVENT_IDS = 512;

const LIFO_EVENT_KEYWORD_RE =
  /\b(lifo|computeruse|computer-use|computer use|sandbox|stagehand|cdp|browser|playwright|chromium|xdotool|cliclick|novnc|vnc)\b/i;
const LIFO_TERMINAL_COMMAND_RE =
  /\b(lifo|computeruse|computer-use|sandbox|browser|playwright|chromium|xdotool|cliclick|novnc|vnc)\b/i;

type AgentEventLike = {
  type?: unknown;
  eventId?: unknown;
  runId?: unknown;
  stream?: unknown;
  payload?: unknown;
};

type TerminalOutputStartLike = {
  type?: unknown;
  event?: unknown;
  runId?: unknown;
  command?: unknown;
};

interface UseLifoAutoPopoutOptions {
  enabled?: boolean;
  targetPath: string;
  onPopupBlocked?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectPayloadStrings(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean")
    return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectPayloadStrings(entry, depth + 1));
  }
  if (!isRecord(value)) return [];

  const collected: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    collected.push(key);
    collected.push(...collectPayloadStrings(entry, depth + 1));
  }
  return collected;
}

function normalizeSearchableText(text: string): string {
  return text.replace(/[_/\\:]+/g, " ");
}

function parseAgentEvent(data: Record<string, unknown>): AgentEventLike {
  return {
    type: data.type,
    eventId: data.eventId,
    runId: data.runId,
    stream: data.stream,
    payload: data.payload,
  };
}

function parseTerminalStartEvent(
  data: Record<string, unknown>,
): TerminalOutputStartLike {
  return {
    type: data.type,
    event: data.event,
    runId: data.runId,
    command: data.command,
  };
}

export function shouldAutoOpenForAutonomyEvent(event: AgentEventLike): boolean {
  if (event.type !== "agent_event") return false;
  if (!isRecord(event.payload)) return false;

  const stream = typeof event.stream === "string" ? event.stream : "";
  if (
    stream !== "tool" &&
    stream !== "action" &&
    stream !== "provider" &&
    stream !== "assistant"
  ) {
    return false;
  }

  const searchable = normalizeSearchableText(
    collectPayloadStrings(event.payload).join(" "),
  );
  return LIFO_EVENT_KEYWORD_RE.test(searchable);
}

export function shouldAutoOpenForTerminalCommand(command: string): boolean {
  return LIFO_TERMINAL_COMMAND_RE.test(normalizeSearchableText(command));
}

export function useLifoAutoPopout(options: UseLifoAutoPopoutOptions): void {
  const { enabled = true, targetPath, onPopupBlocked } = options;
  const popoutRef = useRef<Window | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const eventIdOrderRef = useRef<string[]>([]);
  const triggeredRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (isLifoPopoutMode()) return;

    const rememberEventId = (eventId: string): boolean => {
      if (seenEventIdsRef.current.has(eventId)) return false;
      seenEventIdsRef.current.add(eventId);
      eventIdOrderRef.current.push(eventId);
      if (eventIdOrderRef.current.length > MAX_TRACKED_EVENT_IDS) {
        const remove = eventIdOrderRef.current.splice(
          0,
          eventIdOrderRef.current.length - MAX_TRACKED_EVENT_IDS,
        );
        for (const staleId of remove) {
          seenEventIdsRef.current.delete(staleId);
        }
      }
      return true;
    };

    const openOrFocusPopout = (): boolean => {
      const existing = popoutRef.current;
      if (existing && !existing.closed) {
        existing.focus();
        return true;
      }

      const popup = window.open(
        buildLifoPopoutUrl({ targetPath }),
        LIFO_POPOUT_WINDOW_NAME,
        "popup,width=1400,height=860",
      );

      if (!popup) {
        onPopupBlocked?.();
        return false;
      }

      popoutRef.current = popup;
      popup.focus();
      return true;
    };

    const maybeTriggerByRun = (runId: string | null): void => {
      if (!runId) {
        void openOrFocusPopout();
        return;
      }
      if (triggeredRunIdsRef.current.has(runId)) return;
      // Mark run as attempted regardless of popup success to avoid
      // repeatedly spamming blocked popup attempts during one run.
      triggeredRunIdsRef.current.add(runId);
      void openOrFocusPopout();
    };

    client.connectWs();

    const unbindAgentEvents = client.onWsEvent(
      "agent_event",
      (data: Record<string, unknown>) => {
        const event = parseAgentEvent(data);
        const eventId =
          typeof event.eventId === "string" ? event.eventId : null;
        if (eventId && !rememberEventId(eventId)) return;
        if (!shouldAutoOpenForAutonomyEvent(event)) return;

        const runId = typeof event.runId === "string" ? event.runId : null;
        maybeTriggerByRun(runId);
      },
    );

    const unbindTerminalEvents = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = parseTerminalStartEvent(data);
        if (event.type !== "terminal-output" || event.event !== "start") {
          return;
        }
        if (typeof event.command !== "string" || !event.command.trim()) return;
        if (!shouldAutoOpenForTerminalCommand(event.command)) return;

        const runId = typeof event.runId === "string" ? event.runId : null;
        maybeTriggerByRun(runId);
      },
    );

    return () => {
      unbindAgentEvents();
      unbindTerminalEvents();
    };
  }, [enabled, onPopupBlocked, targetPath]);
}
