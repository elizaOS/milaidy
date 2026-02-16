/**
 * Public entry point for the milady package.
 *
 * Config types are the primary public API surface.
 * @module milady
 */

export * from "./config/types.js";
export type { RestartHandler } from "./runtime/restart.js";
export {
  RESTART_EXIT_CODE,
  requestRestart,
  setRestartHandler,
} from "./runtime/restart.js";
