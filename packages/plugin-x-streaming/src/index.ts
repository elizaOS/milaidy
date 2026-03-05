/**
 * @milady/plugin-x-streaming -- X (Twitter) RTMP streaming destination plugin.
 *
 * An elizaOS plugin that provides X/Twitter streaming capability via RTMPS.
 * X provides unique RTMP URLs per stream session from studio.x.com — users
 * must paste both URL and key into config.
 */

import {
  buildPresetLayout,
  createStreamingPlugin,
  type StreamingDestination,
} from "@milady/plugin-streaming-base";

export type { StreamingDestination };

// ── Build plugin via shared factory ──────────────────────────────────────────

const { plugin, createDestination } = createStreamingPlugin({
  platformId: "x",
  platformName: "X (Twitter)",
  streamKeyEnvVar: "X_STREAM_KEY",
  defaultRtmpUrl: "", // User provides from studio.x.com — varies per session
  rtmpUrlEnvVar: "X_RTMP_URL",
  defaultOverlayLayout: buildPresetLayout("X", [
    "thought-bubble",
    "action-ticker",
    "branding",
  ]),
});

// ── Public exports ──────────────────────────────────────────────────────────

export const xStreamingPlugin = plugin;

export function createXStreamDestination(config?: {
  streamKey?: string;
  rtmpUrl?: string;
}): StreamingDestination {
  return createDestination(config);
}

export default xStreamingPlugin;
