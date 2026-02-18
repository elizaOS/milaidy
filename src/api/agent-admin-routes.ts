import type { AgentRuntime, UUID } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

type AgentStateStatus =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "restarting"
  | "error";

export interface AgentAdminRouteState {
  runtime: AgentRuntime | null;
  config: MiladyConfig;
  agentState: AgentStateStatus;
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  chatConnectionReady: { userId: UUID; roomId: UUID; worldId: UUID } | null;
  chatConnectionPromise: Promise<void> | null;
  pendingRestartReasons: string[];
}

export interface AgentAdminRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentAdminRouteState;
  onRestart?: (() => Promise<AgentRuntime | null>) | undefined;
  resolveStateDir: () => string;
  resolvePath: (value: string) => string;
  getHomeDir: () => string;
  isSafeResetStateDir: (resolvedState: string, homeDir: string) => boolean;
  stateDirExists: (resolvedState: string) => boolean;
  removeStateDir: (resolvedState: string) => void;
  logWarn: (message: string) => void;
}

export async function handleAgentAdminRoutes(
  ctx: AgentAdminRouteContext,
): Promise<boolean> {
  const {
    res,
    method,
    pathname,
    state,
    onRestart,
    json,
    error,
    resolveStateDir,
    resolvePath,
    getHomeDir,
    isSafeResetStateDir,
    stateDirExists,
    removeStateDir,
    logWarn,
  } = ctx;

  // ── POST /api/agent/restart ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/restart") {
    if (!onRestart) {
      error(
        res,
        "Restart is not supported in this mode (no restart handler registered)",
        501,
      );
      return true;
    }

    // Reject if already mid-restart to prevent overlapping restarts.
    if (state.agentState === "restarting") {
      error(res, "A restart is already in progress", 409);
      return true;
    }

    const previousState = state.agentState;
    state.agentState = "restarting";
    try {
      const newRuntime = await onRestart();
      if (newRuntime) {
        state.runtime = newRuntime;
        state.chatConnectionReady = null;
        state.chatConnectionPromise = null;
        state.agentState = "running";
        state.agentName = newRuntime.character.name ?? "Milady";
        state.startedAt = Date.now();
        state.pendingRestartReasons = [];
        json(res, {
          ok: true,
          pendingRestart: false,
          status: {
            state: state.agentState,
            agentName: state.agentName,
            startedAt: state.startedAt,
          },
        });
      } else {
        // Restore previous state instead of permanently stuck in "error"
        state.agentState = previousState;
        error(
          res,
          "Restart handler returned null — runtime failed to re-initialize",
          500,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Restore previous state so the UI can retry
      state.agentState = previousState;
      error(res, `Restart failed: ${message}`, 500);
    }
    return true;
  }

  // ── POST /api/agent/reset ────────────────────────────────────────────
  // Wipe config, workspace (memory), and return to onboarding.
  if (method === "POST" && pathname === "/api/agent/reset") {
    try {
      // 1. Stop the runtime if it's running
      if (state.runtime) {
        try {
          await state.runtime.stop();
        } catch (stopErr) {
          const message =
            stopErr instanceof Error ? stopErr.message : String(stopErr);
          logWarn(
            `[milady-api] Error stopping runtime during reset: ${message}`,
          );
        }
        state.runtime = null;
      }

      // 2. Delete the state directory (~/.milady/) which contains
      //    config, workspace, memory, oauth tokens, etc.
      const stateDir = resolveStateDir();

      // Safety: validate the resolved path before recursive deletion.
      // MILADY_STATE_DIR can be overridden via env/config — if set to
      // "/" or another sensitive path, rmSync would wipe the filesystem.
      const resolvedState = resolvePath(stateDir);
      const home = getHomeDir();
      const isSafe = isSafeResetStateDir(resolvedState, home);
      if (!isSafe) {
        logWarn(
          `[milady-api] Refusing to delete unsafe state dir: "${resolvedState}"`,
        );
        error(
          res,
          `Reset aborted: state directory "${resolvedState}" does not appear safe to delete`,
          400,
        );
        return true;
      }

      if (stateDirExists(resolvedState)) {
        removeStateDir(resolvedState);
      }

      // 3. Reset server state
      state.agentState = "stopped";
      state.agentName = "Milady";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as MiladyConfig;
      state.chatRoomId = null;
      state.chatUserId = null;
      state.chatConnectionReady = null;
      state.chatConnectionPromise = null;
      state.pendingRestartReasons = [];

      json(res, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, `Reset failed: ${message}`, 500);
    }
    return true;
  }

  return false;
}
