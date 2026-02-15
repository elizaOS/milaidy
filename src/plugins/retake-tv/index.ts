/**
 * retake.tv ElizaOS plugin.
 *
 * Provides the RetakeClient (API), StreamManager (Xvfb + FFmpeg pipeline),
 * and ChatPoller (viewer detection + auto-greeting + conversational chat)
 * as managed resources via the plugin lifecycle.
 */

import type { AgentRuntime, Content, Plugin, UUID } from "@elizaos/core";
import {
  ChannelType,
  createMessageMemory,
  logger,
  stringToUuid,
} from "@elizaos/core";
import { retakeActions } from "./actions.js";
import { ChatPoller } from "./chat-poller.js";
import { RetakeClient } from "./client.js";
import { StreamManager } from "./stream-manager.js";
import type {
  ChatMessage,
  RetakeCredentials,
  RetakePluginOptions,
} from "./types.js";

export { retakeActions } from "./actions.js";
export { ChatPoller } from "./chat-poller.js";
export { RetakeClient } from "./client.js";
export type { StreamManagerState } from "./stream-manager.js";
export { StreamManager } from "./stream-manager.js";
export type {
  RetakeCredentials,
  RetakePluginOptions,
  StreamManagerOptions,
} from "./types.js";

const TAG = "[retake-tv]";
const CREDENTIALS_ENV_KEY = "RETAKE_ACCESS_TOKEN";
const SOURCE = "retake-tv";

const EMOTE_API_PORT =
  process.env.API_PORT || process.env.SERVER_PORT || "2138";

// Module-level singletons so actions can grab them without plumbing.
let _runtime: AgentRuntime | null = null;
let _client: RetakeClient | null = null;
let _stream: StreamManager | null = null;
let _chatPoller: ChatPoller | null = null;
let _credentials: RetakeCredentials | null = null;

/** Get the initialized RetakeClient. Throws if plugin hasn't been initialized. */
export function getRetakeClient(): RetakeClient {
  if (!_client) {
    throw new Error(
      `${TAG} Plugin not initialized. Ensure retake-tv plugin is registered.`,
    );
  }
  return _client;
}

/** Get the StreamManager for controlling the FFmpeg/Xvfb pipeline. */
export function getStreamManager(): StreamManager {
  if (!_stream) {
    throw new Error(
      `${TAG} Plugin not initialized. Ensure retake-tv plugin is registered.`,
    );
  }
  return _stream;
}

/** Get the ChatPoller instance. */
export function getChatPoller(): ChatPoller {
  if (!_chatPoller) {
    throw new Error(
      `${TAG} Plugin not initialized. Ensure retake-tv plugin is registered.`,
    );
  }
  return _chatPoller;
}

/** Get stored credentials (populated after register or from env). */
export function getRetakeCredentials(): RetakeCredentials | null {
  return _credentials;
}

/** Update stored credentials (used after registration). */
export function setRetakeCredentials(creds: RetakeCredentials): void {
  _credentials = creds;
}

// ---------------------------------------------------------------------------
// Emote + greeting helpers
// ---------------------------------------------------------------------------

/**
 * Trigger an emote on the avatar via the local API server.
 * Fire-and-forget — never blocks the caller.
 */
