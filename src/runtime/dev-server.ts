// Timing: Track when the script starts
const SCRIPT_START = Date.now();
console.log(`[milady] Script starting...`);

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
/**
 * Combined dev server — starts the ElizaOS runtime in headless mode and
 * wires it into the API server so the Control UI has a live agent to talk to.
 *
 * The MILADY_HEADLESS env var tells startEliza() to skip the interactive
 * CLI chat loop and return the AgentRuntime instance.
 *
 * Usage: bun src/runtime/dev-server.ts   (with MILADY_HEADLESS=1)
 *        (or via the dev script: bun run dev)
 */
import process from "node:process";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { startApiServer } from "../api/server";
import {
  applyDevServerStatePaths,
  resolveDevServerStatePaths,
} from "./dev-server-state";
import { startEliza } from "./eliza";
import { setRestartHandler } from "./restart";

console.log(`[milady] Imports complete (${Date.now() - SCRIPT_START}ms)`);

// Load .env files for parity with CLI mode (which loads via run-main.ts).
try {
  const { config } = await import("dotenv");
  config();
} catch {
  // dotenv not installed or .env not found — non-fatal.
}

console.log(`[milady] dotenv loaded (${Date.now() - SCRIPT_START}ms)`);

const resolvedStatePaths = resolveDevServerStatePaths(
  process.cwd(),
  process.env,
);
applyDevServerStatePaths(resolvedStatePaths, process.env);
for (const note of resolvedStatePaths.notes) {
  logger.warn(`[milady] ${note}`);
}
if (resolvedStatePaths.changed) {
  logger.info(`[milady] Runtime state path: ${resolvedStatePaths.stateDir}`);
  logger.info(`[milady] Runtime config path: ${resolvedStatePaths.configPath}`);
}

const port = Number(process.env.MILADY_PORT) || 31337;

/** The currently active runtime — swapped on restart. */
let currentRuntime: AgentRuntime | null = null;

/** The API server's `updateRuntime` handle (set after startup). */
let apiUpdateRuntime: ((rt: AgentRuntime) => void) | null = null;
/** API server startup diagnostics updater (set after startup). */
let apiUpdateStartup:
  | ((update: {
      phase?: string;
      attempt?: number;
      lastError?: string;
      lastErrorAt?: number;
      nextRetryAt?: number;
      state?:
        | "not_started"
        | "starting"
        | "running"
        | "paused"
        | "stopped"
        | "restarting"
        | "error";
    }) => void)
  | null = null;

/** Guards against concurrent restart attempts (bun --watch + API restart). */
let isRestarting = false;

/** Tracks whether the process is shutting down to prevent restart during exit. */
let isShuttingDown = false;

/** Runtime bootstrap loop state (initial startup + retries). */
let runtimeBootAttempt = 0;
let runtimeBootInProgress = false;
let runtimeBootTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeBootFirstFailureAt: number | null = null;
let runtimeBootDbResetAttempted = false;
let runtimeBootSuspended = false;
let runtimeBootGeneration = 0;
const RUNTIME_BOOT_ERROR_ATTEMPT_THRESHOLD = 2;
const RUNTIME_BOOT_ERROR_DURATION_MS = 45_000;
const RUNTIME_RECOVERABLE_ERROR_ATTEMPT_THRESHOLD = 2;
const RUNTIME_RECOVERABLE_ERROR_DURATION_MS = 30_000;
const RUNTIME_CREATE_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.MILADY_RUNTIME_CREATE_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 45_000;
  return Math.max(10_000, Math.min(5 * 60_000, Math.floor(parsed)));
})();
const RUNTIME_AUTO_DB_RESET = (() => {
  const raw = process.env.MILADY_RUNTIME_AUTO_DB_RESET?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
})();
const RUNTIME_FAIL_FAST_ON_BOOT_ERROR =
  process.env.MILADY_RUNTIME_FAIL_FAST_ON_BOOT_ERROR === "1" ||
  process.env.NODE_ENV === "production";

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function nextRetryDelayMs(attempt: number): number {
  // 1s, 2s, 4s, 8s, 16s, then cap at 30s.
  const raw = 1000 * 2 ** Math.max(0, Math.min(attempt - 1, 5));
  return Math.min(30_000, raw);
}

