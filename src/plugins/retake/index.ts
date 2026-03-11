/**
 * Milady Retake.tv Plugin — chat polling + streaming integration.
 *
 * Re-exports from @elizaos/plugin-retake so tsdown bundles it into
 * milady-dist/plugins/retake/index.js for the Electron runtime.
 */

export type {
  RetakeChatComment,
  StreamingDestination,
} from "@elizaos/plugin-retake";
export {
  createRetakeDestination,
  retakePlugin as default,
  retakePlugin,
} from "@elizaos/plugin-retake";
