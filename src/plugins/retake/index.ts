/**
 * Milady Retake Plugin — retake.tv streaming integration.
 *
 * Manages RTMP streaming to retake.tv via FFmpeg, including browser capture,
 * frame piping, and stream lifecycle (go-live / go-offline).
 *
 * Loaded as `@milady/plugin-retake` via CHANNEL_PLUGIN_MAP when
 * `config.connectors.retake` is present.
 *
 * ## HTTP Routes (registered dynamically)
 *
 * - POST /api/retake/frame  — pipe captured frames to StreamManager
 * - POST /api/retake/live   — start streaming to retake.tv
 * - POST /api/retake/offline — stop stream and notify retake.tv
 */

import type { IAgentRuntime, Plugin } from "@elizaos/core";

export const retakePlugin: Plugin = {
  name: "retake",
  description: "Retake.tv RTMP streaming (browser capture → FFmpeg → RTMP)",

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    runtime.logger.info("[retake] Plugin initialized");
  },
};

export default retakePlugin;