function isRecoverableRuntimeDbError(err: unknown): boolean {
  const code = extractSqlErrorCode(err);
  if (code) {
    // 3F000: invalid_schema_name, 42P01: undefined_table
    if (code === "3F000" || code === "42P01") return true;
    // 42703: undefined_column, 42804: datatype_mismatch
    if (code === "42703" || code === "42804") return true;
  }

  const msg = formatError(err).toLowerCase();
  if (!msg) return false;

  return (
    msg.includes("from migrations._migrations") ||
    msg.includes('relation "migrations._migrations" does not exist') ||
    msg.includes("create schema if not exists migrations") ||
    msg.includes('from "agents" where "agents"."id" = $1') ||
    msg.includes('relation "agents" does not exist') ||
    msg.includes("[plugin:sql] failed to update agent") ||
    msg.includes('update "agents" set') ||
    msg.includes('from "memories" inner join "embeddings"') ||
    msg.includes('relation "memories" does not exist') ||
    msg.includes('relation "embeddings" does not exist') ||
    msg.includes('column "username" of relation "agents" does not exist') ||
    msg.includes(
      'column "trajectory_id" of relation "trajectories" does not exist',
    )
  );
}

function extractSqlErrorCode(err: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const maybeCode = (current as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) {
      return maybeCode.toUpperCase();
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function resolveRuntimePgliteDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(
    resolvedStatePaths.stateDir,
    "workspace",
    ".eliza",
    ".elizadb",
  );
}

async function wipeRuntimePgliteDataDirsForReset(): Promise<void> {
  const primaryDir = resolveRuntimePgliteDataDir();
  const legacyDir = path.join(
    process.env.HOME ?? "",
    ".milady",
    "workspace",
    ".eliza",
    ".elizadb",
  );
  const dirs = new Set<string>([path.resolve(primaryDir)]);
  if (legacyDir.trim()) {
    dirs.add(path.resolve(legacyDir));
  }

  for (const dir of dirs) {
    const root = path.parse(dir).root;
    if (dir === root) continue;
    try {
      await fs.rm(dir, { recursive: true, force: true });
      logger.warn(`[milady] Reset removed local runtime DB dir: ${dir}`);
    } catch (err) {
      logger.warn(
        `[milady] Failed to remove runtime DB dir during reset (${dir}): ${formatError(err)}`,
      );
    }
  }
}

function clearRuntimeBootTimer(): void {
  if (runtimeBootTimer) {
    clearTimeout(runtimeBootTimer);
    runtimeBootTimer = null;
  }
}

function reclaimRuntimePortsForReset(basePort: number): void {
  const start = Math.max(1, basePort);
  const end = Math.max(start, basePort + 20);
  const selfPid = process.pid;

  for (let p = start; p <= end; p += 1) {
    let raw = "";
    try {
      raw = execSync(`lsof -ti tcp:${p} 2>/dev/null || true`, {
        encoding: "utf8",
      });
    } catch {
      raw = "";
    }
    const pids = raw
      .split(/\s+/)
      .map((v) => Number.parseInt(v, 10))
      .filter((v) => Number.isFinite(v) && v > 0 && v !== selfPid);
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
        logger.warn(
          `[milady] Reset reclaimed stale listener pid=${pid} on :${p}`,
        );
      } catch {
        // Best effort only.
      }
    }
  }
}

function scheduleRuntimeBootstrap(delayMs: number, reason: string): void {
  if (isShuttingDown || runtimeBootSuspended) return;
  const generation = runtimeBootGeneration;
  clearRuntimeBootTimer();
  runtimeBootTimer = setTimeout(
    () => {
      runtimeBootTimer = null;
      void bootstrapRuntime(reason, generation);
    },
    Math.max(0, delayMs),
  );
}

async function waitForRuntimeReady(
  timeoutMs = 20_000,
): Promise<AgentRuntime | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isShuttingDown) return null;
    if (currentRuntime) return currentRuntime;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return currentRuntime;
}

