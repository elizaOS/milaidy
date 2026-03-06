/**
 * @milady/plugin-pumpfun -- pump.fun RTMP streaming destination plugin.
 *
 * An elizaOS plugin that provides pump.fun streaming capability via RTMP.
 * pump.fun provides unique RTMP URLs per stream session — users must paste
 * both URL and key from the pump.fun UI into config.
 */

import {
  buildPresetLayout,
  createStreamingPlugin,
  type StreamingDestination,
} from "@milady/plugin-streaming-base";

export type { StreamingDestination };

// ── Build plugin via shared factory ──────────────────────────────────────────

const { plugin, createDestination } = createStreamingPlugin({
  platformId: "pumpfun",
  platformName: "pump.fun",
  streamKeyEnvVar: "PUMPFUN_STREAM_KEY",
  defaultRtmpUrl: "", // User must provide — pump.fun gives unique URL per stream
  rtmpUrlEnvVar: "PUMPFUN_RTMP_URL",
  defaultOverlayLayout: buildPresetLayout("pump.fun", [
    "viewer-count",
    "action-ticker",
    "branding",
  ]),
});

// ── Public exports ──────────────────────────────────────────────────────────

export const pumpfunStreamingPlugin = plugin;

export function createPumpfunDestination(config?: {
  streamKey?: string;
  rtmpUrl?: string;
}): StreamingDestination {
  return createDestination(config);
}

export default pumpfunStreamingPlugin;
