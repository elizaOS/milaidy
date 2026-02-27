/**
 * @milady/plugin-youtube -- YouTube RTMP streaming destination plugin.
 *
 * An ElizaOS plugin that provides YouTube streaming capability via RTMP ingest.
 * Exports both the Plugin object (for ElizaOS runtime) and a
 * `createYoutubeDestination()` factory (for the Milady streaming pipeline).
 */

import {
  createStreamingPlugin,
  type StreamingDestination,
} from "@milady/plugin-streaming-base";

export type { StreamingDestination };

// ── Build plugin via shared factory ──────────────────────────────────────────

const { plugin, createDestination } = createStreamingPlugin({
  platformId: "youtube",
  platformName: "YouTube",
  pluginName: "youtube",
  streamKeyEnvVar: "YOUTUBE_STREAM_KEY",
  defaultRtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
  rtmpUrlEnvVar: "YOUTUBE_RTMP_URL",
});

// ── Public exports ──────────────────────────────────────────────────────────

export const youtubePlugin = plugin;

export function createYoutubeDestination(config?: {
  streamKey?: string;
  rtmpUrl?: string;
}): StreamingDestination {
  return createDestination(config);
}

export default youtubePlugin;
