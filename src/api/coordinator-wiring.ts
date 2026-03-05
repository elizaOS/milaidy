import type { AgentRuntime } from "@elizaos/core";

/**
 * Minimal subset of ServerState needed for coordinator bridge wiring.
 * Avoids importing the full ServerState interface (which is private to server.ts).
 */
export interface WirableState {
  runtime: AgentRuntime | null;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
}

export interface WireCoordinatorOpts<S extends WirableState = WirableState> {
  /** Wire the chat bridge. Returns true on success. */
  wireChatBridge: (state: S) => boolean;
  /** Wire the WebSocket bridge. Returns true on success. */
  wireWsBridge: (state: S) => boolean;
  /** Wire the event-routing bridge. Returns true on success. */
  wireEventRouting: (state: S) => boolean;
  /** Label for log messages (e.g. "boot", "restart"). */
  context: string;
  /** Logger with warn/debug methods. */
  logger: { warn: (msg: string) => void; debug?: (msg: string) => void };
}

export interface WireResult {
  chat: boolean;
  ws: boolean;
  eventRouting: boolean;
}

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 5;
const SERVICE_TIMEOUT_MS = 60_000;

/**
 * Wire coordinator bridges using event-driven service loading.
 *
 * 1. Attempts immediate wiring (coordinator may already be available).
 * 2. If any bridge fails and runtime has getServiceLoadPromise, waits for
 *    SWARM_COORDINATOR to load (with timeout).
 * 3. After service promise resolves, retries failed bridges up to MAX_RETRIES.
 * 4. On timeout or exhaustion, broadcasts a system-warning WS event.
 *
 * Safe for fire-and-forget (`void wireCoordinatorBridgesWhenReady(...)`).
 */
export async function wireCoordinatorBridgesWhenReady<S extends WirableState>(
  state: S,
  opts: WireCoordinatorOpts<S>,
): Promise<WireResult> {
  const { wireChatBridge, wireWsBridge, wireEventRouting, context, logger } =
    opts;
  const result: WireResult = { chat: false, ws: false, eventRouting: false };

  try {
    // 1. Immediate attempt
    result.chat = wireChatBridge(state);
    result.ws = wireWsBridge(state);
    result.eventRouting = wireEventRouting(state);

    if (result.chat && result.ws && result.eventRouting) {
      logger.debug?.(
        `[milady-api] Coordinator bridges wired immediately (${context})`,
      );
      return result;
    }

    // 2. Wait for SWARM_COORDINATOR service to load
    const runtime = state.runtime;
    if (
      !runtime ||
      !("getServiceLoadPromise" in runtime) ||
      typeof runtime.getServiceLoadPromise !== "function"
    ) {
      broadcastWarning(
        state,
        result,
        context,
        "no runtime or getServiceLoadPromise",
      );
      logger.warn(
        `[milady-api] Coordinator wiring incomplete (${context}): runtime unavailable for service-load wait`,
      );
      return result;
    }

    const servicePromise = runtime.getServiceLoadPromise("SWARM_COORDINATOR");
    const timeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), SERVICE_TIMEOUT_MS);
    });

    const race = await Promise.race([
      servicePromise.then(() => "loaded" as const),
      timeout,
    ]);

    if (race === "timeout") {
      broadcastWarning(state, result, context, "service load timed out");
      logger.warn(
        `[milady-api] SWARM_COORDINATOR did not load within ${SERVICE_TIMEOUT_MS / 1000}s (${context})`,
      );
      return result;
    }

    // 3. Service loaded — retry failed bridges
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (!result.chat) result.chat = wireChatBridge(state);
      if (!result.ws) result.ws = wireWsBridge(state);
      if (!result.eventRouting) result.eventRouting = wireEventRouting(state);

      if (result.chat && result.ws && result.eventRouting) {
        logger.debug?.(
          `[milady-api] Coordinator bridges wired after service load (${context}, attempt ${attempt + 1})`,
        );
        return result;
      }

      // Brief delay before next retry
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    // 4. Exhausted retries after service load
    broadcastWarning(
      state,
      result,
      context,
      "retries exhausted after service load",
    );
    logger.warn(
      `[milady-api] Coordinator wiring incomplete after ${MAX_RETRIES} retries (${context})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[milady-api] Coordinator wiring error (${context}): ${message}`,
    );
  }

  return result;
}

function broadcastWarning(
  state: WirableState,
  result: WireResult,
  context: string,
  reason: string,
): void {
  const missing = [
    !result.chat && "chat",
    !result.ws && "ws",
    !result.eventRouting && "event-routing",
  ]
    .filter(Boolean)
    .join(", ");

  state.broadcastWs?.({
    type: "system-warning",
    message: `Coordinator wiring incomplete (${context}): ${reason}. Missing bridges: ${missing}`,
    ts: Date.now(),
  });
}
