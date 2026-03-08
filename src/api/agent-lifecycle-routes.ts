import type { AgentRuntime } from "@elizaos/core";
import { detectRuntimeModel } from "./agent-model";
import { ensureAutonomySvc, getAutonomySvc } from "./autonomy-routes";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

type AgentStateStatus =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "restarting"
  | "error";

export interface AgentLifecycleRouteState {
  runtime: AgentRuntime | null;
  agentState: AgentStateStatus;
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
}

export interface AgentLifecycleRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentLifecycleRouteState;
  onRestart?: (() => Promise<AgentRuntime | null>) | undefined;
  onStop?: (() => Promise<void> | void) | undefined;
}

const RUNTIME_ATTACH_WAIT_MS = 2_500;
const START_RESTART_TIMEOUT_MS = 20_000;

function respondStartingStatus(
  json: RouteHelpers["json"],
  res: Parameters<RouteHelpers["json"]>[0],
  state: AgentLifecycleRouteState,
): void {
  json(res, {
    ok: true,
    status: {
      state: "starting",
      agentName: state.agentName,
      model: state.model,
      uptime: undefined,
      startedAt: state.startedAt,
    },
  });
}

async function waitForRuntimeFromState(
  state: AgentLifecycleRouteState,
  timeoutMs: number,
): Promise<AgentRuntime | null> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    if (state.runtime) return state.runtime;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return state.runtime;
}

type RestartAttemptResult = {
  runtime: AgentRuntime | null;
  timedOut: boolean;
};

async function waitForRestartWithTimeout(
  onRestart: () => Promise<AgentRuntime | null>,
  timeoutMs: number,
): Promise<RestartAttemptResult> {
  const timeoutSentinel = Symbol("restart-timeout");
  const result = await Promise.race<AgentRuntime | null | typeof timeoutSentinel>(
    [
      onRestart(),
      new Promise<typeof timeoutSentinel>((resolve) =>
        setTimeout(() => resolve(timeoutSentinel), Math.max(0, timeoutMs)),
      ),
    ],
  );
  if (result === timeoutSentinel) {
    return { runtime: null, timedOut: true };
  }
  return { runtime: result, timedOut: false };
}

function applyStartFailureState(
  state: AgentLifecycleRouteState,
  fallbackState: AgentStateStatus = "error",
): void {
  state.agentState = fallbackState;
  state.startedAt = undefined;
  state.model = undefined;
}

function applyRuntimeRunningState(
  state: AgentLifecycleRouteState,
  runtime: AgentRuntime,
): void {
  state.runtime = runtime;
  state.agentName = runtime.character?.name ?? state.agentName;
  state.agentState = "running";
  state.startedAt = Date.now();
  state.model = detectRuntimeModel(runtime);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  return await Promise.race<T>([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), Math.max(0, timeoutMs)),
    ),
  ]);
}

async function tryEnableAutonomy(runtime: AgentRuntime | null): Promise<void> {
  if (!runtime) return;
  const existingSvc = getAutonomySvc(runtime);
  if (existingSvc) {
    await withTimeout(
      existingSvc.enableAutonomy().catch(() => undefined),
      1_500,
      undefined,
    );
    return;
  }

  // Runtime startup should not block on AUTONOMY service discovery.
  void (async () => {
    const svc = await withTimeout(ensureAutonomySvc(runtime), 1_500, null);
    if (!svc) return;
    await withTimeout(
      svc.enableAutonomy().catch(() => undefined),
      1_500,
      undefined,
    );
  })().catch(() => undefined);
}

async function tryDisableAutonomy(runtime: AgentRuntime | null): Promise<void> {
  const svc = getAutonomySvc(runtime);
  if (!svc) return;
  await withTimeout(
    svc.disableAutonomy().catch(() => undefined),
    1_500,
    undefined,
  );
}

export async function handleAgentLifecycleRoutes(
  ctx: AgentLifecycleRouteContext,
): Promise<boolean> {
  const { res, method, pathname, state, onRestart, onStop, json, error } = ctx;

  // ── POST /api/agent/start ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/start") {
    if (!state.runtime) {
      const runtimeBooting =
        state.agentState === "starting" || state.agentState === "restarting";
      if (runtimeBooting) {
        respondStartingStatus(json, res, state);
        return true;
      }

      if (!state.runtime) {
        if (!onRestart) {
          if (runtimeBooting) {
            respondStartingStatus(json, res, state);
            return true;
          }
          state.agentState = "not_started";
          state.startedAt = undefined;
          state.model = undefined;
          error(res, "Agent is not running", 503);
          return true;
        }

        state.agentState = "starting";
        if (!state.startedAt) {
          state.startedAt = Date.now();
        }
        respondStartingStatus(json, res, state);

        // Keep /api/agent/start responsive: kickoff restart in background and
        // let callers poll status instead of blocking on a full runtime boot.
        // Schedule on the next tick so sync work inside onRestart() cannot
        // delay the HTTP response.
        setTimeout(() => {
          void (async () => {
            try {
              const restartAttempt = await waitForRestartWithTimeout(
                onRestart,
                START_RESTART_TIMEOUT_MS,
              );
              let restartedRuntime = restartAttempt.runtime;

              if (!restartAttempt.timedOut && !restartedRuntime) {
                applyStartFailureState(state);
                return;
              }

              if (!restartedRuntime) {
                restartedRuntime = await waitForRuntimeFromState(
                  state,
                  START_RESTART_TIMEOUT_MS,
                );
              }
              if (!restartedRuntime) {
                applyStartFailureState(state);
                return;
              }
              applyRuntimeRunningState(state, restartedRuntime);
              await tryEnableAutonomy(restartedRuntime);
            } catch {
              applyStartFailureState(state);
            }
          })();
        }, 0);
        return true;
      }
    }
    applyRuntimeRunningState(state, state.runtime);

    // Enable the autonomy task — the core TaskService will pick it up
    // and fire the first tick immediately (updatedAt starts at 0).
    await tryEnableAutonomy(state.runtime);

    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: 0,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  // ── POST /api/agent/stop ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/stop") {
    if (onStop) {
      try {
        await onStop();
      } catch {
        // Host stop hook is best-effort.
      }
    }

    await tryDisableAutonomy(state.runtime);
    if (state.runtime) {
      try {
        await state.runtime.stop();
      } catch {
        // Stop should be best-effort; state still transitions to stopped.
      }
      state.runtime = null;
    }

    state.agentState = "stopped";
    state.startedAt = undefined;
    state.model = undefined;
    json(res, {
      ok: true,
      status: { state: state.agentState, agentName: state.agentName },
    });
    return true;
  }

  // ── POST /api/agent/pause ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/pause") {
    if (!state.runtime) {
      state.agentState = "not_started";
      state.startedAt = undefined;
      state.model = undefined;
      error(res, "Agent is not running", 503);
      return true;
    }

    await tryDisableAutonomy(state.runtime);

    state.agentState = "paused";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  // ── POST /api/agent/resume ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/resume") {
    if (!state.runtime) {
      state.agentState = "not_started";
      state.startedAt = undefined;
      state.model = undefined;
      error(res, "Agent is not running", 503);
      return true;
    }

    // Re-enable the autonomy task — first tick fires immediately
    // because the new task is created with updatedAt: 0.
    await tryEnableAutonomy(state.runtime);

    state.agentState = "running";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  return false;
}
