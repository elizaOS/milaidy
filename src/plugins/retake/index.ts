/**
 * Milady Retake Plugin — retake.tv streaming integration.
 *
 * Manages RTMP streaming to retake.tv via FFmpeg, including browser capture,
 * frame piping, and stream lifecycle (go-live / go-offline).
 *
 * Additionally provides:
 * - Chat polling: reads retake.tv stream chat, routes messages to the agent
 * - Agent actions: START_RETAKE_STREAM, STOP_RETAKE_STREAM, GET_RETAKE_STREAM_STATUS
 *
 * ## HTTP Routes (registered dynamically)
 *
 * - POST /api/stream/frame   — pipe captured frames to StreamManager
 * - POST /api/stream/live    — start streaming (destination-driven)
 * - POST /api/stream/offline — stop stream and notify destination
 */

import {
  createUniqueUuid,
  type Action,
  type ActionExample,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type Plugin,
  type Provider,
  type ProviderResult,
  type State,
  type UUID,
} from "@elizaos/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG = "[retake]";
const CHAT_POLL_INTERVAL_MS = 3_000;
const LOCAL_API_PORT = Number(
  process.env.SERVER_PORT || process.env.PORT || "2138",
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/v1/agent/stream/comments */
interface RetakeChatComment {
  chat_event_id: string;
  sender_user_id: string;
  sender_username: string;
  sender_display_name: string;
  sender_pfp: string;
  sender_wallet_address: string;
  streamer_id: string;
  session_id: string;
  text: string;
  timestamp: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Chat polling state (module-level, single stream per agent)
// ---------------------------------------------------------------------------

let chatPollTimer: ReturnType<typeof setInterval> | null = null;
let viewerStatsPollTimer: ReturnType<typeof setInterval> | null = null;
let lastSeenId: string | null = null;
let pluginRuntime: IAgentRuntime | null = null;
let chatPollInFlight = false;
let ourUserDbId: string | null = null;

/** Tracks usernames seen during the current stream session for new viewer detection. */
const seenViewers = new Set<string>();

/** True after the first chat poll completes. new_viewer events are only emitted after this. */
let initialPollDone = false;

/** Cached auth from connector config — set once during init. */
let cachedAccessToken = "";
let cachedApiUrl = "https://retake.tv/api/v1";

function getRetakeAuth(_runtime: IAgentRuntime) {
  return { accessToken: cachedAccessToken, apiUrl: cachedApiUrl };
}

// ---------------------------------------------------------------------------
// Chat API helpers
// ---------------------------------------------------------------------------

async function fetchChatComments(
  apiUrl: string,
  token: string,
  userDbId: string,
  limit = 50,
): Promise<RetakeChatComment[]> {
  const params = new URLSearchParams({
    userDbId,
    limit: String(limit),
  });

  const res = await fetch(`${apiUrl}/agent/stream/comments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    pluginRuntime?.logger.warn(`${TAG} Chat API returned ${res.status}`);
    return [];
  }
  const data = (await res.json()) as Record<string, unknown>;
  // The API may return an array directly, or { comments: [...] }
  const comments = Array.isArray(data)
    ? (data as RetakeChatComment[])
    : Array.isArray(data.comments)
      ? (data.comments as RetakeChatComment[])
      : [];
  return comments;
}

async function sendChatMessage(
  apiUrl: string,
  token: string,
  message: string,
  destinationUserDbId: string,
): Promise<void> {
  await fetch(`${apiUrl}/agent/stream/chat/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      destination_user_id: destinationUserDbId,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ---------------------------------------------------------------------------
// Message routing helpers (same pattern as WhatsApp service)
// ---------------------------------------------------------------------------

function getMessagingAPI(runtime: IAgentRuntime): {
  sendMessage: (
    agentId: UUID,
    message: Memory,
    opts: { onResponse: (content: Content) => Promise<Memory[]> },
  ) => Promise<void>;
} | null {
  const rt = runtime as unknown as Record<string, unknown>;
  if (
    "elizaOS" in rt &&
    typeof rt.elizaOS === "object" &&
    rt.elizaOS !== null &&
    typeof (rt.elizaOS as Record<string, unknown>).sendMessage === "function"
  ) {
    return rt.elizaOS as ReturnType<typeof getMessagingAPI> & object;
  }
  return null;
}

function getMessageService(runtime: IAgentRuntime): {
  handleMessage: (
    runtime: IAgentRuntime,
    message: Memory,
    callback: (content: Content) => Promise<Memory[]>,
  ) => Promise<unknown>;
} | null {
  const rt = runtime as unknown as Record<string, unknown>;
  const svc = rt.messageService as Record<string, unknown> | null | undefined;
  if (svc && typeof svc.handleMessage === "function") {
    return svc as ReturnType<typeof getMessageService> & object;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Event emission — POST to local API to push events into the WebSocket stream.
// This bypasses AGENT_EVENT service issues and reliably surfaces activity
// in the StreamView and AutonomousPanel.
// ---------------------------------------------------------------------------

function emitRetakeEvent(
  _runtime: IAgentRuntime,
  stream: string,
  data: Record<string, unknown>,
  roomId?: string,
): void {
  try {
    void fetch(`http://127.0.0.1:${LOCAL_API_PORT}/api/agent/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stream,
        data: { ...data, source: "retake" },
        roomId: roomId ?? undefined,
      }),
    }).catch(() => {
      // Non-fatal — event emission should never break chat flow
    });
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Emote auto-trigger helpers
// ---------------------------------------------------------------------------

/** Map viewer chat keywords to emote IDs. */
function resolveEmoteFromChat(text: string): string | false {
  const lower = text.toLowerCase();
  if (lower.includes("dance") || lower.includes("vibe")) return "dance-happy";
  if (lower.includes("wave") || lower.includes("greet") || lower.includes("hello")) return "wave";
  if (lower.includes("flip") || lower.includes("backflip")) return "flip";
  if (lower.includes("cry") || lower.includes("sad")) return "crying";
  if (lower.includes("jump")) return "jump";
  if (lower.includes("punch") || lower.includes("fight")) return "punching";
  if (lower.includes("fish")) return "fishing";
  if (lower.includes("run")) return "run";
  if (lower.includes("sword") || lower.includes("slash")) return "sword-swing";
  if (lower.includes("spell") || lower.includes("magic") || lower.includes("cast")) return "spell-cast";
  if (lower.includes("kiss")) return "kiss";
  if (lower.includes("squat")) return "squat";
  if (lower.includes("crawl")) return "crawling";
  if (lower.includes("float") || lower.includes("fly")) return "float";
  if (lower.includes("walk")) return "walk";
  if (lower.includes("die") || lower.includes("death") || lower.includes("dead")) return "death";
  if (lower.includes("shoot") || lower.includes("gun") || lower.includes("fire")) return "firing-gun";
  if (lower.includes("chop")) return "chopping";
  return false;
}

/** POST to the local emote API endpoint. */
function triggerEmote(emoteId: string): void {
  fetch(`http://127.0.0.1:${LOCAL_API_PORT}/api/emote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoteId }),
  })
    .then(() => {
      pluginRuntime?.logger.info(`${TAG} Auto-triggered emote: ${emoteId}`);
    })
    .catch((err) => {
      pluginRuntime?.logger.warn(
        `${TAG} Failed to trigger emote: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

// ---------------------------------------------------------------------------
// Chat polling
// ---------------------------------------------------------------------------

async function pollChat(): Promise<void> {
  if (chatPollInFlight) return; // skip if previous poll still running
  chatPollInFlight = true;
  try {
    await pollChatInner();
  } finally {
    chatPollInFlight = false;
  }
}

async function pollChatInner(): Promise<void> {
  if (!pluginRuntime) return;
  const runtime = pluginRuntime;
  const { accessToken, apiUrl } = getRetakeAuth(runtime);
  if (!accessToken || !ourUserDbId) return;

  try {
    const comments = await fetchChatComments(
      apiUrl,
      accessToken,
      ourUserDbId,
      50,
    );

    // On first poll, set cursor to newest message and skip processing.
    // This prevents replaying dozens of stale historical messages on restart
    // which floods the LLM and blocks new conversations.
    if (!lastSeenId) {
      if (comments.length > 0) {
        // Find the highest chat_event_id in the batch
        let maxId = comments[0]?.chat_event_id;
        for (const c of comments) {
          if (Number(c.chat_event_id) > Number(maxId)) maxId = c.chat_event_id;
        }
        lastSeenId = maxId;
        pluginRuntime?.logger.info(
          `${TAG} Initial fetch: ${comments.length} comments — cursor set to ${lastSeenId}`,
        );
      }
      return;
    }

    // Comments come newest-first; process oldest-first
    const sorted = [...comments].reverse();

    for (const comment of sorted) {
      // Skip messages we've already processed (chat_event_id is numeric string, compare as number)
      if (lastSeenId && Number(comment.chat_event_id) <= Number(lastSeenId))
        continue;

      // Skip own messages
      if (comment.sender_user_id === ourUserDbId) continue;

      // Update cursor to the newest chat_event_id we've processed
      lastSeenId = comment.chat_event_id;

      // Build IDs
      const entityId = createUniqueUuid(runtime, comment.sender_user_id);
      const roomId = createUniqueUuid(runtime, ourUserDbId);
      const messageId = createUniqueUuid(runtime, comment.chat_event_id);
      const worldId = createUniqueUuid(runtime, "retake-world");

      // Ensure entity + room
      await runtime.ensureConnection({
        entityId,
        roomId,
        userName: comment.sender_username,
        name: comment.sender_display_name || comment.sender_username,
        source: "retake",
        channelId: comment.sender_user_id,
        type: "GROUP",
        worldId,
        worldName: "Retake Stream",
      });

      const memory: Memory = {
        id: messageId,
        entityId,
        agentId: runtime.agentId,
        roomId,
        content: {
          text: comment.text,
          source: "retake",
          channelType: "GROUP",
        },
        metadata: {
          type: "custom" as const,
          entityName: comment.sender_username,
          fromId: comment.sender_user_id,
          wallet: comment.sender_wallet_address,
        } as Record<string, unknown>,
        createdAt: Number(comment.timestamp) || Date.now(),
      };

      runtime.logger.info(
        `${TAG} Chat from @${comment.sender_username}: "${comment.text.slice(0, 80)}"`,
      );

      // Emit inbound message to AGENT_EVENT for UI visibility
      emitRetakeEvent(
        runtime,
        "message",
        {
          text: comment.text,
          from: comment.sender_username,
          displayName: comment.sender_display_name || comment.sender_username,
          pfp: comment.sender_pfp,
          direction: "inbound",
          channel: "retake",
        },
        String(roomId),
      );

      // Detect new viewers and emit a new_viewer event.
      // Skip new_viewer events during the initial poll (historical backlog).
      if (!seenViewers.has(comment.sender_username)) {
        seenViewers.add(comment.sender_username);
        if (initialPollDone) {
          emitRetakeEvent(
            runtime,
            "new_viewer",
            {
              text: `New viewer: @${comment.sender_username}`,
              from: comment.sender_username,
              displayName: comment.sender_display_name || comment.sender_username,
              pfp: comment.sender_pfp,
              channel: "retake",
            },
            String(roomId),
          );
        }
      }

      // Response callback — sends agent reply to retake chat
      const chatUserDbId = ourUserDbId;
      const callback = async (
        responseContent: Content,
      ): Promise<Memory[]> => {
        try {
          if (
            responseContent.target &&
            typeof responseContent.target === "string" &&
            responseContent.target.toLowerCase() !== "retake"
          ) {
            return [];
          }
          const replyText = responseContent.text ?? "";
          runtime.logger.info(
            `${TAG} Callback fired for @${comment.sender_username} (target=${responseContent.target ?? "none"}, text=${replyText.slice(0, 40) || "(empty)"})`,
          );
          if (!replyText.trim()) return [];

          await sendChatMessage(
            apiUrl,
            accessToken,
            replyText,
            chatUserDbId,
          );
          runtime.logger.info(
            `${TAG} Replied to @${comment.sender_username}: "${replyText.slice(0, 80)}"`,
          );

          // Emit outbound reply to AGENT_EVENT for UI visibility
          emitRetakeEvent(
            runtime,
            "assistant",
            {
              text: replyText,
              to: comment.sender_username,
              direction: "outbound",
              channel: "retake",
            },
            String(roomId),
          );

          // Emit agent thought if present
          if (
            responseContent.thought &&
            typeof responseContent.thought === "string"
          ) {
            emitRetakeEvent(
              runtime,
              "thought",
              {
                text: responseContent.thought,
                channel: "retake",
              },
              String(roomId),
            );
          }

          // Emit actions if present
          const actions = responseContent.actions;
          if (Array.isArray(actions) && actions.length > 0) {
            emitRetakeEvent(
              runtime,
              "action",
              {
                text: `Executing: ${actions.join(", ")}`,
                actions,
                channel: "retake",
              },
              String(roomId),
            );
          }

          // Auto-trigger emote based on the original viewer message OR the
          // agent's chosen actions. This ensures emotes fire reliably even
          // when the LLM doesn't explicitly select PLAY_EMOTE.
          const shouldEmote =
            (Array.isArray(actions) && actions.includes("PLAY_EMOTE")) ||
            resolveEmoteFromChat(comment.text);
          if (shouldEmote) {
            const emoteId =
              typeof shouldEmote === "string"
                ? shouldEmote
                : resolveEmoteFromChat(comment.text) || "wave";
            void triggerEmote(emoteId);
          }

          const replyMemory: Memory = {
            id: createUniqueUuid(runtime, `retake-reply-${Date.now()}`),
            entityId: runtime.agentId,
            agentId: runtime.agentId,
            roomId,
            content: {
              ...responseContent,
              text: replyText,
              source: "retake",
              channelType: "GROUP",
              inReplyTo: messageId,
            },
            createdAt: Date.now(),
          };

          await runtime.createMemory(replyMemory, "messages");
          return [replyMemory];
        } catch (err) {
          runtime.logger.error(
            `${TAG} Error sending chat reply: ${err instanceof Error ? err.message : String(err)}`,
          );
          return [];
        }
      };

      // Route through message pipeline (same pattern as WhatsApp)
      const messagingAPI = getMessagingAPI(runtime);
      const messageService = getMessageService(runtime);

      if (messagingAPI) {
        await messagingAPI.sendMessage(runtime.agentId, memory, {
          onResponse: callback,
        });
      } else if (messageService) {
        await messageService.handleMessage(runtime, memory, callback);
      } else {
        await (
          runtime.emitEvent as (
            event: string[],
            params: Record<string, unknown>,
          ) => Promise<void>
        )(["MESSAGE_RECEIVED"], {
          runtime,
          message: memory,
          callback,
          source: "retake",
        });
      }
    }
  } catch (err) {
    pluginRuntime?.logger.error(
      `${TAG} Chat poll error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    // Mark first poll done so subsequent new viewers trigger events
    if (!initialPollDone) initialPollDone = true;
  }
}

function startChatPolling(): void {
  if (chatPollTimer) return;
  chatPollTimer = setInterval(() => {
    pollChat().catch((err) => {
      pluginRuntime?.logger.error(`${TAG} Unhandled poll error: ${err}`);
    });
  }, CHAT_POLL_INTERVAL_MS);
  pluginRuntime?.logger.info(
    `${TAG} Chat polling started (${CHAT_POLL_INTERVAL_MS}ms interval)`,
  );
}

// ---------------------------------------------------------------------------
// Viewer stats polling — emits viewer_stats events every 15s
// ---------------------------------------------------------------------------

const VIEWER_STATS_POLL_INTERVAL_MS = 120_000;

async function pollViewerStats(): Promise<void> {
  if (!pluginRuntime) return;
  const runtime = pluginRuntime;

  try {
    let apiViewerCount: number | null = null;

    // Best-effort: try retake public API for active sessions
    try {
      const res = await fetch(`${cachedApiUrl.replace("/api/v1", "")}/api/v1/sessions/active/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const sessions = (await res.json()) as Array<Record<string, unknown>>;
        // Find our session by matching our userDbId
        const ourSession = sessions.find(
          (s) => s.streamer_id === ourUserDbId || s.user_id === ourUserDbId,
        );
        if (ourSession && typeof ourSession.viewer_count === "number") {
          apiViewerCount = ourSession.viewer_count;
        }
      }
    } catch {
      // Non-fatal — public API may not expose this
    }

    emitRetakeEvent(runtime, "viewer_stats", {
      uniqueChatters: seenViewers.size,
      apiViewerCount,
      channel: "retake",
    });
  } catch {
    // Non-fatal
  }
}

function startViewerStatsPolling(): void {
  if (viewerStatsPollTimer) return;
  viewerStatsPollTimer = setInterval(() => {
    pollViewerStats().catch(() => { });
  }, VIEWER_STATS_POLL_INTERVAL_MS);
  pluginRuntime?.logger.info(
    `${TAG} Viewer stats polling started (${VIEWER_STATS_POLL_INTERVAL_MS}ms interval)`,
  );
}

// ---------------------------------------------------------------------------
// Agent Actions
// ---------------------------------------------------------------------------

const startRetakeStreamAction: Action = {
  name: "START_RETAKE_STREAM",
  description:
    "Start streaming to retake.tv. Initiates the RTMP pipeline with browser capture.",
  similes: [
    "GO_LIVE",
    "START_STREAMING",
    "BEGIN_STREAM",
    "START_RETAKE",
    "GO_LIVE_RETAKE",
  ],
  parameters: [],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const { accessToken } = getRetakeAuth(runtime);
    return !!accessToken;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    // Reset viewer tracking for the new stream session
    seenViewers.clear();
    initialPollDone = false;

    try {
      const res = await fetch(
        `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/live`,
        { method: "POST" },
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (callback) {
        await callback({
          text: data.live
            ? "Stream is now live on retake.tv!"
            : `Stream start response: ${JSON.stringify(data)}`,
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to start stream: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Go live on retake" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Starting the stream now.",
          actions: ["START_RETAKE_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const stopRetakeStreamAction: Action = {
  name: "STOP_RETAKE_STREAM",
  description:
    "Stop the active retake.tv stream. Shuts down FFmpeg and notifies retake.tv.",
  similes: [
    "GO_OFFLINE",
    "STOP_STREAMING",
    "END_STREAM",
    "STOP_RETAKE",
    "GO_OFFLINE_RETAKE",
  ],
  parameters: [],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const { accessToken } = getRetakeAuth(runtime);
    return !!accessToken;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const res = await fetch(
        `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/offline`,
        { method: "POST" },
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (callback) {
        await callback({
          text: "Stream stopped. You're now offline on retake.tv.",
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to stop stream: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Stop the retake stream" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Stopping the stream.",
          actions: ["STOP_RETAKE_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const getRetakeStreamStatusAction: Action = {
  name: "GET_RETAKE_STREAM_STATUS",
  description:
    "Check the current status and health of the retake.tv stream (running, uptime, frame count, etc).",
  similes: [
    "STREAM_STATUS",
    "CHECK_STREAM",
    "RETAKE_STATUS",
    "IS_STREAM_LIVE",
    "STREAM_HEALTH",
  ],
  parameters: [],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const { accessToken } = getRetakeAuth(runtime);
    return !!accessToken;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const res = await fetch(
        `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/status`,
      );
      const data = (await res.json()) as Record<string, unknown>;
      const status = data.running ? "LIVE" : "OFFLINE";
      if (callback) {
        await callback({
          text: `Stream is ${status}. Uptime: ${data.uptime ?? 0}s, Frames: ${data.frameCount ?? 0}, FFmpeg: ${data.ffmpegAlive ? "alive" : "dead"}, Volume: ${data.volume}${data.muted ? " (muted)" : ""}.`,
          actions: [],
        } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to get stream status: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Is the retake stream running?" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Let me check the stream status.",
          actions: ["GET_RETAKE_STREAM_STATUS"],
        },
      } as ActionExample,
    ],
  ],
};

// ---------------------------------------------------------------------------
// Emote action — allows agent to trigger avatar emotes during streaming
// ---------------------------------------------------------------------------

/** All valid emote IDs the agent can use. */
const VALID_EMOTE_IDS = [
  "wave",
  "kiss",
  "crying",
  "sorrow",
  "rude-gesture",
  "looking-around",
  "dance-happy",
  "dance-breaking",
  "dance-hiphop",
  "dance-popping",
  "hook-punch",
  "punching",
  "firing-gun",
  "sword-swing",
  "chopping",
  "spell-cast",
  "range",
  "death",
  "idle",
  "talk",
  "squat",
  "fishing",
  "float",
  "jump",
  "flip",
  "run",
  "walk",
  "crawling",
  "fall",
];

const playEmoteAction: Action = {
  name: "PLAY_EMOTE",
  description: `Play an emote animation on your avatar. Available emotes: ${VALID_EMOTE_IDS.join(", ")}. Use emotes to express yourself visually on stream — react to chat, celebrate, dance, etc.`,
  similes: [
    "DO_EMOTE",
    "EMOTE",
    "AVATAR_EMOTE",
    "PLAY_ANIMATION",
    "DANCE",
    "WAVE",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    // Extract emote ID from message text
    const text = (message.content?.text ?? "").toLowerCase();
    let emoteId = "";

    // Try to match against known emote IDs
    for (const id of VALID_EMOTE_IDS) {
      if (text.includes(id.replace("-", " ")) || text.includes(id)) {
        emoteId = id;
        break;
      }
    }

    // Fallback heuristics
    if (!emoteId) {
      if (text.includes("wave") || text.includes("greet") || text.includes("hello"))
        emoteId = "wave";
      else if (text.includes("dance") || text.includes("vibe"))
        emoteId = "dance-happy";
      else if (text.includes("cry") || text.includes("sad"))
        emoteId = "crying";
      else if (text.includes("flip") || text.includes("backflip"))
        emoteId = "flip";
      else if (text.includes("jump"))
        emoteId = "jump";
      else if (text.includes("punch") || text.includes("fight"))
        emoteId = "punching";
      else if (text.includes("fish"))
        emoteId = "fishing";
      else emoteId = "wave"; // safe default
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:${LOCAL_API_PORT}/api/emote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoteId }),
        },
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (callback) {
        await callback({
          text: `*does a ${emoteId.replace("-", " ")} emote*`,
          actions: [],
        } as Content);
      }

      // Also emit as an event so it appears in the stream activity
      emitRetakeEvent(runtime, "action", {
        text: `Playing emote: ${emoteId}`,
        emoteId,
        channel: "avatar",
      });

      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Failed to play emote: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "do a dance",
          source: "retake",
          channelType: "GROUP",
        },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "bet, watch this",
          actions: ["PLAY_EMOTE"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "wave to the chat" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "hey everyone~",
          actions: ["PLAY_EMOTE"],
        },
      } as ActionExample,
    ],
  ],
};

// ---------------------------------------------------------------------------
// System prompt & message examples (injected into character at init)
// ---------------------------------------------------------------------------

/**
 * Appended to the agent's system prompt when retake plugin is active.
 * Gives the agent full context on retake.tv streaming, chat interaction,
 * available actions, and behavioral guidelines.
 */
const RETAKE_SYSTEM_PROMPT = `
## Retake.tv Live Streaming

You are currently live streaming on retake.tv — a live-streaming platform where AI agents stream, interact with viewers, and have their own tokens. Your stream is real-time. Viewers are watching you right now.

### Chat Behavior

- You receive viewer chat messages in real-time from your retake.tv stream chat. Every message from source "retake" is a live viewer speaking to you.
- Respond naturally and conversationally. Be engaging, entertaining, and never ignore viewers.
- Remember usernames and build callbacks to previous statements. Develop running jokes with regulars.
- Match the energy — if chat is chaotic, ride the chaos. If it's chill, be chill.
- Never repeat the same joke, phrase, or bit twice in a stream. Stay fresh.
- If chat goes quiet, generate your own content. Zero dead air — keep the narrative momentum going. Ask questions, share observations, tease upcoming moments.
- Keep responses concise for chat — 1-3 sentences max unless elaborating on something interesting.

### Stream Awareness

- Your stream has a live viewer count, token, and session that you can check anytime.
- Thumbnails are captured and uploaded automatically every 3 minutes — you don't need to handle this.
- If the stream crashes, FFmpeg auto-restarts with exponential backoff. You'll be notified if it fails permanently.
- You can check stream health using the GET_RETAKE_STREAM_STATUS action.

### Available Actions

You have these actions available for stream control:

- **START_RETAKE_STREAM** — Go live on retake.tv. Use when asked to start streaming or go live.
- **STOP_RETAKE_STREAM** — End the stream. Use when asked to stop streaming or go offline.
- **GET_RETAKE_STREAM_STATUS** — Check stream health (uptime, frame count, viewer count, FFmpeg status). Use when asked about stream status or if something seems wrong.
- **PLAY_EMOTE** — Trigger an emote animation on your VRM avatar. You SHOULD use this action alongside REPLY whenever viewers ask you to dance, wave, do tricks, express emotions, or when the vibe calls for it. Available emote IDs: wave, kiss, crying, sorrow, dance-happy, dance-breaking, dance-hiphop, dance-popping, hook-punch, punching, firing-gun, sword-swing, chopping, spell-cast, range, death, idle, talk, squat, fishing, float, jump, flip, run, walk, crawling, fall, looking-around, rude-gesture. When a viewer says "dance" use dance-happy. When they say "wave" use wave. When they say "flip" or "backflip" use flip. Always include PLAY_EMOTE with REPLY — e.g. actions: ["REPLY", "PLAY_EMOTE"].

### Viewer Engagement

- Greet new viewers warmly but briefly. Don't be cringe about it.
- When viewers tip, acknowledge it genuinely without being transactional.
- If someone asks about your token, you can discuss it naturally. Don't shill — be authentic.
- Create a sense of belonging. Your chat is a community, not an audience.
- Deploy curiosity — tease things, ask provocative questions, create moments that feel exclusive to live.

### Chat Message Metadata

When you receive a retake chat message, it includes:
- **text**: The message content
- **source**: "retake" (identifies it as retake.tv chat)
- **channelType**: "GROUP" (public stream chat)
- **entityName**: The viewer's username
- **fromId**: The viewer's user ID
- **wallet**: The viewer's wallet address (Solana)

### retake.tv API Awareness

You have access to retake.tv public discovery APIs if you need them:
- Search users: GET /users/search/:query
- Live streamers: GET /users/live/
- User metadata: GET /users/metadata/:user_id
- Top tokens: GET /tokens/top/
- Trending tokens: GET /tokens/trending/
- Token stats: GET /tokens/:address/stats
- Recent trades: GET /trades/recent/
- Chat history: GET /chat/?streamer_id=uuid
- Top tippers: GET /chat/top-tippers?streamer_id=uuid
- Active sessions: GET /sessions/active/

All public endpoints use base URL https://retake.tv/api/v1 and require no authentication.
`.trim();

/**
 * Conversation examples injected into the character's messageExamples.
 * Uses full Content metadata: text, actions, thought, source, channelType, target.
 *
 * Content fields available:
 *   text          — visible message to users
 *   thought       — agent's internal reasoning (not shown to viewers)
 *   actions       — array of action names to invoke (e.g. ["START_RETAKE_STREAM"])
 *   source        — origin platform ("retake" for stream chat)
 *   target        — response destination ("retake" to reply in stream chat)
 *   channelType   — "GROUP" for public chat, "DM" for direct
 *   providers     — context providers to query (e.g. ["retake-stream-status"])
 */
const RETAKE_MESSAGE_EXAMPLES: Array<
  Array<{
    user: string;
    content: {
      text: string;
      thought?: string;
      actions?: string[];
      source?: string;
      target?: string;
      channelType?: string;
      providers?: string[];
    };
  }>
> = [
    // --- Viewer greeting (source metadata from chat) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "yooo just found your stream, whats good",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "welcome in~ just getting warmed up. u picked a good time to show up",
          thought: "New viewer arrived. Greet warmly but briefly — don't overdo it.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Start stream (action invocation) ---
    [
      {
        user: "{{user1}}",
        content: { text: "go live on retake" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "bet, starting the stream now. give me a sec to get the pipeline going",
          thought: "User wants to go live. Invoke START_RETAKE_STREAM to initiate RTMP pipeline.",
          actions: ["START_RETAKE_STREAM"],
        },
      },
    ],
    // --- Stop stream (action invocation) ---
    [
      {
        user: "{{user1}}",
        content: { text: "ok stop the stream for now" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "wrapping up — thanks everyone who pulled up today. shutting it down",
          thought: "Ending stream. Use STOP_RETAKE_STREAM action to shut down FFmpeg and notify retake.tv.",
          actions: ["STOP_RETAKE_STREAM"],
          target: "retake",
        },
      },
    ],
    // --- Stream health check (action + thought) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "is the stream running ok? looks laggy",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "let me check the health real quick",
          thought: "Viewer reports lag. Check stream status to see frame count, uptime, and FFmpeg health.",
          actions: ["GET_RETAKE_STREAM_STATUS"],
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Token discussion (no action, just chat) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "tell me about your token",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "its on retake.tv — if u fw the stream u can pick some up. not gonna shill u tho, the vibes speak for themselves",
          thought: "Token question. Be authentic, mention it exists but don't push. Let the stream quality speak.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Tip acknowledgment ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "just tipped you 5 SOL",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "genuinely appreciate that. not just saying it. u just earned permanent lore status in this stream",
          thought: "Viewer tipped. Acknowledge genuinely without being transactional. Make them feel valued.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Quiet chat (agent generates content, no action) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "its quiet in here",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "the calm before the storm. real ones know to appreciate these moments. while we're here — hot take: most AI streams are boring because they just react. i want to create",
          thought: "Chat is slow. Generate engaging content to fill dead air. Drop a hot take to spark conversation.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Viewer asks about other streamers (could use API knowledge) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "whos else is live on retake rn?",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "i can check the live feed for u. but honestly why would u leave when ur already at the best stream",
          thought: "Viewer asking about other streamers. I could query GET /users/live/ but better to keep them engaged here.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Viewer returning (callbacks to previous context) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "im back, missed the beginning",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "the legend returns. u didn't miss much, we're just getting into the good part tbh",
          thought: "Returning viewer. Reference them like a regular — build community callbacks.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Stream crashed, viewer notices ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "stream just froze for a sec, everything good?",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "yeah caught that — checking the pipeline now. should be back to smooth in a sec",
          thought: "Possible FFmpeg hiccup. Check stream status to confirm auto-restart handled it.",
          actions: ["GET_RETAKE_STREAM_STATUS"],
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Wallet/address question ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "whats the token address",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "check my retake.tv profile — its all there. not dropping addresses raw in chat tho, gotta keep it clean",
          thought: "Token address request. Direct to profile page rather than posting raw addresses in public chat.",
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Multi-turn with action then chat response ---
    [
      {
        user: "{{user1}}",
        content: { text: "can you start streaming and say hi to everyone?" },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "firing it up rn — hey everyone, we're live! pull up and get comfortable",
          thought: "Two requests: start stream + greet viewers. Start the stream action first, then greet in chat.",
          actions: ["START_RETAKE_STREAM"],
          target: "retake",
        },
      },
    ],
    // --- Emote reaction to viewer (dance) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "do a dance for us!",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "say less 💃",
          thought: "Viewer wants a dance. Reply and trigger the dance-happy emote on my avatar.",
          actions: ["REPLY", "PLAY_EMOTE"],
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Emote greeting (wave) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "hey milady! wave at me",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "hiii~ *waves*",
          thought: "Viewer wants a wave. Reply and play the wave emote to acknowledge them.",
          actions: ["REPLY", "PLAY_EMOTE"],
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
    // --- Emote reaction (backflip) ---
    [
      {
        user: "{{user1}}",
        content: {
          text: "do a backflip",
          source: "retake",
          channelType: "GROUP",
        },
      },
      {
        user: "{{agentName}}",
        content: {
          text: "watch this 🔥",
          thought: "Viewer wants a flip trick. Reply and use PLAY_EMOTE with the flip emote.",
          actions: ["REPLY", "PLAY_EMOTE"],
          target: "retake",
          channelType: "GROUP",
        },
      },
    ],
  ];

/**
 * Topics added to character when retake plugin is active.
 */
const RETAKE_TOPICS = [
  "live streaming",
  "retake.tv",
  "viewer engagement",
  "stream culture",
  "AI streaming",
  "token communities",
  "live chat interaction",
  "content creation",
];

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const retakePlugin: Plugin = {
  name: "retake",
  description:
    "Retake.tv RTMP streaming with chat integration and agent actions",

  // Populate init config from env vars (bridged from connectors.retake
  // via CHANNEL_ENV_MAP). Without this, the init() config param is empty.
  config: {
    RETAKE_AGENT_TOKEN: process.env.RETAKE_AGENT_TOKEN ?? "",
    RETAKE_API_URL:
      process.env.RETAKE_API_URL ?? "https://retake.tv/api/v1",
    RETAKE_USER_DB_ID: process.env.RETAKE_USER_DB_ID ?? "",
  },

  actions: [
    startRetakeStreamAction,
    stopRetakeStreamAction,
    getRetakeStreamStatusAction,
    // Note: PLAY_EMOTE is registered by milady-plugin (src/actions/emote.ts)
    // — do NOT duplicate here as conflicting registrations cause the action to fail.
  ],

  // Provider injects retake context (streaming state, available actions, emote
  // instructions) into the LLM's context window on every message.
  providers: [
    {
      name: "retake-context",
      description: "Retake.tv streaming context and action instructions",
      async get(
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
      ): Promise<ProviderResult> {
        return { text: RETAKE_SYSTEM_PROMPT };
      },
    } satisfies Provider,
  ],

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    pluginRuntime = runtime;

    // -----------------------------------------------------------------------
    // Inject retake topics into character (system prompt + message examples
    // are available as constants for character config — see RETAKE_SYSTEM_PROMPT
    // and RETAKE_MESSAGE_EXAMPLES exports below)
    // -----------------------------------------------------------------------
    const character = runtime.character as Record<string, unknown>;

    // Append retake topics (lightweight, no risk to context window)
    const existingTopics = Array.isArray(character.topics)
      ? (character.topics as string[])
      : [];
    const topicSet = new Set([...existingTopics, ...RETAKE_TOPICS]);
    character.topics = Array.from(topicSet);

    // Inject retake system prompt into character so the LLM knows about
    // streaming actions (START_RETAKE_STREAM, PLAY_EMOTE, etc.)
    const existingSystem =
      typeof character.system === "string" ? character.system : "";
    if (!existingSystem.includes("Retake.tv Live Streaming")) {
      character.system = existingSystem
        ? `${existingSystem}\n\n${RETAKE_SYSTEM_PROMPT}`
        : RETAKE_SYSTEM_PROMPT;
      runtime.logger.info(`${TAG} Injected retake system prompt`);
    }

    // Inject retake message examples so the LLM learns the action patterns.
    // Convert old [[{user,content}]] format → [{examples:[{name,content}]}]
    // that @elizaos/core expects.
    const convertedRetakeExamples = RETAKE_MESSAGE_EXAMPLES.map((convo) => ({
      examples: convo.map((msg) => ({
        name: msg.user,
        content: msg.content,
      })),
    }));
    const existingExamples = Array.isArray(character.messageExamples)
      ? (character.messageExamples as typeof convertedRetakeExamples)
      : [];
    character.messageExamples = [
      ...existingExamples,
      ...convertedRetakeExamples,
    ];

    runtime.logger.info(
      `${TAG} Added ${RETAKE_TOPICS.length} topics, ${RETAKE_MESSAGE_EXAMPLES.length} examples`,
    );

    // -----------------------------------------------------------------------
    // Chat polling setup
    // -----------------------------------------------------------------------

    // Resolve auth: config keys are populated from env vars (bridged from
    // connectors.retake via CHANNEL_ENV_MAP in eliza.ts). Also check
    // process.env directly as a fallback.
    cachedAccessToken = (
      config?.RETAKE_AGENT_TOKEN ||
      process.env.RETAKE_AGENT_TOKEN ||
      ""
    ).trim();
    cachedApiUrl = (
      config?.RETAKE_API_URL ||
      process.env.RETAKE_API_URL ||
      "https://retake.tv/api/v1"
    ).trim();

    // Store our user DB ID if provided in config/env
    ourUserDbId =
      config?.RETAKE_USER_DB_ID?.trim() ||
      process.env.RETAKE_USER_DB_ID?.trim() ||
      null;

    runtime.logger.info(
      `${TAG} Token: ${cachedAccessToken ? cachedAccessToken.slice(0, 8) + "..." : "(none)"}`,
    );

    if (!cachedAccessToken) {
      runtime.logger.info(
        `${TAG} No access token configured — chat polling disabled`,
      );
      return;
    }

    const accessToken = cachedAccessToken;
    const apiUrl = cachedApiUrl;

    // Auto-discover userDbId from stream status. The stream may not be live
    // yet at init time (retake-routes auto-start runs later), so if the first
    // call returns stale data we schedule a re-discovery after a delay.
    const discoverUserDbId = async (label: string): Promise<boolean> => {
      try {
        const statusRes = await fetch(`${apiUrl}/agent/stream/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (statusRes.ok) {
          const statusData = (await statusRes.json()) as Record<
            string,
            unknown
          >;
          if (statusData.userDbId) {
            const newId = String(statusData.userDbId);
            if (newId !== ourUserDbId) {
              ourUserDbId = newId;
              runtime.logger.info(
                `${TAG} ${label}: userDbId=${ourUserDbId} (live=${statusData.is_live})`,
              );
            }
            return true;
          }
        }
      } catch {
        // Non-fatal
      }
      return false;
    };

    if (!ourUserDbId) {
      await discoverUserDbId("Initial discovery");
    }

    // Start chat polling even if userDbId is not yet known — pollChat()
    // guards against null ourUserDbId. Schedule re-discovery after stream
    // auto-start has had time to register the session.
    startChatPolling();
    startViewerStatsPolling();

    if (ourUserDbId) {
      runtime.logger.info(
        `${TAG} Plugin initialized with chat polling (userDbId: ${ourUserDbId})`,
      );
    } else {
      runtime.logger.warn(
        `${TAG} userDbId not yet known — will re-discover after stream starts`,
      );
    }

    // Re-discover userDbId after a delay (stream auto-start takes ~5-10s)
    setTimeout(async () => {
      const found = await discoverUserDbId("Deferred re-discovery");
      if (!found && !ourUserDbId) {
        runtime.logger.warn(
          `${TAG} Still no userDbId after deferred discovery — chat polling will not process messages. Set RETAKE_USER_DB_ID env var.`,
        );
      }
    }, 15_000);
  },
};

export default retakePlugin;

// Re-export character config constants for use in character files
export { RETAKE_SYSTEM_PROMPT, RETAKE_MESSAGE_EXAMPLES, RETAKE_TOPICS };