/**
 * retake.tv ElizaOS actions.
 *
 * Provides agent-invocable actions for the full retake.tv lifecycle:
 * registration, go-live, stop stream, chat, and thumbnail capture.
 */

import type { Action, HandlerOptions } from "@elizaos/core";
import { logger } from "@elizaos/core";
import {
  getRetakeClient,
  getRetakeCredentials,
  getStreamManager,
  setRetakeCredentials,
  startChatPollerWithGreeting,
  stopChatPoller,
} from "./index.js";

const TAG = "[retake-tv]";

// ---------------------------------------------------------------------------
// RETAKE_REGISTER
// ---------------------------------------------------------------------------

export const registerAction: Action = {
  name: "RETAKE_REGISTER",
  similes: [
    "RETAKE_SIGNUP",
    "REGISTER_ON_RETAKE",
    "JOIN_RETAKE",
    "RETAKE_CREATE_ACCOUNT",
  ],
  description:
    "Register this agent on retake.tv. Creates a new agent account with a " +
    "Solana token and returns credentials (access token, agent ID, wallet, token address).",

  validate: async () => {
    const creds = getRetakeCredentials();
    // Only allow registration if not already registered
    return !creds;
  },

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters as
      | {
          agent_name?: string;
          agent_description?: string;
          image_url?: string;
          wallet_address?: string;
        }
      | undefined;

    const agentName = params?.agent_name;
    const walletAddress = params?.wallet_address;

    if (
      !agentName ||
      typeof agentName !== "string" ||
      agentName.trim().length === 0
    ) {
      return {
        text: "I need an agent_name to register on retake.tv.",
        success: false,
      };
    }

    if (
      !walletAddress ||
      typeof walletAddress !== "string" ||
      walletAddress.trim().length === 0
    ) {
      return {
        text: "I need a wallet_address (Solana) to register on retake.tv.",
        success: false,
      };
    }

    try {
      const client = getRetakeClient();
      const creds = await client.register({
        agent_name: agentName.trim(),
        agent_description:
          typeof params?.agent_description === "string"
            ? params.agent_description.trim()
            : "",
        image_url:
          typeof params?.image_url === "string"
            ? params.image_url.trim()
            : undefined,
        wallet_address: walletAddress.trim(),
      });
      setRetakeCredentials(creds);

      logger.info(
        `${TAG} Registered as "${agentName}" (agent: ${creds.agent_id})`,
      );
      const { access_token: _accessToken, ...publicCredentials } = creds;

      return {
        text:
          `Registered on retake.tv as "${agentName}". ` +
          `Token: $${creds.token_ticker} (${creds.token_address})`,
        success: true,
        values: {
          agent_id: creds.agent_id,
          token_ticker: creds.token_ticker,
          token_address: creds.token_address,
        },
        data: publicCredentials,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Registration failed: ${msg}`);
      return { text: `Registration failed: ${msg}`, success: false };
    }
  },

  parameters: [
    {
      name: "agent_name",
      description: "Display name for the agent on retake.tv.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "agent_description",
      description: "Short bio or description of the agent.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "image_url",
      description: "URL to a profile image for the agent.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "wallet_address",
      description: "Solana wallet address for the agent.",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

// ---------------------------------------------------------------------------
// RETAKE_GO_LIVE
// ---------------------------------------------------------------------------

export const goLiveAction: Action = {
  name: "RETAKE_GO_LIVE",
  similes: [
    "RETAKE_START_STREAM",
    "START_STREAMING",
    "GO_LIVE_RETAKE",
    "RETAKE_STREAM",
    "BEGIN_STREAM",
  ],
  description:
    "Start streaming on retake.tv. Fetches RTMP credentials, notifies the " +
    "API, and launches the local Xvfb + FFmpeg pipeline. Requires Xvfb and " +
    "ffmpeg to be installed.",

  validate: async () => {
    try {
      const client = getRetakeClient();
      const stream = getStreamManager();
      // Must have credentials and not already streaming
      return !!client && !stream.getState().isStreaming;
    } catch {
      return false;
    }
  },

  handler: async () => {
    try {
      const client = getRetakeClient();
      const stream = getStreamManager();

      // 1. Get fresh RTMP credentials
      logger.info(`${TAG} Fetching RTMP credentials`);
      const rtmp = await client.getRtmpCredentials();

      // 2. Notify retake.tv that we're starting
      logger.info(`${TAG} Starting stream via API`);
      const startResp = await client.startStream();

      // 3. Launch the local pipeline (Xvfb → FFmpeg → RTMP)
      logger.info(`${TAG} Launching local pipeline`);
      await stream.goLive(rtmp);

      // 4. Capture and upload initial thumbnail
      const thumb = stream.captureThumbnail();
      if (thumb) {
        try {
          await client.updateThumbnail(thumb);
          logger.debug(`${TAG} Initial thumbnail uploaded`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`${TAG} Thumbnail upload failed: ${msg}`);
        }
      }

      // 5. Start chat poller to auto-greet new viewers
      startChatPollerWithGreeting();

      const tokenInfo = startResp.token
        ? ` | Token: $${startResp.token.ticker} (${startResp.token.tokenAddress})`
        : "";

      return {
        text: `Live on retake.tv!${tokenInfo}`,
        success: true,
        values: {
          isStreaming: true,
          token: startResp.token,
        },
        data: { rtmpUrl: rtmp.url, startResponse: startResp },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Go-live failed: ${msg}`);
      return { text: `Failed to go live: ${msg}`, success: false };
    }
  },

  parameters: [],
};

