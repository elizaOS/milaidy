/**
 * Module-level singleton for the active embedding manager.
 *
 * startEliza() publishes the manager here after creation.  The TUI
 * (and any other consumer) can import get/set helpers to inspect or
 * hot-swap the embedding model at runtime without patching the
 * AgentRuntime object.
 */
import type { MiladyEmbeddingManager } from "./embedding-manager.js";
import type { EmbeddingPreset } from "./embedding-presets.js";

export interface EmbeddingState {
  /** The live embedding manager used by the TEXT_EMBEDDING model handler. */
  manager: MiladyEmbeddingManager;
  /** Active preset (may be undefined for fully custom configs). */
  preset?: EmbeddingPreset;
  /** Current embedding dimensions (needed for zero-vector fallback). */
  dimensions: number;
}

let _state: EmbeddingState | null = null;

export function setEmbeddingState(state: EmbeddingState): void {
  _state = state;
}

export function getEmbeddingState(): EmbeddingState | null {
  return _state;
}