async function createRuntimeWithTimeout(
  context: string,
  isStale: () => boolean,
): Promise<AgentRuntime> {
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const runtimePromise = createRuntime();

  // If a slow bootstrap finally resolves after timeout/staleness, stop it so
  // it doesn't attach an out-of-band runtime and leave API state inconsistent.
  void runtimePromise
    .then(async (rt) => {
      if (!timedOut && !isStale()) return;
      try {
        await rt.stop();
      } catch {
        // Best-effort cleanup of late runtime.
      }
    })
    .catch(() => {
      // Surfaced by the awaited race below.
    });

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          `Runtime initialization timed out after ${Math.round(RUNTIME_CREATE_TIMEOUT_MS / 1000)}s (${context})`,
        ),
      );
    }, RUNTIME_CREATE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([runtimePromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function bootstrapRuntime(
  reason: string,
  generation: number = runtimeBootGeneration,
): Promise<void> {
  if (isShuttingDown || isRestarting || runtimeBootInProgress) return;
  if (runtimeBootSuspended || generation !== runtimeBootGeneration) return;
  runtimeBootInProgress = true;
  const bootstrapStart = Date.now();
  const attempt = runtimeBootAttempt + 1;
  apiUpdateStartup?.({
    phase: "runtime-bootstrap",
    attempt,
    lastError: undefined,
    lastErrorAt: undefined,
    nextRetryAt: undefined,
    state: "starting",
  });

  try {
    logger.info(`[milady] Runtime bootstrap starting (${reason})`);
    const rt = await createRuntimeWithTimeout(
      `bootstrap:${reason}`,
      () =>
        isShuttingDown ||
        runtimeBootSuspended ||
        generation !== runtimeBootGeneration,
    );
    logger.info(`[milady] Runtime created in ${Date.now() - bootstrapStart}ms`);
    const agentName = rt.character.name ?? "Milady";

    if (
      isShuttingDown ||
      runtimeBootSuspended ||
      generation !== runtimeBootGeneration
    ) {
      try {
        await rt.stop();
      } catch {
        // Best effort during shutdown race.
      }
      return;
    }

    currentRuntime = rt;
    if (apiUpdateRuntime) {
      apiUpdateRuntime(rt);
    }
    runtimeBootAttempt = 0;
    runtimeBootFirstFailureAt = null;
    runtimeBootDbResetAttempted = false;
    apiUpdateStartup?.({
      phase: "running",
      attempt: 0,
      lastError: undefined,
      lastErrorAt: undefined,
      nextRetryAt: undefined,
      state: "running",
    });
    logger.info(
      `[milady] Runtime ready — agent: ${agentName} (total: ${Date.now() - bootstrapStart}ms)`,
    );
  } catch (err) {
    if (runtimeBootSuspended || generation !== runtimeBootGeneration) {
      logger.info(
        `[milady] Ignoring stale bootstrap failure after reset/quiesce (${reason})`,
      );
      return;
    }

    const now = Date.now();

    // Self-heal once for known local PGLite bootstrap corruption/migration
    // metadata failures before entering prolonged retry mode.
    if (
      RUNTIME_AUTO_DB_RESET &&
      !runtimeBootDbResetAttempted &&
      isRecoverableRuntimeDbError(err)
    ) {
      try {
        const pgliteDataDir = resolveRuntimePgliteDataDir();
        logger.warn(
          `[milady] Runtime DB startup failed (${formatError(err)}). Wiping local PGLite DB dirs and retrying bootstrap once.`,
        );
        await wipeRuntimePgliteDataDirsForReset();
        process.env.PGLITE_DATA_DIR = pgliteDataDir;
        runtimeBootDbResetAttempted = true;
        scheduleRuntimeBootstrap(500, "pglite-recovery");
        return;
      } catch (resetErr) {
        logger.error(
          `[milady] PGLite recovery reset failed: ${formatError(resetErr)}`,
        );
      }
    } else if (!RUNTIME_AUTO_DB_RESET && isRecoverableRuntimeDbError(err)) {
      logger.warn(
        "[milady] Recoverable runtime DB error detected; auto DB reset is disabled (set MILADY_RUNTIME_AUTO_DB_RESET=1 to enable, unset for default-on behavior).",
      );
    }

    runtimeBootAttempt += 1;
    if (!runtimeBootFirstFailureAt) {
      runtimeBootFirstFailureAt = now;
    }
    const errMessage = formatError(err);
    const isRuntimeInitTimeout = errMessage
      .toLowerCase()
      .includes("runtime initialization timed out");
    const delayMs = nextRetryDelayMs(runtimeBootAttempt);
    const isRecoverableDbError = isRecoverableRuntimeDbError(err);
    const shouldMarkError =
      isRuntimeInitTimeout ||
      (isRecoverableDbError &&
        (runtimeBootAttempt >= RUNTIME_RECOVERABLE_ERROR_ATTEMPT_THRESHOLD ||
          now - runtimeBootFirstFailureAt >=
            RUNTIME_RECOVERABLE_ERROR_DURATION_MS)) ||
      (!isRecoverableDbError &&
        runtimeBootAttempt >= RUNTIME_BOOT_ERROR_ATTEMPT_THRESHOLD) ||
      (!isRecoverableDbError &&
        now - runtimeBootFirstFailureAt >= RUNTIME_BOOT_ERROR_DURATION_MS);
    apiUpdateStartup?.({
      phase: shouldMarkError ? "runtime-error" : "runtime-retry",
      attempt: runtimeBootAttempt,
      lastError: formatError(err),
      lastErrorAt: now,
      nextRetryAt: now + delayMs,
      state: shouldMarkError ? "error" : "starting",
    });
    logger.error(
      `[milady] Runtime bootstrap failed (${errMessage}). Retrying in ${Math.round(delayMs / 1000)}s${shouldMarkError ? " (UI state set to error)" : ""}`,
    );
    if (shouldMarkError && RUNTIME_FAIL_FAST_ON_BOOT_ERROR) {
      runtimeBootSuspended = true;
      logger.error(
        "[milady] Fail-fast enabled: suspending automatic bootstrap retries after runtime-error",
      );
      return;
    }
    scheduleRuntimeBootstrap(delayMs, "retry");
  } finally {
    runtimeBootInProgress = false;
  }
}

async function quiesceRuntimeForReset(reason = "api-reset"): Promise<void> {
  logger.info(`[milady] Quiescing runtime bootstrap state (${reason})`);
  runtimeBootSuspended = true;
  runtimeBootGeneration += 1;
  clearRuntimeBootTimer();
  runtimeBootAttempt = 0;
  runtimeBootFirstFailureAt = null;
  runtimeBootDbResetAttempted = false;

  const waitDeadline = Date.now() + 15_000;
  while (
    runtimeBootInProgress &&
    !isShuttingDown &&
    Date.now() < waitDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping runtime during reset quiesce: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }

  apiUpdateStartup?.({
    phase: "idle",
    attempt: 0,
    lastError: undefined,
    lastErrorAt: undefined,
    nextRetryAt: undefined,
    state: "not_started",
  });

  // Ensure the next bootstrap starts from a clean local DB schema.
  await wipeRuntimePgliteDataDirsForReset();

  // Reset Everything should leave a single clean runtime owner. Reclaim stale
  // listeners on the runtime port range so post-reset onboarding doesn't get
  // trapped by strict-port bind conflicts.
  reclaimRuntimePortsForReset(port);
}

async function quiesceRuntimeForStop(reason = "api-stop"): Promise<void> {
  logger.info(`[milady] Suspending runtime bootstrap state (${reason})`);
  runtimeBootSuspended = true;
  runtimeBootGeneration += 1;
  clearRuntimeBootTimer();
  runtimeBootAttempt = 0;
  runtimeBootFirstFailureAt = null;
  runtimeBootDbResetAttempted = false;

  const waitDeadline = Date.now() + 10_000;
  while (
    runtimeBootInProgress &&
    !isShuttingDown &&
    Date.now() < waitDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping runtime during stop quiesce: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }

  apiUpdateStartup?.({
    phase: "idle",
    attempt: 0,
    lastError: undefined,
    lastErrorAt: undefined,
    nextRetryAt: undefined,
    state: "stopped",
  });
}

/**
 * Create a fresh runtime via startEliza (headless).
 * If a runtime is already running, stop it first.
 */
async function createRuntime(): Promise<AgentRuntime> {
  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping old runtime: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }

  const result = await startEliza({ headless: true });
  if (!result) {
    throw new Error("startEliza returned null — runtime failed to initialize");
  }

  return result as AgentRuntime;
}

/**
 * Restart handler for headless / dev-server mode.
 *
 * Stops the current runtime, creates a new one, and hot-swaps the
 * API server's reference so the UI sees the fresh agent immediately.
 *
 * Protected by a lock so concurrent restart requests (e.g. rapid file
 * saves triggering bun --watch while an API restart is in-flight) don't
 * overlap and corrupt state.
 */
async function handleRestart(reason?: string): Promise<AgentRuntime | null> {
  if (isShuttingDown) {
    logger.warn("[milady] Restart skipped — process is shutting down");
    return currentRuntime;
  }

  runtimeBootSuspended = false;

  if (isRestarting) {
    logger.warn(
      "[milady] Restart already in progress, skipping duplicate request",
    );
    return await waitForRuntimeReady(15_000);
  }

  isRestarting = true;
  try {
    clearRuntimeBootTimer();
    if (runtimeBootInProgress) {
      logger.warn(
        "[milady] Restart requested while runtime bootstrap is in progress; waiting for bootstrap to settle",
      );
      const waitDeadline = Date.now() + 15_000;
      while (
        runtimeBootInProgress &&
        !isShuttingDown &&
        Date.now() < waitDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (runtimeBootInProgress) {
        logger.warn(
          "[milady] Restart wait timed out while bootstrap is still running",
        );
      }
      return await waitForRuntimeReady(5_000);
    }

    logger.info(
      `[milady] Restart requested${reason ? ` (${reason})` : ""} — bouncing runtime…`,
    );
    apiUpdateStartup?.({
      phase: "runtime-restart",
      attempt: 0,
      lastError: undefined,
      lastErrorAt: undefined,
      nextRetryAt: undefined,
      state: "starting",
    });

    try {
      const rt = await createRuntimeWithTimeout(
        `restart:${reason ?? "manual"}`,
        () => isShuttingDown || runtimeBootSuspended,
      );
      const agentName = rt.character.name ?? "Milady";
      logger.info(`[milady] Runtime restarted — agent: ${agentName}`);

      currentRuntime = rt;
      // Hot-swap the API server's runtime reference.
      if (apiUpdateRuntime) {
        apiUpdateRuntime(rt);
      }

      runtimeBootAttempt = 0;
      runtimeBootFirstFailureAt = null;
      apiUpdateStartup?.({
        phase: "running",
        attempt: 0,
        lastError: undefined,
        lastErrorAt: undefined,
        nextRetryAt: undefined,
        state: "running",
      });
      return rt;
    } catch (err) {
      let effectiveError: unknown = err;

      if (RUNTIME_AUTO_DB_RESET && isRecoverableRuntimeDbError(err)) {
        try {
          const pgliteDataDir = resolveRuntimePgliteDataDir();
          logger.warn(
            `[milady] Runtime restart DB init failed (${formatError(err)}). Wiping local PGLite DB dirs and retrying restart once.`,
          );
          await wipeRuntimePgliteDataDirsForReset();
          process.env.PGLITE_DATA_DIR = pgliteDataDir;

          const recoveredRuntime = await createRuntimeWithTimeout(
            `restart-recovery:${reason ?? "manual"}`,
            () => isShuttingDown || runtimeBootSuspended,
          );
          const recoveredAgentName =
            recoveredRuntime.character.name ?? "Milady";
          logger.info(
            `[milady] Runtime restart recovered after PGLite reset — agent: ${recoveredAgentName}`,
          );

          currentRuntime = recoveredRuntime;
          if (apiUpdateRuntime) {
            apiUpdateRuntime(recoveredRuntime);
          }

          runtimeBootAttempt = 0;
          runtimeBootFirstFailureAt = null;
          runtimeBootDbResetAttempted = false;
          apiUpdateStartup?.({
            phase: "running",
            attempt: 0,
            lastError: undefined,
            lastErrorAt: undefined,
            nextRetryAt: undefined,
            state: "running",
          });
          return recoveredRuntime;
        } catch (recoveryErr) {
          effectiveError = recoveryErr;
          logger.error(
            `[milady] Runtime restart recovery failed: ${formatError(recoveryErr)}`,
          );
        }
      } else if (!RUNTIME_AUTO_DB_RESET && isRecoverableRuntimeDbError(err)) {
        logger.warn(
          "[milady] Restart hit recoverable DB error; auto DB reset is disabled (set MILADY_RUNTIME_AUTO_DB_RESET=1 to enable, unset for default-on behavior).",
        );
      }

      const now = Date.now();
      runtimeBootAttempt += 1;
      if (!runtimeBootFirstFailureAt) {
        runtimeBootFirstFailureAt = now;
      }
      const effectiveErrorMessage = formatError(effectiveError);
      const isRuntimeInitTimeout = effectiveErrorMessage
        .toLowerCase()
        .includes("runtime initialization timed out");
      const delayMs = nextRetryDelayMs(runtimeBootAttempt);
      const isRecoverableDbError = isRecoverableRuntimeDbError(effectiveError);
      const shouldMarkError =
        isRuntimeInitTimeout ||
        (isRecoverableDbError &&
          (runtimeBootAttempt >= RUNTIME_RECOVERABLE_ERROR_ATTEMPT_THRESHOLD ||
            now - runtimeBootFirstFailureAt >=
              RUNTIME_RECOVERABLE_ERROR_DURATION_MS)) ||
        (!isRecoverableDbError &&
          runtimeBootAttempt >= RUNTIME_BOOT_ERROR_ATTEMPT_THRESHOLD) ||
        (!isRecoverableDbError &&
          now - runtimeBootFirstFailureAt >= RUNTIME_BOOT_ERROR_DURATION_MS);
      apiUpdateStartup?.({
        phase: shouldMarkError ? "runtime-error" : "runtime-retry",
        attempt: runtimeBootAttempt,
        lastError: formatError(effectiveError),
        lastErrorAt: now,
        nextRetryAt: now + delayMs,
        state: shouldMarkError ? "error" : "starting",
      });
      logger.error(
        `[milady] Runtime restart failed (${effectiveErrorMessage}). Retrying in ${Math.round(delayMs / 1000)}s${shouldMarkError ? " (UI state set to error)" : ""}`,
      );
      if (shouldMarkError && RUNTIME_FAIL_FAST_ON_BOOT_ERROR) {
        runtimeBootSuspended = true;
        logger.error(
          "[milady] Fail-fast enabled: suspending automatic restart retries after runtime-error",
        );
        return await waitForRuntimeReady(2_000);
      }
      scheduleRuntimeBootstrap(delayMs, "restart-retry");
      return await waitForRuntimeReady(2_000);
    }
  } finally {
    isRestarting = false;
  }

  return currentRuntime;
}

/**
 * Graceful shutdown for the dev-server process.
 *
 * Since we told startEliza to run in headless mode (which now skips
 * registering its own SIGINT/SIGTERM handlers), we own the shutdown
 * lifecycle here.
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearRuntimeBootTimer();

  logger.info("[milady] Dev server shutting down…");
  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping runtime during shutdown: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

async function main() {
  const startupStart = Date.now();

  // Register the in-process restart handler so the RESTART_AGENT action
  // (and the POST /api/agent/restart endpoint) work without killing the
  // process.
  setRestartHandler(async (reason) => {
    await handleRestart(reason);
  });

  // 1. Start the API server first (no runtime yet) so the UI can connect
  //    immediately while the heavier agent runtime boots in the background.
  const apiStart = Date.now();
  const {
    port: actualPort,
    updateRuntime,
    updateStartup,
  } = await startApiServer({
    port,
    initialAgentState: "starting",
    onRestart: async () => {
      const restarted = await handleRestart("api");
      if (restarted) return restarted;
      return await waitForRuntimeReady(20_000);
    },
    onReset: async () => {
      await quiesceRuntimeForReset("api");
    },
    onStop: async () => {
      await quiesceRuntimeForStop("api");
    },
  });
  apiUpdateRuntime = updateRuntime;
  apiUpdateStartup = updateStartup;
  apiUpdateStartup({
    phase: "api-ready",
    attempt: 0,
    lastError: undefined,
    lastErrorAt: undefined,
    nextRetryAt: undefined,
    state: "starting",
  });
  const apiReady = Date.now();
  // Use console.log for startup timing to bypass logger filtering
  console.log(
    `[milady] API server ready on port ${actualPort} (${apiReady - apiStart}ms)`,
  );

  // 2. Boot the ElizaOS agent runtime without blocking server readiness.
  scheduleRuntimeBootstrap(0, "startup");

  console.log(
    `[milady] Startup init complete in ${Date.now() - startupStart}ms, agent bootstrapping...`,
  );
}

main().catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("[milady] Fatal error:", error.stack ?? error.message);
  if (error.cause) {
    const cause =
      error.cause instanceof Error
        ? error.cause
        : new Error(String(error.cause));
    console.error("[milady] Caused by:", cause.stack ?? cause.message);
  }
  process.exit(1);
});
