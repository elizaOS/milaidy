/**
 * Session I/O helpers — extracted from PTYService for maintainability.
 *
 * Standalone functions for sending input/keys to sessions and stopping
 * sessions. Each function takes a {@link SessionIOContext} that provides
 * the manager instance and shared state maps.
 *
 * @module services/pty-session-io
 */

import type {
  BunCompatiblePTYManager,
  PTYManager,
  SessionMessage,
} from "pty-manager";

/**
 * Shared context required by all session I/O functions.
 * Built inline from PTYService instance fields.
 */
export interface SessionIOContext {
  manager: PTYManager | BunCompatiblePTYManager;
  usingBunWorker: boolean;
  sessionOutputBuffers: Map<string, string[]>;
  taskResponseMarkers: Map<string, number>;
  outputUnsubscribers: Map<string, () => void>;
}

/**
 * Send text input to a session.
 *
 * Marks the buffer position for task response capture, then writes the
 * input via the appropriate manager API.
 */
export async function sendToSession(
  ctx: SessionIOContext,
  sessionId: string,
  input: string,
): Promise<SessionMessage | undefined> {
  const session = ctx.manager.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Mark buffer position for task response capture
  const buffer = ctx.sessionOutputBuffers.get(sessionId);
  if (buffer) {
    ctx.taskResponseMarkers.set(sessionId, buffer.length);
  }

  if (ctx.usingBunWorker) {
    // BunCompatiblePTYManager.send returns void
    await (ctx.manager as BunCompatiblePTYManager).send(sessionId, input);
    return;
  } else {
    // PTYManager.send returns SessionMessage
    return (ctx.manager as PTYManager).send(sessionId, input);
  }
}

/**
 * Send key sequences to a session (for special keys like arrows, enter, etc.).
 */
export async function sendKeysToSession(
  ctx: SessionIOContext,
  sessionId: string,
  keys: string | string[],
): Promise<void> {
  if (ctx.usingBunWorker) {
    await (ctx.manager as BunCompatiblePTYManager).sendKeys(sessionId, keys);
  } else {
    const ptySession = (ctx.manager as PTYManager).getSession(sessionId);
    if (!ptySession) {
      throw new Error(`Session ${sessionId} not found`);
    }
    ptySession.sendKeys(keys);
  }
}

/**
 * Stop a PTY session and clean up all associated state.
 */
export async function stopSession(
  ctx: SessionIOContext,
  sessionId: string,
  sessionMetadata: Map<string, Record<string, unknown>>,
  sessionWorkdirs: Map<string, string>,
  log: (msg: string) => void,
): Promise<void> {
  const session = ctx.manager.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (ctx.usingBunWorker) {
    await (ctx.manager as BunCompatiblePTYManager).kill(sessionId);
  } else {
    await (ctx.manager as PTYManager).stop(sessionId);
  }

  // Clean up output subscriber
  const unsubscribe = ctx.outputUnsubscribers.get(sessionId);
  if (unsubscribe) {
    unsubscribe();
    ctx.outputUnsubscribers.delete(sessionId);
  }

  sessionMetadata.delete(sessionId);
  sessionWorkdirs.delete(sessionId);
  ctx.sessionOutputBuffers.delete(sessionId);
  ctx.taskResponseMarkers.delete(sessionId);
  log(`Stopped session ${sessionId}`);
}

/**
 * Subscribe to live output from a session.
 * Returns an unsubscribe function.
 */
export function subscribeToOutput(
  ctx: SessionIOContext,
  sessionId: string,
  callback: (data: string) => void,
): () => void {
  if (ctx.usingBunWorker) {
    const unsubscribe = (ctx.manager as BunCompatiblePTYManager).onSessionData(
      sessionId,
      callback,
    );
    ctx.outputUnsubscribers.set(sessionId, unsubscribe);
    return unsubscribe;
  }
  const ptySession = (ctx.manager as PTYManager).getSession(sessionId);
  if (!ptySession) {
    throw new Error(`Session ${sessionId} not found`);
  }
  ptySession.on("output", callback);
  const unsubscribe = () => ptySession.off("output", callback);
  ctx.outputUnsubscribers.set(sessionId, unsubscribe);
  return unsubscribe;
}

/**
 * Get buffered or logged output from a session.
 */
export async function getSessionOutput(
  ctx: SessionIOContext,
  sessionId: string,
  lines?: number,
): Promise<string> {
  if (ctx.usingBunWorker) {
    const buffer = ctx.sessionOutputBuffers.get(sessionId);
    if (!buffer) return "";
    const tail = lines ?? buffer.length;
    return buffer.slice(-tail).join("\n");
  }

  const output: string[] = [];
  for await (const line of (ctx.manager as PTYManager).logs(sessionId, {
    tail: lines,
  })) {
    output.push(line);
  }
  return output.join("\n");
}
