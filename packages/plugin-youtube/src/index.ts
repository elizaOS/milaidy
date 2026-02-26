/**
 * @milady/plugin-youtube — YouTube RTMP streaming destination plugin.
 *
 * An ElizaOS plugin that provides YouTube streaming capability via RTMP ingest.
 * Exports both the Plugin object (for ElizaOS runtime) and a
 * `createYoutubeDestination()` factory (for the Milady streaming pipeline).
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

const DEFAULT_YOUTUBE_RTMP = "rtmp://a.rtmp.youtube.com/live2";
const LOCAL_API_PORT = Number(
  process.env.SERVER_PORT || process.env.PORT || "2138",
);

// ── Streaming destination factory ───────────────────────────────────────────

export function createYoutubeDestination(config?: {
  streamKey?: string;
  rtmpUrl?: string;
}): StreamingDestination {
  return {
    id: "youtube",
    name: "YouTube",
    async getCredentials() {
      const streamKey = (
        config?.streamKey ??
        process.env.YOUTUBE_STREAM_KEY ??
        ""
      ).trim();
      if (!streamKey) throw new Error("YouTube stream key not configured");
      return {
        rtmpUrl: (
          config?.rtmpUrl ??
          process.env.YOUTUBE_RTMP_URL ??
          DEFAULT_YOUTUBE_RTMP
        ).trim(),
        rtmpKey: streamKey,
      };
    },
    // YouTube detects stream automatically via RTMP ingest — no API calls needed
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

const startYoutubeStreamAction: Action = {
  name: "START_YOUTUBE_STREAM",
  description:
    "Start streaming to YouTube. Initiates the RTMP pipeline with browser capture.",
  similes: [
    "GO_LIVE_YOUTUBE",
    "START_YOUTUBE",
    "BEGIN_YOUTUBE_STREAM",
    "YOUTUBE_GO_LIVE",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.YOUTUBE_STREAM_KEY ?? "").trim();
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
            ? "YouTube stream started successfully! We're live."
            : `Failed to start YouTube stream: ${data.error ?? "unknown error"}`,
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error starting YouTube stream: ${msg}`,
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
        content: { text: "Go live on YouTube" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Starting the YouTube stream now.",
          actions: ["START_YOUTUBE_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const stopYoutubeStreamAction: Action = {
  name: "STOP_YOUTUBE_STREAM",
  description:
    "Stop the active YouTube stream. Shuts down the FFmpeg pipeline.",
  similes: [
    "GO_OFFLINE_YOUTUBE",
    "STOP_YOUTUBE",
    "END_YOUTUBE_STREAM",
    "YOUTUBE_GO_OFFLINE",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.YOUTUBE_STREAM_KEY ?? "").trim();
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
            ? "YouTube stream stopped. We're offline now."
            : `Failed to stop YouTube stream: ${data.error ?? "unknown error"}`,
          actions: [],
        } as Content);
      }
      return { success: !!data.ok };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error stopping YouTube stream: ${msg}`,
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
        content: { text: "Stop the YouTube stream" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Stopping the stream now.",
          actions: ["STOP_YOUTUBE_STREAM"],
        },
      } as ActionExample,
    ],
  ],
};

const getYoutubeStreamStatusAction: Action = {
  name: "GET_YOUTUBE_STREAM_STATUS",
  description:
    "Check the current status of the YouTube stream (running, uptime, frame count, etc).",
  similes: [
    "YOUTUBE_STATUS",
    "YOUTUBE_STREAM_STATUS",
    "IS_YOUTUBE_LIVE",
    "CHECK_YOUTUBE_STREAM",
  ],
  parameters: [],

  validate: async (): Promise<boolean> => {
    const key = (process.env.YOUTUBE_STREAM_KEY ?? "").trim();
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
          text: `YouTube stream status: ${status} | Uptime: ${uptime} | Destination: YouTube`,
          actions: [],
        } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Error checking YouTube stream status: ${msg}`,
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
        content: { text: "Is the YouTube stream live?" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Let me check the stream status.",
          actions: ["GET_YOUTUBE_STREAM_STATUS"],
        },
      } as ActionExample,
    ],
  ],
};

// ── Plugin ──────────────────────────────────────────────────────────────────

export const youtubePlugin: Plugin = {
  name: "youtube",
  description:
    "YouTube RTMP streaming destination with agent stream control actions",

  get config() {
    return {
      YOUTUBE_STREAM_KEY: process.env.YOUTUBE_STREAM_KEY ?? null,
      YOUTUBE_RTMP_URL: process.env.YOUTUBE_RTMP_URL ?? null,
    };
  },

  actions: [
    startYoutubeStreamAction,
    stopYoutubeStreamAction,
    getYoutubeStreamStatusAction,
  ],

  async init(_config: Record<string, string>, _runtime: IAgentRuntime) {
    const streamKey = (
      _config.YOUTUBE_STREAM_KEY ??
      process.env.YOUTUBE_STREAM_KEY ??
      ""
    ).trim();
    if (!streamKey) {
      // Plugin loaded but no stream key — actions will fail validation gracefully
      return;
    }
  },
};

export default youtubePlugin;
