/**
 * Signal API routes: pair, status, stop, disconnect.
 *
 * Mirrors whatsapp-routes.ts for the Signal connector.
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  sanitizeAccountId,
  type SignalPairingEvent,
  SignalPairingSession,
  signalAuthExists,
  signalLogout,
} from "../services/signal-pairing";
import { readJsonBody as parseJsonBody, sendJson } from "./http-helpers";

// ---------------------------------------------------------------------------
// State interface (subset of ServerState relevant to Signal routes)
// ---------------------------------------------------------------------------

export interface SignalRouteState {
  signalPairingSessions: Map<string, SignalPairingSession>;
  broadcastWs?: (data: Record<string, unknown>) => void;
  config: {
    connectors?: Record<string, unknown>;
  };
  runtime?: {
    getService(type: string): unknown | null;
  };
  saveConfig: () => void;
  workspaceDir: string;
}

const MAX_BODY_BYTES = 1_048_576;
export const MAX_PAIRING_SESSIONS = 10;

async function readJsonBody<T = Record<string, unknown>>(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<T | null> {
  return parseJsonBody(req, res, { maxBytes: MAX_BODY_BYTES });
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** Returns `true` if handled, `false` to fall through. */
export async function handleSignalRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: SignalRouteState,
): Promise<boolean> {
  if (!pathname.startsWith("/api/signal")) return false;

  // ── POST /api/signal/pair ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/signal/pair") {
    const body = await readJsonBody<{ accountId?: string }>(req, res);
    let accountId: string;
    try {
      accountId = sanitizeAccountId(
        body && typeof body.accountId === "string" && body.accountId.trim()
          ? body.accountId.trim()
          : "default",
      );
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
      return true;
    }

    const isReplacing = state.signalPairingSessions.has(accountId);
    if (
      !isReplacing &&
      state.signalPairingSessions.size >= MAX_PAIRING_SESSIONS
    ) {
      json(
        res,
        {
          error: `Too many concurrent pairing sessions (max ${MAX_PAIRING_SESSIONS})`,
        },
        429,
      );
      return true;
    }

    const authDir = path.join(state.workspaceDir, "signal-auth", accountId);

    // Stop any existing session for this account
    state.signalPairingSessions?.get(accountId)?.stop();

    const session = new SignalPairingSession({
      authDir,
      accountId,
      onEvent: (event: SignalPairingEvent) => {
        state.broadcastWs?.(event as unknown as Record<string, unknown>);

        if (event.status === "connected") {
          if (!state.config.connectors) state.config.connectors = {};
          state.config.connectors.signal = {
            ...((state.config.connectors.signal as
              | Record<string, unknown>
              | undefined) ?? {}),
            authDir,
            enabled: true,
          };
          try {
            state.saveConfig();
          } catch {
            /* test envs */
          }
        }
      },
    });

    state.signalPairingSessions.set(accountId, session);

    try {
      await session.start();
      json(res, { ok: true, accountId, status: session.getStatus() });
    } catch (err) {
      json(
        res,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
    return true;
  }

  // ── GET /api/signal/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/signal/status") {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    let accountId: string;
    try {
      accountId = sanitizeAccountId(
        url.searchParams.get("accountId") || "default",
      );
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
      return true;
    }

    const session = state.signalPairingSessions?.get(accountId);

    let serviceConnected = false;
    if (state.runtime) {
      try {
        const sigService = state.runtime.getService("signal") as Record<
          string,
          unknown
        > | null;
        if (sigService) {
          serviceConnected = Boolean(sigService.connected);
        }
      } catch {
        /* service not yet registered */
      }
    }

    json(res, {
      accountId,
      status: session?.getStatus() ?? "idle",
      authExists: signalAuthExists(state.workspaceDir, accountId),
      serviceConnected,
    });
    return true;
  }

  // ── POST /api/signal/pair/stop ──────────────────────────────────────
  if (method === "POST" && pathname === "/api/signal/pair/stop") {
    const body = await readJsonBody<{ accountId?: string }>(req, res);
    let accountId: string;
    try {
      accountId = sanitizeAccountId(
        body && typeof body.accountId === "string" && body.accountId.trim()
          ? body.accountId.trim()
          : "default",
      );
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
      return true;
    }

    const session = state.signalPairingSessions?.get(accountId);
    if (session) {
      session.stop();
      state.signalPairingSessions?.delete(accountId);
    }

    json(res, { ok: true, accountId, status: "idle" });
    return true;
  }

  // ── POST /api/signal/disconnect ─────────────────────────────────────
  if (method === "POST" && pathname === "/api/signal/disconnect") {
    const body = await readJsonBody<{ accountId?: string }>(req, res);
    let accountId: string;
    try {
      accountId = sanitizeAccountId(
        body && typeof body.accountId === "string" && body.accountId.trim()
          ? body.accountId.trim()
          : "default",
      );
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
      return true;
    }

    // Stop any active pairing session
    const session = state.signalPairingSessions?.get(accountId);
    if (session) {
      session.stop();
      state.signalPairingSessions?.delete(accountId);
    }

    // Delete auth files
    try {
      signalLogout(state.workspaceDir, accountId);
    } catch (err) {
      console.warn(
        `[signal] Logout failed for ${accountId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // Remove connector config
    if (state.config.connectors) {
      delete state.config.connectors.signal;
      try {
        state.saveConfig();
      } catch {
        /* test envs */
      }
    }

    json(res, { ok: true, accountId });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Plugin UI helper
// ---------------------------------------------------------------------------

/**
 * When Signal is connected via device linking (auth data on disk), mark the
 * plugin entry as configured so the UI doesn't show misleading warnings.
 */
export function applySignalQrOverride(
  plugins: {
    id: string;
    validationErrors: unknown[];
    configured: boolean;
    qrConnected?: boolean;
  }[],
  workspaceDir: string,
): void {
  try {
    if (signalAuthExists(workspaceDir, "default")) {
      const sigPlugin = plugins.find((p) => p.id === "signal");
      if (sigPlugin) {
        sigPlugin.validationErrors = [];
        sigPlugin.configured = true;
        sigPlugin.qrConnected = true;
      }
    }
  } catch {
    /* workspace dir may not exist */
  }
}