function triggerEmote(emoteId: string): void {
  fetch(`http://localhost:${EMOTE_API_PORT}/api/emote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoteId }),
  }).catch((err) => {
    logger.debug(`${TAG} Emote trigger (${emoteId}) failed: ${String(err)}`);
  });
}

/**
 * Send a greeting chat message for a new viewer.
 * Fire-and-forget — never blocks the caller.
 */
function sendGreetingChat(username: string): void {
  if (!_client || !_credentials?.userDbId) return;

  const greeting = `Welcome to the stream, ${username}!`;
  _client.sendChat(_credentials.userDbId, greeting).catch((err) => {
    logger.debug(`${TAG} Greeting chat failed: ${String(err)}`);
  });
}

// ---------------------------------------------------------------------------
// Runtime chat bridge — feed viewer messages into the agent pipeline
// ---------------------------------------------------------------------------

/**
 * Deterministic UUID for a retake.tv entity (viewer) based on wallet address.
 */
function viewerEntityId(walletAddress: string): UUID {
  return stringToUuid(`retake-viewer-${walletAddress}`) as UUID;
}

/** Deterministic room ID for the retake.tv stream chat. */
function streamRoomId(): UUID {
  const agentId = _credentials?.agent_id ?? "default";
  return stringToUuid(`retake-stream-chat-${agentId}`) as UUID;
}

/** Deterministic world ID for the retake.tv platform. */
function retakeWorldId(): UUID {
  return stringToUuid("retake-tv-world") as UUID;
}

/**
 * Ensure the ElizaOS runtime knows about a retake.tv viewer.
 * Creates entity, room, and world connections as needed.
 */
async function ensureViewerConnection(
  runtime: AgentRuntime,
  viewer: ChatMessage["author"],
): Promise<{ entityId: UUID; roomId: UUID }> {
  const entityId = viewerEntityId(viewer.walletAddress);
  const roomId = streamRoomId();
  const worldId = retakeWorldId();
  const messageServerId = stringToUuid("retake-tv-server") as UUID;

  await runtime.ensureConnection({
    entityId,
    roomId,
    worldId,
    userName: viewer.fusername || viewer.walletAddress.slice(0, 8),
    name: viewer.fusername || `Viewer ${viewer.walletAddress.slice(0, 8)}`,
    source: SOURCE,
    channelId: `retake-stream-${_credentials?.agent_id ?? "default"}`,
    type: ChannelType.GROUP,
    messageServerId,
    metadata: {
      walletAddress: viewer.walletAddress,
      fid: viewer.fid,
      favatar: viewer.favatar,
    },
  });

  return { entityId, roomId };
}

/**
 * Process an incoming retake.tv chat message through the ElizaOS runtime.
 * The agent generates a response and we send it back via retake.tv chat.
 */
async function handleViewerMessage(msg: ChatMessage): Promise<void> {
  if (!_runtime || !_client || !_credentials?.userDbId) return;

  // Skip empty messages
  const text = msg.text?.trim();
  if (!text) return;

  const runtime = _runtime;

  try {
    // 1. Ensure viewer entity + room exist in the runtime
    const { entityId, roomId } = await ensureViewerConnection(
      runtime,
      msg.author,
    );

    // 2. Create a Memory for the incoming message
    const messageId = stringToUuid(`retake-msg-${msg._id}`) as UUID;
    const memory = createMessageMemory({
      id: messageId,
      entityId,
      roomId,
      content: {
        text,
        source: SOURCE,
        channelType: ChannelType.GROUP,
      },
    });

    // 3. Process through the agent pipeline
    if (!runtime.messageService) {
      logger.warn(`${TAG} messageService not available, skipping`);
      return;
    }

    // Play talk animation while thinking
    triggerEmote("talk");

    const destId = _credentials.userDbId;
    const client = _client;

    await runtime.messageService.handleMessage(
      runtime,
      memory,
      async (content: Content) => {
        if (!content.text?.trim()) return [];

        // Send agent's response to retake.tv chat
        try {
          await client.sendChat(destId, content.text.trim());
          logger.debug(
            `${TAG} Replied to ${msg.author.fusername}: ${content.text.trim().slice(0, 80)}`,
          );
        } catch (err) {
          logger.warn(`${TAG} Chat reply failed: ${String(err)}`);
        }

        return [];
      },
    );
  } catch (err) {
    logger.warn(`${TAG} Failed to process viewer message: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function createRetakePlugin(opts?: RetakePluginOptions): Plugin {
  return {
    name: "plugin-retake-tv",
    description:
      "retake.tv streaming platform integration — register, stream via RTMP, interact with chat, manage tokens on Solana.",

    init: async (_config, runtime) => {
      const baseUrl = opts?.baseUrl;
      const timeoutMs = opts?.timeoutMs;

      // Store runtime for chat bridge
      _runtime = runtime as AgentRuntime;

      // Try to get access token from options, env, or agent secrets
      let accessToken = opts?.credentials?.access_token;

      if (!accessToken) {
        accessToken =
          (runtime.getSetting(CREDENTIALS_ENV_KEY) as string | undefined) ??
          process.env[CREDENTIALS_ENV_KEY];
      }

      _client = new RetakeClient({ baseUrl, timeoutMs, accessToken });
      _stream = new StreamManager(opts?.stream);
      _chatPoller = new ChatPoller(opts?.chatPoller);

      if (opts?.credentials) {
        _credentials = opts.credentials;
      }

      // Check streaming dependencies at init (non-blocking)
      const deps = _stream.checkDependencies();
      if (!deps.ok) {
        logger.warn(
          `${TAG} Missing stream dependencies: ${deps.missing.join(", ")}. ` +
            "Streaming will fail until installed (sudo apt install xvfb ffmpeg).",
        );
      }

      if (accessToken) {
        logger.info(`${TAG} Initialized with existing credentials`);
      } else {
        logger.info(
          `${TAG} Initialized without credentials — call register() or set ${CREDENTIALS_ENV_KEY}`,
        );
      }
    },

    actions: retakeActions,

    providers: [
      {
        name: "retake-stream-status",
        description:
          "Current retake.tv stream status — local pipeline and remote API",
        get: async () => {
          if (!_client) {
            return { text: "retake.tv: not connected" };
          }

          const local = _stream?.getState();
          const localStatus = local?.isStreaming
            ? "pipeline: running"
            : "pipeline: stopped";

          try {
            const remote = await _client.getStreamStatus();
            const remoteStatus = remote.is_live
              ? `LIVE (${remote.viewers} viewers, ${Math.floor(remote.uptime_seconds / 60)}m)`
              : "offline";

            return {
              text: `retake.tv: ${remoteStatus} | ${localStatus}`,
              values: { remote, local },
            };
          } catch {
            return {
              text: `retake.tv: API unreachable | ${localStatus}`,
              values: { local },
            };
          }
        },
      },
      {
        name: "retake-emote-catalog",
        description:
          "Available avatar emotes/animations the agent can play during streams",
        get: async () => {
          // Lazy-import to avoid circular deps and keep the catalog optional
          const { EMOTE_CATALOG } = await import("../../emotes/catalog.js");

          const byCategory: Record<string, string[]> = {};
          for (const e of EMOTE_CATALOG) {
            if (!byCategory[e.category]) {
              byCategory[e.category] = [];
            }
            byCategory[e.category].push(e.id);
          }

          const lines = Object.entries(byCategory).map(
            ([cat, ids]) => `${cat}: ${ids.join(", ")}`,
          );

          return {
            text: `Available emotes:\n${lines.join("\n")}`,
            values: {
              emotes: EMOTE_CATALOG.map((e) => ({
                id: e.id,
                name: e.name,
                category: e.category,
              })),
            },
          };
        },
      },
    ],
  };
}

/**
 * Start the chat poller with auto-greeting and conversational chat.
 * Call this after goLive() succeeds and credentials are available.
 *
 * When a new viewer sends their first message:
 *   1. Wave emote plays on the avatar
 *   2. Greeting message sent in chat
 *
 * Every subsequent viewer message is:
 *   1. Fed into the ElizaOS runtime for agent processing
 *   2. Agent's response sent back via retake.tv chat
 *   3. Talk emote plays while the agent is responding
 */
export function startChatPollerWithGreeting(): void {
  if (!_chatPoller || !_client || !_credentials?.userDbId) {
    logger.warn(
      `${TAG} Cannot start chat poller — missing client or credentials`,
    );
    return;
  }

  // Reset so returning viewers from a previous session get re-greeted
  _chatPoller.reset();

  _chatPoller.start(_client, _credentials.userDbId, {
    onNewViewer: (viewer) => {
      const name = viewer.fusername || "anon";
      logger.info(`${TAG} Greeting new viewer: ${name}`);

      // 1. Play wave animation on the avatar
      triggerEmote("wave");

      // 2. Send greeting in stream chat
      sendGreetingChat(name);
    },

    onNewMessage: (msg) => {
      // Process every new chat message through the agent pipeline
      void handleViewerMessage(msg);
    },
  });
}

/** Stop the chat poller. Call on stream shutdown. */
export function stopChatPoller(): void {
  _chatPoller?.stop();
}

export default createRetakePlugin;
