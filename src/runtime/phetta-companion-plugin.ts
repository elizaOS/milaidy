/**
 * Phetta Companion bridge plugin for Milaidy.
 *
 * Bridges ElizaOS runtime events (messages, runs, actions) to the local
 * Phetta Companion desktop pet via its localhost-only HTTP API.
 *
 * Phetta Companion defaults:
 *   HTTP: http://127.0.0.1:9876
 *   POST /event  { type, message?, file?, data? }
 *   POST /notify { message, ...data }
 */

import type {
  Action,
  ActionEventPayload,
  MessagePayload,
  Plugin,
  RunEventPayload,
} from "@elizaos/core";
import { EventType, logger } from "@elizaos/core";

type PhettaEvent = {
  type: string;
  message?: string;
  file?: string;
  data?: Record<string, unknown>;
};

export type PhettaCompanionPluginOptions = {
  /** Master enable flag (default: false). */
  enabled: boolean;
  /** Base HTTP URL to Phetta Companion (default: http://127.0.0.1:9876). */
  httpUrl: string;
  /** Request timeout in ms (default: 300). */
  timeoutMs: number;
  /** Forward inbound user messages (MESSAGE_RECEIVED). Default: true. */
  forwardUserMessages: boolean;
  /** Forward outbound assistant messages (MESSAGE_SENT). Default: true. */
  forwardAssistantMessages: boolean;
  /** Forward run lifecycle (RUN_STARTED/RUN_ENDED/RUN_TIMEOUT). Default: true. */
  forwardRuns: boolean;
  /** Forward action lifecycle (ACTION_STARTED/ACTION_COMPLETED). Default: false. */
  forwardActions: boolean;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function parseBool(v: unknown, defaultValue: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return defaultValue;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "y" || s === "on")
    return true;
  if (s === "0" || s === "false" || s === "no" || s === "n" || s === "off")
    return false;
  return defaultValue;
}

function parseIntSafe(v: unknown, defaultValue: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return defaultValue;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolvePhettaCompanionOptionsFromEnv(
  env: NodeJS.ProcessEnv,
): PhettaCompanionPluginOptions {
  const enabled = parseBool(env.PHETTA_COMPANION_ENABLED, false);
  const httpUrl = normalizeBaseUrl(
    asNonEmptyString(env.PHETTA_COMPANION_HTTP_URL) ?? "http://127.0.0.1:9876",
  );
  const timeoutMs = Math.max(
    50,
    parseIntSafe(env.PHETTA_COMPANION_TIMEOUT_MS, 300),
  );

  return {
    enabled,
    httpUrl,
    timeoutMs,
    forwardUserMessages: parseBool(
      env.PHETTA_COMPANION_FORWARD_USER_MESSAGES,
      true,
    ),
    forwardAssistantMessages: parseBool(
      env.PHETTA_COMPANION_FORWARD_ASSISTANT_MESSAGES,
      true,
    ),
    forwardRuns: parseBool(env.PHETTA_COMPANION_FORWARD_RUNS, true),
    forwardActions: parseBool(env.PHETTA_COMPANION_FORWARD_ACTIONS, false),
  };
}

function extractMessageText(payload: MessagePayload): string | null {
  const text = payload.message?.content?.text;
  return asNonEmptyString(text);
}

function buildMessageData(payload: MessagePayload): Record<string, unknown> {
  const meta = payload.message?.metadata as Record<string, unknown> | undefined;
  return {
    roomId: payload.message?.roomId,
    worldId: payload.message?.worldId,
    entityId: payload.message?.entityId,
    sessionKey: meta?.sessionKey,
    source: payload.message?.content?.source,
    type: payload.message?.content?.type,
  };
}

function buildRunData(payload: RunEventPayload): Record<string, unknown> {
  return {
    runId: payload.runId,
    messageId: payload.messageId,
    roomId: payload.roomId,
    entityId: payload.entityId,
    status: payload.status,
    duration: payload.duration,
  };
}

function buildActionData(payload: ActionEventPayload): Record<string, unknown> {
  return {
    roomId: payload.roomId,
    worldId: payload.world,
    messageId: payload.messageId,
    type: payload.content?.type,
    source: payload.content?.source,
    actions: payload.content?.actions,
  };
}

function createHttpClient(opts: { baseUrl: string; timeoutMs: number }): {
  postEvent: (event: PhettaEvent) => Promise<boolean>;
  postNotify: (
    message: string,
    data?: Record<string, unknown>,
  ) => Promise<boolean>;
} {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const timeoutMs = opts.timeoutMs;

  // Avoid log spam when the companion isn't running.
  let lastConnErrorAt = 0;

  const shouldLogConnError = (): boolean => {
    const now = Date.now();
    if (now - lastConnErrorAt > 30_000) {
      lastConnErrorAt = now;
      return true;
    }
    return false;
  };

  async function postJson(path: string, body: unknown): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return resp.ok;
    } catch (err) {
      // Connection refused is expected if Phetta isn't running.
      if (shouldLogConnError()) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`[phetta-companion] POST ${path} failed: ${msg}`);
      }
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    postEvent: (event) => postJson("/event", event),
    postNotify: (message, data) =>
      postJson("/notify", { message, ...(data ?? {}) }),
  };
}