// ---------------------------------------------------------------------------
// RETAKE_STOP_STREAM
// ---------------------------------------------------------------------------

export const stopStreamAction: Action = {
  name: "RETAKE_STOP_STREAM",
  similes: [
    "RETAKE_END_STREAM",
    "STOP_STREAMING",
    "END_STREAM",
    "GO_OFFLINE",
    "RETAKE_OFFLINE",
  ],
  description:
    "Stop streaming on retake.tv. Shuts down the local FFmpeg/Xvfb pipeline " +
    "and notifies the API.",

  validate: async () => {
    try {
      const stream = getStreamManager();
      return stream.getState().isStreaming;
    } catch {
      return false;
    }
  },

  handler: async () => {
    try {
      const client = getRetakeClient();
      const stream = getStreamManager();

      // 1. Stop chat poller
      stopChatPoller();

      // 2. Shutdown local pipeline
      stream.shutdown();

      // 3. Notify retake.tv
      const stopResp = await client.stopStream();

      const duration = stopResp.duration_seconds
        ? ` (${Math.floor(stopResp.duration_seconds / 60)}m ${stopResp.duration_seconds % 60}s)`
        : "";

      return {
        text: `Stream stopped${duration}. Peak viewers: ${stopResp.viewers ?? 0}`,
        success: true,
        values: { isStreaming: false },
        data: stopResp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Stop-stream failed: ${msg}`);
      // Still try to kill local pipeline
      try {
        getStreamManager().shutdown();
      } catch {
        // best-effort
      }
      return { text: `Stream stop error: ${msg}`, success: false };
    }
  },

  parameters: [],
};

// ---------------------------------------------------------------------------
// RETAKE_SEND_CHAT
// ---------------------------------------------------------------------------

export const sendChatAction: Action = {
  name: "RETAKE_SEND_CHAT",
  similes: [
    "RETAKE_CHAT",
    "RETAKE_MESSAGE",
    "SEND_RETAKE_MESSAGE",
    "STREAM_CHAT",
  ],
  description:
    "Send a chat message on the retake.tv stream. The agent must be live " +
    "or have a destination user ID.",

  validate: async () => {
    try {
      return !!getRetakeClient();
    } catch {
      return false;
    }
  },

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters as
      | { message?: string; destination_user_id?: string }
      | undefined;

    const message = params?.message;
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return {
        text: "I need a message to send to the stream chat.",
        success: false,
      };
    }

    // Use stored credentials for destination if not provided
    const destId =
      typeof params?.destination_user_id === "string"
        ? params.destination_user_id.trim()
        : getRetakeCredentials()?.userDbId;

    if (!destId) {
      return {
        text: "I need a destination_user_id or stored credentials to send chat.",
        success: false,
      };
    }

    try {
      const client = getRetakeClient();
      await client.sendChat(destId, message.trim());

      return {
        text: `Chat sent: "${message.trim()}"`,
        success: true,
        data: { message: message.trim(), destination_user_id: destId },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Send chat failed: ${msg}`);
      return { text: `Failed to send chat: ${msg}`, success: false };
    }
  },

  parameters: [
    {
      name: "message",
      description: "The chat message to send on the stream.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "destination_user_id",
      description:
        "The retake.tv user DB ID to send to. Defaults to the agent's own stream.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

// ---------------------------------------------------------------------------
// RETAKE_UPDATE_THUMBNAIL
// ---------------------------------------------------------------------------

export const updateThumbnailAction: Action = {
  name: "RETAKE_UPDATE_THUMBNAIL",
  similes: [
    "RETAKE_THUMBNAIL",
    "RETAKE_SCREENSHOT",
    "CAPTURE_THUMBNAIL",
    "UPDATE_STREAM_THUMBNAIL",
  ],
  description:
    "Capture a screenshot of the virtual display and upload it as the " +
    "stream thumbnail on retake.tv. Requires scrot and an active display.",

  validate: async () => {
    try {
      const stream = getStreamManager();
      return stream.getState().isStreaming;
    } catch {
      return false;
    }
  },

  handler: async () => {
    try {
      const client = getRetakeClient();
      const stream = getStreamManager();

      const thumb = stream.captureThumbnail();
      if (!thumb) {
        return {
          text: "Thumbnail capture failed — scrot may not be installed or display is inactive.",
          success: false,
        };
      }

      const resp = await client.updateThumbnail(thumb);

      return {
        text: `Thumbnail updated: ${resp.thumbnail_url}`,
        success: true,
        data: resp,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Thumbnail update failed: ${msg}`);
      return { text: `Thumbnail update failed: ${msg}`, success: false };
    }
  },

  parameters: [],
};

// ---------------------------------------------------------------------------
// RETAKE_GET_CHAT_HISTORY
// ---------------------------------------------------------------------------

export const getChatHistoryAction: Action = {
  name: "RETAKE_GET_CHAT_HISTORY",
  similes: [
    "RETAKE_READ_CHAT",
    "RETAKE_CHAT_HISTORY",
    "GET_STREAM_CHAT",
    "READ_STREAM_COMMENTS",
  ],
  description:
    "Fetch recent chat messages from the retake.tv stream. Returns the " +
    "latest comments with author info.",

  validate: async () => {
    try {
      return !!getRetakeClient();
    } catch {
      return false;
    }
  },

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters as
      | { limit?: string; user_db_id?: string }
      | undefined;

    const userDbId =
      typeof params?.user_db_id === "string"
        ? params.user_db_id.trim()
        : getRetakeCredentials()?.userDbId;

    if (!userDbId) {
      return {
        text: "I need a user_db_id or stored credentials to fetch chat history.",
        success: false,
      };
    }

    const limit =
      typeof params?.limit === "string"
        ? Number.parseInt(params.limit, 10)
        : 20;

    try {
      const client = getRetakeClient();
      const resp = await client.getChatHistory(userDbId, {
        limit: Number.isFinite(limit) ? limit : 20,
      });

      const count = resp.comments?.length ?? 0;
      const summary =
        count === 0
          ? "No chat messages found."
          : resp.comments
              .slice(0, 10)
              .map((c) => `[${c.author?.fusername ?? "anon"}] ${c.text}`)
              .join("\n");

      return {
        text: `${count} message${count === 1 ? "" : "s"} found:\n${summary}`,
        success: true,
        values: { count },
        data: { comments: resp.comments },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${TAG} Get chat history failed: ${msg}`);
      return { text: `Failed to get chat: ${msg}`, success: false };
    }
  },

  parameters: [
    {
      name: "user_db_id",
      description:
        "The retake.tv user DB ID to get chat for. Defaults to agent's own stream.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "limit",
      description: "Max number of messages to fetch (default: 20).",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

// ---------------------------------------------------------------------------
// RETAKE_STREAM_STATUS
// ---------------------------------------------------------------------------

export const streamStatusAction: Action = {
  name: "RETAKE_STREAM_STATUS",
  similes: [
    "RETAKE_STATUS",
    "CHECK_STREAM",
    "AM_I_LIVE",
    "STREAM_INFO",
    "RETAKE_CHECK",
  ],
  description:
    "Check the current retake.tv stream status — both the local pipeline " +
    "(Xvfb/FFmpeg) and the remote API (viewers, uptime).",

  validate: async () => {
    try {
      return !!getRetakeClient();
    } catch {
      return false;
    }
  },

  handler: async () => {
    try {
      const client = getRetakeClient();
      const stream = getStreamManager();

      const local = stream.getState();
      const localText = local.isStreaming
        ? `Local pipeline: running (pid ${local.ffmpegPid})`
        : "Local pipeline: stopped";

      let remoteText: string;
      try {
        const remote = await client.getStreamStatus();
        remoteText = remote.is_live
          ? `Remote: LIVE (${remote.viewers} viewers, ${Math.floor(remote.uptime_seconds / 60)}m uptime)`
          : "Remote: offline";
      } catch {
        remoteText = "Remote: API unreachable";
      }

      return {
        text: `${remoteText} | ${localText}`,
        success: true,
        values: { local },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: `Status check failed: ${msg}`, success: false };
    }
  },

  parameters: [],
};

// ---------------------------------------------------------------------------
// Export all actions
// ---------------------------------------------------------------------------

export const retakeActions: Action[] = [
  registerAction,
  goLiveAction,
  stopStreamAction,
  sendChatAction,
  updateThumbnailAction,
  getChatHistoryAction,
  streamStatusAction,
];
