/**
 * Milady Retake.tv Plugin — chat polling + streaming integration.
 *
 * Re-exports from @milady/plugin-retake so tsdown bundles it into
 * milady-dist/plugins/retake/index.js for the Electron runtime.
 */
export {
  retakePlugin as default,
  retakePlugin,
  createRetakeDestination,
} from "@milady/plugin-retake";
export type { RetakeChatComment, StreamingDestination } from "@milady/plugin-retake";
