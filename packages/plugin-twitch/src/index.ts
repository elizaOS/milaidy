/**
 * @milady/plugin-twitch -- Twitch RTMP streaming destination plugin.
 *
 * An ElizaOS plugin that provides Twitch streaming capability via RTMP ingest.
 * Exports both the Plugin object (for ElizaOS runtime) and a
 * `createTwitchDestination()` factory (for the Milady streaming pipeline).
 *
 * For Twitch chat connectivity, use the separate @elizaos/plugin-twitch package.
 * This plugin handles only the streaming/RTMP side.
 */

import {
  buildPresetLayout,
  createStreamingPlugin,
  type StreamingDestination,
} from "@milady/plugin-streaming-base";

export type { StreamingDestination };

// ── Build plugin via shared factory ──────────────────────────────────────────

const { plugin, createDestination } = createStreamingPlugin({
  platformId: "twitch",
  platformName: "Twitch",
  streamKeyEnvVar: "TWITCH_STREAM_KEY",
  defaultRtmpUrl: "rtmp://live.twitch.tv/app",
  defaultOverlayLayout: buildPresetLayout("Twitch", [
    "viewer-count",
    "action-ticker",
    "branding",
  ]),
});

// ── Public exports ──────────────────────────────────────────────────────────

export const twitchStreamingPlugin = plugin;

export function createTwitchDestination(config?: {
  streamKey?: string;
}): StreamingDestination {
  return createDestination(config);
}

export default twitchStreamingPlugin;
