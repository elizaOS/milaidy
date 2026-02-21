/**
 * WhatsApp API routes: pair, status, stop, disconnect.
 *
 * Extracted from the main server handler for testability.
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  readJsonBody as parseJsonBody,
  sendJson,
} from "./http-helpers";
import {
  sanitizeAccountId,
  WhatsAppPairingSession,
  whatsappAuthExists,
  whatsappLogout,
  type WhatsAppPairingEvent,
} from "../services/whatsapp-pairing";

// ---------------------------------------------------------------------------
// State interface (subset of ServerState relevant to WhatsApp routes)
// ---------------------------------------------------------------------------

export interface WhatsAppRouteState {
  whatsappPairingSessions: Map<string, WhatsAppPairingSession>;
  broadcastWs?: (data: Record<string, unknown>) => void;
  config: {
    connectors?: Record<string, unknown>;
  };
  runtime?: {
    getService(type: string): unknown | null;
  };
  /** Persist config to disk. */
  saveConfig: () => void;
  /** Workspace directory (e.g. ~/.milady/workspace). */
  workspaceDir: string;
}

const MAX_BODY_BYTES = 1_048_576;
/** Maximum concurrent pairing sessions to prevent resource exhaustion. */
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
export async function handleWhatsAppRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: WhatsAppRouteState,
): Promise<boolean> {
  if (!pathname.startsWith("/api/whatsapp")) return false;

  // ── POST /api/whatsapp/pair ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/whatsapp/pair") {
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

    // Enforce session limit (existing session for this account doesn't count)
    const isReplacing = state.whatsappPairingSessions.has(accountId);
    if (!isReplacing && state.whatsappPairingSessions.size >= MAX_PAIRING_SESSIONS) {
      json(
        res,
        { error: `Too many concurrent pairing sessions (max ${MAX_PAIRING_SESSIONS})` },
        429,
      );
      return true;
    }

    const authDir = path.join(state.workspaceDir, "whatsapp-auth", accountId);

    // Stop any existing session for this account
    state.whatsappPairingSessions?.get(accountId)?.stop();

    const session = new WhatsAppPairingSession({
      authDir,
      accountId,
      onEvent: (event: WhatsAppPairingEvent) => {
        state.broadcastWs?.(event as unknown as Record<string, unknown>);

        if (event.status === "connected") {
          if (!state.config.connectors) state.config.connectors = {};
          state.config.connectors.whatsapp = {
            ...(state.config.connectors.whatsapp as Record<string, unknown> | undefined) ?? {},
            authDir,
            enabled: true,
          };
          try {
            state.saveConfig();
          } catch { /* test envs */ }
        }
      },
    });

    state.whatsappPairingSessions.set(accountId, session);

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

  // ── GET /api/whatsapp/status ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/whatsapp/status") {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    let accountId: string;
    try {
      accountId = sanitizeAccountId(url.searchParams.get("accountId") || "default");
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
      return true;
    }

    const session = state.whatsappPairingSessions?.get(accountId);

    let serviceConnected = false;
    let servicePhone: string | null = null;
    if (state.runtime) {
      try {
        const waService = state.runtime.getService("whatsapp") as Record<string, unknown> | null;
        if (waService) {
          serviceConnected = Boolean(waService.connected);
          servicePhone = (waService.phoneNumber as string) ?? null;
        }
      } catch { /* service not yet registered */ }
    }

    json(res, {
      accountId,
      status: session?.getStatus() ?? "idle",
      authExists: whatsappAuthExists(state.workspaceDir, accountId),
      serviceConnected,
      servicePhone,
    });
    return true;
  }

  // ── POST /api/whatsapp/pair/stop ────────────────────────────────────
  if (method === "POST" && pathname === "/api/whatsapp/pair/stop") {
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

    const session = state.whatsappPairingSessions?.get(accountId);
    if (session) {
      session.stop();
      state.whatsappPairingSessions?.delete(accountId);
    }

    json(res, { ok: true, accountId, status: "idle" });
    return true;
  }

  // ── POST /api/whatsapp/disconnect ──────────────────────────────────
  if (method === "POST" && pathname === "/api/whatsapp/disconnect") {
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
    const session = state.whatsappPairingSessions?.get(accountId);
    if (session) {
      session.stop();
      state.whatsappPairingSessions?.delete(accountId);
    }

    // Properly logout then delete auth files
    try {
      await whatsappLogout(state.workspaceDir, accountId);
    } catch {
      const authDir = path.join(state.workspaceDir, "whatsapp-auth", accountId);
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
      } catch { /* may not exist */ }
    }

    // Remove connector config
    if (state.config.connectors) {
      delete state.config.connectors.whatsapp;
      try {
        state.saveConfig();
      } catch { /* test envs */ }
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
 * When WhatsApp is connected via QR code (Baileys auth on disk), mark the
 * plugin entry as configured and clear validation errors so the UI doesn't
 * show misleading "missing API key" warnings.
 */
export function applyWhatsAppQrOverride(
  plugins: { id: string; validationErrors: unknown[]; configured: boolean; qrConnected?: boolean }[],
  workspaceDir: string,
): void {
  try {
    const waCredsPath = path.join(workspaceDir, "whatsapp-auth", "default", "creds.json");
    if (fs.existsSync(waCredsPath)) {
      const waPlugin = plugins.find((p) => p.id === "whatsapp");
      if (waPlugin) {
        waPlugin.validationErrors = [];
        waPlugin.configured = true;
        waPlugin.qrConnected = true;
      }
    }
  } catch {
    /* workspace dir may not exist */
  }
}
