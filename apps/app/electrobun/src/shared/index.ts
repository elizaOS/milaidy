/**
 * Shared module for the Milady Electrobun desktop package.
 *
 * Re-exports everything from the sub-modules so consumers can import from
 * a single path:
 *
 *   import type { AgentStatus, WindowBounds } from "../shared";
 *   import { CHANNEL_TO_RPC_METHOD } from "../shared";
 *
 * No electrobun/bun or electrobun/view imports — safe for both sides of
 * the process boundary.
 */

export * from "./channels";
export * from "./types";