export function createPhettaCompanionPlugin(
  opts: PhettaCompanionPluginOptions,
): Plugin {
  const client = createHttpClient({
    baseUrl: opts.httpUrl,
    timeoutMs: opts.timeoutMs,
  });

  const sendEvent = (event: PhettaEvent): void => {
    // Fire-and-forget so we never block the agent turn on UI/IPC.
    void client.postEvent(event);
  };

  const notifyAction: Action = {
    name: "PHETTA_NOTIFY",
    similes: ["DESKTOP_PET_NOTIFY", "COMPANION_NOTIFY", "PET_NOTIFY"],
    description:
      "Send a notification to the local Phetta Companion desktop pet (localhost).",
    validate: async () => true,
    handler: async (_runtime, _message, _state, options) => {
      const params = (
        options as { parameters?: Record<string, unknown> } | undefined
      )?.parameters;
      const message = asNonEmptyString(params?.message) ?? "Notification";
      const ok = await client.postNotify(message);
      return {
        text: ok
          ? "Sent to Phetta Companion."
          : "Failed to reach Phetta Companion.",
        success: ok,
        values: { delivered: ok },
        data: { message },
      };
    },
    parameters: [
      {
        name: "message",
        description: "Notification text to show/speak in Phetta Companion.",
        required: true,
        schema: { type: "string" as const },
      },
    ],
  };

  const sendEventAction: Action = {
    name: "PHETTA_SEND_EVENT",
    similes: ["PHETTA_EVENT", "DESKTOP_PET_EVENT", "COMPANION_EVENT"],
    description:
      "Send a raw activity event to Phetta Companion (/event). Useful to set states like agentThinking/agentDone.",
    validate: async () => true,
    handler: async (_runtime, _message, _state, options) => {
      const params = (
        options as { parameters?: Record<string, unknown> } | undefined
      )?.parameters;
      const type = asNonEmptyString(params?.type) ?? "custom";
      const message = asNonEmptyString(params?.message) ?? undefined;
      const file = asNonEmptyString(params?.file) ?? undefined;
      const data =
        params?.data &&
        typeof params.data === "object" &&
        !Array.isArray(params.data)
          ? (params.data as Record<string, unknown>)
          : undefined;

      const ok = await client.postEvent({ type, message, file, data });
      return {
        text: ok
          ? "Event sent to Phetta Companion."
          : "Failed to reach Phetta Companion.",
        success: ok,
        values: { delivered: ok, type },
        data: { type, message, file },
      };
    },
    parameters: [
      {
        name: "type",
        description:
          "Event type (e.g. userMessage, assistantMessage, agentThinking, agentDone, fileEdit).",
        required: true,
        schema: { type: "string" as const },
      },
      {
        name: "message",
        description: "Optional message payload for the event.",
        required: false,
        schema: { type: "string" as const },
      },
      {
        name: "file",
        description:
          "Optional file path for fileEdit/fileOpen/fileClose events.",
        required: false,
        schema: { type: "string" as const },
      },
      {
        name: "data",
        description: "Optional JSON object with additional metadata.",
        required: false,
        schema: { type: "object" as const },
      },
    ],
  };

  const plugin: Plugin = {
    name: "plugin-phetta-companion",
    description:
      "Bridge Milaidy runtime events to the Phetta Companion VRM desktop pet (localhost HTTP API).",
    init: async () => {
      logger.debug(
        "[phetta-companion] Plugin initialized, listening for runtime events",
      );
    },
    actions: [notifyAction, sendEventAction],
    events: {
      ...(opts.forwardUserMessages
        ? {
            [EventType.MESSAGE_RECEIVED]: [
              async (payload: MessagePayload) => {
                const text = extractMessageText(payload);
                if (!text) return;
                sendEvent({
                  type: "userMessage",
                  message: text,
                  data: buildMessageData(payload),
                });
              },
            ],
          }
        : {}),

      ...(opts.forwardAssistantMessages
        ? {
            [EventType.MESSAGE_SENT]: [
              async (payload: MessagePayload) => {
                const text = extractMessageText(payload);
                if (!text) return;
                sendEvent({
                  type: "assistantMessage",
                  message: text,
                  data: buildMessageData(payload),
                });
              },
            ],
          }
        : {}),

      ...(opts.forwardRuns
        ? {
            [EventType.RUN_STARTED]: [
              async (payload: RunEventPayload) => {
                sendEvent({
                  type: "agentStart",
                  data: buildRunData(payload),
                });
              },
            ],
            [EventType.RUN_ENDED]: [
              async (payload: RunEventPayload) => {
                sendEvent({
                  type: "agentDone",
                  data: buildRunData(payload),
                });
              },
            ],
            [EventType.RUN_TIMEOUT]: [
              async (payload: RunEventPayload) => {
                sendEvent({
                  type: "error",
                  message: "Agent run timed out.",
                  data: buildRunData(payload),
                });
              },
            ],
          }
        : {}),

      ...(opts.forwardActions
        ? {
            [EventType.ACTION_STARTED]: [
              async (payload: ActionEventPayload) => {
                sendEvent({
                  type: "agentThinking",
                  data: buildActionData(payload),
                });
              },
            ],
            [EventType.ACTION_COMPLETED]: [
              async (payload: ActionEventPayload) => {
                // No state transition; keep as a custom event for debugging.
                sendEvent({
                  type: "custom",
                  message: "Action completed.",
                  data: buildActionData(payload),
                });
              },
            ],
          }
        : {}),
    },
  };

  return plugin;
}
