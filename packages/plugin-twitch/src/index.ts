/**
 * @milady/plugin-twitch — Twitch RTMP streaming destination plugin.
 *
 * An ElizaOS plugin that provides Twitch streaming capability via RTMP ingest.
 * Exports both the Plugin object (for ElizaOS runtime) and a
 * `createTwitchDestination()` factory (for the Milady streaming pipeline).
 *
 * For Twitch chat connectivity, use the separate @elizaos/plugin-twitch package.
 * This plugin handles only the streaming/RTMP side.
 */

import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";

// ── StreamingDestination contract (mirrors stream-routes.ts) ────────────────

export interface StreamingDestination {
  id: string;
  name: string;
  getCredentials(): Promise<{ rtmpUrl: string; rtmpKey: string }>;
  onStreamStart?(): Promise<void>;
  onStreamStop?(): Promise<void>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TWITCH_RTMP_URL = "rtmp://live.twitch.tv/app";
const LOCAL_API_PORT = Number(
  process.env.SERVER_PORT || process.env.PORT || "2138",
);

// ── Streaming destination factory ───────────────────────────────────────────

export function createTwitchDestination(config?: {
  streamKey?: string;
}): StreamingDestination {
  return {
    id: "twitch",
    name: "Twitch",
    async getCredentials() {
      const streamKey = (
        config?.streamKey ??
        process.env.TWITCH_STREAM_KEY ??
        ""
      ).trim();
      if (!streamKey) throw new Error("Twitch stream key not configured");
      return {
        rtmpUrl: TWITCH_RTMP_URL,
        rtmpKey: streamKey,
      };
    },
    // Twitch detects stream automatically via RTMP ingest — no API calls needed
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

const startTwitchStreamAction: Action = {
  name: "START_TWITCH_STREAM",
  description:
    "Start streaming to Twitch. Initiates the RTMP pipeline with browser capture.",
  similes: [
    "GO_LIVE_TWITCH",
    "START_TWITCH",
    "BEGIN_TWITCH_STREAM",
    "TWITCH_GO_LIVE",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.TWITCH_STREAM_KEY ?? "").trim();
    return !!key;
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
        `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/live`,
        { method: "POST" },
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (callback) {
        await callback({
          text: data.ok
            ? "Twitch stream started successfully! We're live."
            : `Failed to start Twitch stream: ${data.error ?? "unknown error"}`,
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error starting Twitch stream: ${msg}`,
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
        content: { text: "Go live on Twitch" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Starting the Twitch stream now.",
          actions: ["START_TWITCH_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const stopTwitchStreamAction: Action = {
  name: "STOP_TWITCH_STREAM",
  description:
    "Stop the active Twitch stream. Shuts down the FFmpeg pipeline.",
  similes: [
    "GO_OFFLINE_TWITCH",
    "STOP_TWITCH",
    "END_TWITCH_STREAM",
    "TWITCH_GO_OFFLINE",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.TWITCH_STREAM_KEY ?? "").trim();
    return !!key;
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
          text: data.ok
            ? "Twitch stream stopped. We're offline now."
            : `Failed to stop Twitch stream: ${data.error ?? "unknown error"}`,
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error stopping Twitch stream: ${msg}`,
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
        content: { text: "Stop the Twitch stream" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Stopping the stream now.",
          actions: ["STOP_TWITCH_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const getTwitchStreamStatusAction: Action = {
  name: "GET_TWITCH_STREAM_STATUS",
  description:
    "Check the current status of the Twitch stream (running, uptime, frame count, etc).",
  similes: [
    "TWITCH_STATUS",
    "TWITCH_STREAM_STATUS",
    "IS_TWITCH_LIVE",
    "CHECK_TWITCH_STREAM",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.TWITCH_STREAM_KEY ?? "").trim();
    return !!key;
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
      const uptime = data.uptimeSeconds
        ? `${Math.floor(Number(data.uptimeSeconds) / 60)}m`
        : "n/a";
      if (callback) {
        await callback({
          text: `Twitch stream status: ${status} | Uptime: ${uptime} | Destination: Twitch`,
          actions: [],
        } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error checking Twitch stream status: ${msg}`,
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
        content: { text: "Is the Twitch stream live?" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Let me check the stream status.",
          actions: ["GET_TWITCH_STREAM_STATUS"],
        },
      } as ActionExample,
    ],
  ],
};

// ── Plugin ──────────────────────────────────────────────────────────────────

export const twitchStreamingPlugin: Plugin = {
  name: "twitch-streaming",
  description:
    "Twitch RTMP streaming destination with agent stream control actions",

  get config() {
    return {
      TWITCH_STREAM_KEY: process.env.TWITCH_STREAM_KEY ?? null,
    };
  },

  actions: [
    startTwitchStreamAction,
    stopTwitchStreamAction,
    getTwitchStreamStatusAction,
  ],

  async init(_config: Record<string, string>, _runtime: IAgentRuntime) {
    const streamKey = (
      _config.TWITCH_STREAM_KEY ??
      process.env.TWITCH_STREAM_KEY ??
      ""
    ).trim();
    if (!streamKey) {
      // Plugin loaded but no stream key — actions will fail validation gracefully
      return;
    }
  },
};

export default twitchStreamingPlugin;
