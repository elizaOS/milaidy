import path from "node:path";
import type { AgentRuntime, UUID } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import { detectRuntimeModel } from "./agent-model";
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
  startup?: {
    phase: string;
    attempt: number;
    lastError?: string;
    lastErrorAt?: number;
    nextRetryAt?: number;
  };
}

export interface AgentAdminRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentAdminRouteState;
  onRestart?: (() => Promise<AgentRuntime | null>) | undefined;
  onReset?: (() => Promise<void> | void) | undefined;
  resolveStateDir: () => string;
  resolvePath: (value: string) => string;
  resolveConfigPath: () => string;
  getHomeDir: () => string;
  isSafeResetStateDir: (resolvedState: string, homeDir: string) => boolean;
  stateDirExists: (resolvedState: string) => boolean;
  removeStateDir: (resolvedState: string) => void;
  configFileExists: (resolvedConfigPath: string) => boolean;
  removeConfigFile: (resolvedConfigPath: string) => void;
  logWarn: (message: string) => void;
}

const RESET_ENV_KEYS = [
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_ENABLED",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY",
  "TOGETHER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AIGATEWAY_API_KEY",
  "ZAI_API_KEY",
  "MILAIDY_USE_PI_AI",
  "OLLAMA_API_ENDPOINT",
  "OLLAMA_BASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL",
  "PGLITE_DATA_DIR",
] as const;

function clearManagedRuntimeEnv(config: MiladyConfig): void {
  for (const key of RESET_ENV_KEYS) {
    delete process.env[key];
  }

  const envCfg = config.env as Record<string, unknown> | undefined | null;
  if (!envCfg || typeof envCfg !== "object") return;

  for (const [key, value] of Object.entries(envCfg)) {
    if (key === "shellEnv" || key === "vars") continue;
    if (typeof value === "string") {
      delete process.env[key];
    }
  }

  const vars = envCfg.vars;
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) return;
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string") {
      delete process.env[key];
    }
  }
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
    onReset,
    json,
    error,
    resolveStateDir,
    resolvePath,
    resolveConfigPath,
    getHomeDir,
    isSafeResetStateDir,
    stateDirExists,
    removeStateDir,
    configFileExists,
    removeConfigFile,
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
        state.model = detectRuntimeModel(newRuntime);
        state.startedAt = Date.now();
        state.pendingRestartReasons = [];
        json(res, {
          ok: true,
          pendingRestart: false,
          status: {
            state: state.agentState,
            agentName: state.agentName,
            model: state.model,
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
      const configBeforeReset = state.config;
      const resetWarnings: string[] = [];

      // Let host runtimes quiesce bootstrap/retry loops before we wipe local
      // state. This prevents reset/start races where a stale boot task reattaches.
      if (onReset) {
        try {
          await onReset();
        } catch (resetHookErr) {
          const message =
            resetHookErr instanceof Error
              ? resetHookErr.message
              : String(resetHookErr);
          logWarn(`[milady-api] Reset hook failed: ${message}`);
        }
      }

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
        resetWarnings.push(
          `State directory "${resolvedState}" was not deleted (safety guard).`,
        );
      }

      if (isSafe && stateDirExists(resolvedState)) {
        removeStateDir(resolvedState);
      }

      // 2a. Always remove config file(s) explicitly so reset returns to
      // onboarding even when state-dir deletion is blocked.
      const configCandidates = new Set<string>([
        resolvePath(resolveConfigPath()),
        resolvePath(path.join(resolvedState, "milady.json")),
      ]);
      for (const configPath of configCandidates) {
        const configBase = path.basename(configPath).toLowerCase();
        const parentSafe = isSafeResetStateDir(path.dirname(configPath), home);
        if (configBase !== "milady.json" || !parentSafe) {
          continue;
        }
        if (configFileExists(configPath)) {
          removeConfigFile(configPath);
        }
      }

      // 2b. Clear runtime-managed env vars so onboarding starts from a
      // clean process state instead of leaking prior provider credentials.
      clearManagedRuntimeEnv(configBeforeReset);

      // 3. Reset server state
      state.agentState = "not_started";
      state.agentName = "Milady";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as MiladyConfig;
      state.chatRoomId = null;
      state.chatUserId = null;
      state.chatConnectionReady = null;
      state.chatConnectionPromise = null;
      state.pendingRestartReasons = [];
      if (state.startup) {
        state.startup.phase = "idle";
        state.startup.attempt = 0;
        state.startup.lastError = undefined;
        state.startup.lastErrorAt = undefined;
        state.startup.nextRetryAt = undefined;
      }

      json(res, {
        ok: true,
        warnings: resetWarnings,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(res, `Reset failed: ${message}`, 500);
    }
    return true;
  }

  return false;
}
