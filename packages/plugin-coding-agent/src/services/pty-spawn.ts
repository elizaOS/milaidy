/**
 * PTY session spawning logic — extracted from PTYService for maintainability.
 *
 * Contains the deferred task delivery, retry logic, per-agent settle delays,
 * and session buffer setup that runs during spawnSession().
 *
 * @module services/pty-spawn
 */

import type { AdapterType, BaseCodingAdapter } from "coding-agent-adapters";
import type {
  BunCompatiblePTYManager,
  PTYManager,
  SessionHandle,
  SpawnConfig,
  WorkerSessionHandle,
} from "pty-manager";
import type {
  PTYServiceConfig,
  SessionInfo,
  SpawnSessionOptions,
} from "./pty-types.js";

export interface SpawnContext {
  manager: PTYManager | BunCompatiblePTYManager;
  usingBunWorker: boolean;
  serviceConfig: PTYServiceConfig;
  sessionMetadata: Map<string, Record<string, unknown>>;
  sessionWorkdirs: Map<string, string>;
  sessionOutputBuffers: Map<string, string[]>;
  outputUnsubscribers: Map<string, () => void>;
  taskResponseMarkers: Map<string, number>;
  getAdapter: (agentType: AdapterType) => BaseCodingAdapter;
  sendToSession: (sessionId: string, input: string) => Promise<unknown>;
  sendKeysToSession: (
    sessionId: string,
    keys: string | string[],
  ) => Promise<void>;
  pushDefaultRules: (sessionId: string, agentType: string) => Promise<void>;
  toSessionInfo: (
    session: SessionHandle | WorkerSessionHandle,
    workdir?: string,
  ) => SessionInfo;
  log: (msg: string) => void;
}

/**
 * Set up session output buffering for Bun worker path.
 */
export function setupOutputBuffer(ctx: SpawnContext, sessionId: string): void {
  const buffer: string[] = [];
  ctx.sessionOutputBuffers.set(sessionId, buffer);
  const unsubscribe = (ctx.manager as BunCompatiblePTYManager).onSessionData(
    sessionId,
    (data: string) => {
      const lines = data.split("\n");
      buffer.push(...lines);
      while (buffer.length > (ctx.serviceConfig.maxLogLines ?? 1000)) {
        buffer.shift();
      }
    },
  );
  ctx.outputUnsubscribers.set(sessionId, unsubscribe);
}

/**
 * Set up deferred task delivery with retry logic.
 * IMPORTANT: Must be called BEFORE pushDefaultRules (which has a 1500ms sleep),
 * otherwise session_ready fires during pushDefaultRules and the listener misses it.
 */
export function setupDeferredTaskDelivery(
  ctx: SpawnContext,
  session: SessionHandle | WorkerSessionHandle,
  task: string,
  agentType: string,
): void {
  const sid = session.id;
  // Per-agent post-ready delay. Claude Code has a heavy TUI that
  // renders update notices, shortcuts, and /ide hints in bursts after
  // the initial ready pattern — 300ms isn't enough to clear them all.
  const POST_READY_DELAY: Record<string, number> = {
    claude: 800,
    gemini: 300,
    codex: 300,
    aider: 200,
  };
  const settleMs = POST_READY_DELAY[agentType] ?? 300;

  const VERIFY_DELAY_MS = 5000; // how long to wait before checking acceptance
  const MAX_RETRIES = 2;
  const MIN_NEW_LINES = 15; // agent working produces significant output

  const sendTaskWithRetry = (attempt: number) => {
    const buffer = ctx.sessionOutputBuffers.get(sid);
    const baselineLength = buffer?.length ?? 0;

    ctx.log(
      `Session ${sid} — sending task (attempt ${attempt + 1}, ${settleMs}ms settle, baseline ${baselineLength} lines)`,
    );

    ctx
      .sendToSession(sid, task)
      .catch((err) =>
        ctx.log(`Failed to send deferred task to ${sid}: ${err}`),
      );

    // After a delay, verify the agent actually started working.
    // If the buffer barely grew, the TUI likely swallowed the input.
    if (attempt < MAX_RETRIES) {
      setTimeout(() => {
        const currentLength = buffer?.length ?? 0;
        const newLines = currentLength - baselineLength;
        if (newLines < MIN_NEW_LINES) {
          ctx.log(
            `Session ${sid} — task may not have been accepted (only ${newLines} new lines after ${VERIFY_DELAY_MS}ms). Retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})`,
          );
          sendTaskWithRetry(attempt + 1);
        } else {
          ctx.log(
            `Session ${sid} — task accepted (${newLines} new lines after ${VERIFY_DELAY_MS}ms)`,
          );
        }
      }, VERIFY_DELAY_MS);
    }
  };

  let taskSent = false;
  const sendTask = () => {
    if (taskSent) return;
    taskSent = true;
    // Delay to let TUI finish rendering after ready detection.
    // Without this, Claude Code's TUI can swallow the Enter key
    // if it arrives during a render cycle.
    setTimeout(() => sendTaskWithRetry(0), settleMs);
    if (ctx.usingBunWorker) {
      (ctx.manager as BunCompatiblePTYManager).removeListener(
        "session_ready",
        onReady,
      );
    } else {
      (ctx.manager as PTYManager).removeListener("session_ready", onReady);
    }
  };
  const onReady = (readySession: WorkerSessionHandle | SessionHandle) => {
    if (readySession.id !== sid) return;
    sendTask();
  };

  if (session.status === "ready") {
    sendTask();
  } else {
    if (ctx.usingBunWorker) {
      (ctx.manager as BunCompatiblePTYManager).on("session_ready", onReady);
    } else {
      (ctx.manager as PTYManager).on("session_ready", onReady);
    }
  }
}

/**
 * Build the SpawnConfig and env vars from SpawnSessionOptions.
 */
export function buildSpawnConfig(
  sessionId: string,
  options: SpawnSessionOptions,
  workdir: string,
): SpawnConfig & { id: string } {
  // Map model preferences to adapter-specific env vars
  const modelPrefs = options.metadata?.modelPrefs as
    | { powerful?: string; fast?: string }
    | undefined;
  let modelEnv: Record<string, string> | undefined;
  if (modelPrefs?.powerful) {
    const envKeyMap: Record<string, string> = {
      claude: "ANTHROPIC_MODEL",
      gemini: "GEMINI_MODEL",
      codex: "OPENAI_MODEL",
      aider: "AIDER_MODEL",
    };
    const key = envKeyMap[options.agentType];
    if (key) modelEnv = { [key]: modelPrefs.powerful };
  }

  return {
    id: sessionId,
    name: options.name,
    type: options.agentType,
    workdir,
    env: { ...options.env, ...modelEnv },
    ...(options.skipAdapterAutoResponse
      ? { skipAdapterAutoResponse: true }
      : {}),
    adapterConfig: {
      ...(options.credentials as Record<string, unknown> | undefined),
      ...(options.customCredentials
        ? { custom: options.customCredentials }
        : {}),
      interactive: true,
      approvalPreset: options.approvalPreset,
      // Forward adapter-relevant metadata (e.g. provider preference for Aider)
      ...(options.metadata?.provider
        ? { provider: options.metadata.provider }
        : {}),
      ...(options.metadata?.modelTier
        ? { modelTier: options.metadata.modelTier }
        : {}),
    },
  };
}
