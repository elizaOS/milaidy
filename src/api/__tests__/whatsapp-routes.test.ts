/**
 * Tests for WhatsApp API routes: pair, status, stop, disconnect.
 */

import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WhatsAppPairingSession,
  whatsappLogout,
} from "../../services/whatsapp-pairing";
import {
  applyWhatsAppQrOverride,
  handleWhatsAppRoute,
  MAX_PAIRING_SESSIONS,
  type WhatsAppRouteState,
} from "../whatsapp-routes";
import { createMockReq, createMockRes } from "./sandbox-test-helpers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted ensures these are available when vi.mock factories execute
// (vi.mock calls are hoisted above imports and variable declarations).
const mockSession = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  getStatus: vi.fn().mockReturnValue("waiting_for_qr"),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn().mockReturnValue(false), rmSync: vi.fn() },
  existsSync: vi.fn().mockReturnValue(false),
  rmSync: vi.fn(),
}));

vi.mock("../../services/whatsapp-pairing", () => ({
  sanitizeAccountId: (id: string) => {
    const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleaned || cleaned !== id) throw new Error("Invalid accountId");
    return cleaned;
  },
  whatsappAuthExists: vi.fn().mockReturnValue(false),
  whatsappLogout: vi.fn().mockResolvedValue(undefined),
  // biome-ignore lint/complexity/useArrowFunction: regular function required for vi.fn constructor mock
  WhatsAppPairingSession: vi.fn().mockImplementation(function () {
    return mockSession;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createState(
  overrides: Partial<WhatsAppRouteState> = {},
): WhatsAppRouteState {
  return {
    whatsappPairingSessions: new Map(),
    config: { connectors: {} },
    saveConfig: vi.fn(),
    workspaceDir: "/tmp/test-workspace",
    broadcastWs: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleWhatsAppRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.getStatus.mockReturnValue("waiting_for_qr");
  });

  describe("routing", () => {
    it("returns false for non-whatsapp routes", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/chat",
        "GET",
        createState(),
      );
      expect(handled).toBe(false);
    });

    it("returns false for unrecognised whatsapp sub-routes", async () => {
      const req = createMockReq("GET");
      const res = createMockRes();
      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/unknown",
        "GET",
        createState(),
      );
      expect(handled).toBe(false);
    });
  });

  describe("GET /api/whatsapp/status", () => {
    it("returns idle status when no session exists", async () => {
      const req = createMockReq("GET");
      req.url = "/api/whatsapp/status?accountId=default";
      req.headers = { host: "localhost:2138" };
      const res = createMockRes();
      const state = createState();

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/status",
        "GET",
        state,
      );

      expect(handled).toBe(true);
      const body = JSON.parse(res._body);
      expect(body.accountId).toBe("default");
      expect(body.status).toBe("idle");
      expect(body.authExists).toBe(false);
      expect(body.serviceConnected).toBe(false);
    });

    it("returns session status when a session exists", async () => {
      const req = createMockReq("GET");
      req.url = "/api/whatsapp/status?accountId=default";
      req.headers = { host: "localhost:2138" };
      const res = createMockRes();

      const sessions = new Map<string, WhatsAppPairingSession>();
      sessions.set("default", mockSession as unknown as WhatsAppPairingSession);
      const state = createState({ whatsappPairingSessions: sessions });

      await handleWhatsAppRoute(req, res, "/api/whatsapp/status", "GET", state);

      const body = JSON.parse(res._body);
      expect(body.status).toBe("waiting_for_qr");
    });

    it("rejects invalid accountId", async () => {
      const req = createMockReq("GET");
      req.url = "/api/whatsapp/status?accountId=../evil";
      req.headers = { host: "localhost:2138" };
      const res = createMockRes();

      await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/status",
        "GET",
        createState(),
      );

      expect(res._status).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toMatch(/invalid/i);
    });

    it("reports runtime service connection status", async () => {
      const req = createMockReq("GET");
      req.url = "/api/whatsapp/status?accountId=default";
      req.headers = { host: "localhost:2138" };
      const res = createMockRes();

      const runtime = {
        getService: vi.fn().mockReturnValue({
          connected: true,
          phoneNumber: "1234567890",
        }),
      };
      const state = createState({ runtime });

      await handleWhatsAppRoute(req, res, "/api/whatsapp/status", "GET", state);

      const body = JSON.parse(res._body);
      expect(body.serviceConnected).toBe(true);
      expect(body.servicePhone).toBe("1234567890");
    });
  });

  describe("POST /api/whatsapp/pair", () => {
    it("creates a session and starts pairing", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();
      const state = createState();

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(mockSession.start).toHaveBeenCalled();
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.accountId).toBe("default");
    });

    it("stops existing session before creating new one", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();

      const existingSession = { stop: vi.fn(), getStatus: vi.fn() };
      const sessions = new Map<string, WhatsAppPairingSession>();
      sessions.set(
        "default",
        existingSession as unknown as WhatsAppPairingSession,
      );
      const state = createState({ whatsappPairingSessions: sessions });

      await handleWhatsAppRoute(req, res, "/api/whatsapp/pair", "POST", state);

      expect(existingSession.stop).toHaveBeenCalled();
    });

    it("defaults to 'default' accountId when none provided", async () => {
      const req = createMockReq("POST", JSON.stringify({}));
      const res = createMockRes();

      await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        createState(),
      );

      const body = JSON.parse(res._body);
      expect(body.accountId).toBe("default");
    });

    it("rejects invalid accountId with 400", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "../evil" }),
      );
      const res = createMockRes();

      await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        createState(),
      );

      expect(res._status).toBe(400);
    });
  });

  describe("POST /api/whatsapp/pair/stop", () => {
    it("stops and removes an existing session", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();

      const sessions = new Map<string, WhatsAppPairingSession>();
      sessions.set("default", mockSession as unknown as WhatsAppPairingSession);
      const state = createState({ whatsappPairingSessions: sessions });

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair/stop",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(mockSession.stop).toHaveBeenCalled();
      expect(sessions.has("default")).toBe(false);
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.status).toBe("idle");
    });

    it("succeeds even when no session exists", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();

      await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair/stop",
        "POST",
        createState(),
      );

      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /api/whatsapp/disconnect", () => {
    it("stops session, calls logout, and removes connector config", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();

      const sessions = new Map<string, WhatsAppPairingSession>();
      sessions.set("default", mockSession as unknown as WhatsAppPairingSession);
      const connectors: Record<string, unknown> = {
        whatsapp: { enabled: true },
      };
      const state = createState({
        whatsappPairingSessions: sessions,
        config: { connectors },
      });

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/disconnect",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(mockSession.stop).toHaveBeenCalled();
      expect(sessions.has("default")).toBe(false);

      expect(whatsappLogout).toHaveBeenCalledWith(
        "/tmp/test-workspace",
        "default",
      );

      // Connector config should be removed
      expect(connectors.whatsapp).toBeUndefined();

      // Config should be saved
      expect(state.saveConfig).toHaveBeenCalled();

      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
      expect(body.accountId).toBe("default");
    });

    it("succeeds even when no session exists", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "default" }),
      );
      const res = createMockRes();

      await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/disconnect",
        "POST",
        createState(),
      );

      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /api/whatsapp/pair — session limit", () => {
    it("rejects with 429 when max sessions reached", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "new-account" }),
      );
      const res = createMockRes();

      // Fill the sessions map to the limit
      const sessions = new Map<string, WhatsAppPairingSession>();
      for (let i = 0; i < MAX_PAIRING_SESSIONS; i++) {
        sessions.set(
          `acct-${i}`,
          mockSession as unknown as WhatsAppPairingSession,
        );
      }
      const state = createState({ whatsappPairingSessions: sessions });

      await handleWhatsAppRoute(req, res, "/api/whatsapp/pair", "POST", state);

      expect(res._status).toBe(429);
      const body = JSON.parse(res._body);
      expect(body.error).toMatch(/too many/i);
    });

    it("allows replacing an existing session even at max capacity", async () => {
      const req = createMockReq(
        "POST",
        JSON.stringify({ accountId: "acct-0" }),
      );
      const res = createMockRes();

      const sessions = new Map<string, WhatsAppPairingSession>();
      for (let i = 0; i < MAX_PAIRING_SESSIONS; i++) {
        sessions.set(`acct-${i}`, {
          stop: vi.fn(),
          getStatus: vi.fn(),
        } as unknown as WhatsAppPairingSession);
      }
      const state = createState({ whatsappPairingSessions: sessions });

      await handleWhatsAppRoute(req, res, "/api/whatsapp/pair", "POST", state);

      // Should succeed (replacing existing "acct-0"), not 429
      const body = JSON.parse(res._body);
      expect(body.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// applyWhatsAppQrOverride()
// ---------------------------------------------------------------------------

describe("applyWhatsAppQrOverride()", () => {
  beforeEach(() => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReset();
  });

  it("marks whatsapp plugin as configured when creds.json exists", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const plugins = [
      {
        id: "discord",
        validationErrors: [],
        configured: true,
        qrConnected: undefined as boolean | undefined,
      },
      {
        id: "whatsapp",
        validationErrors: [{ msg: "missing key" }],
        configured: false,
        qrConnected: undefined as boolean | undefined,
      },
    ];

    applyWhatsAppQrOverride(plugins, "/workspace");

    const wa = plugins.find((p) => p.id === "whatsapp");
    expect(wa).toBeDefined();
    expect(wa?.configured).toBe(true);
    expect(wa?.qrConnected).toBe(true);
    expect(wa?.validationErrors).toEqual([]);
  });

  it("does nothing when creds.json does not exist", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const plugins = [
      {
        id: "whatsapp",
        validationErrors: [{ msg: "missing" }],
        configured: false,
      },
    ];

    applyWhatsAppQrOverride(plugins, "/workspace");

    expect(plugins[0].configured).toBe(false);
    expect(plugins[0].validationErrors).toHaveLength(1);
  });

  it("does nothing when whatsapp plugin is not in the list", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const plugins = [{ id: "discord", validationErrors: [], configured: true }];

    // Should not throw
    applyWhatsAppQrOverride(plugins, "/workspace");
    expect(plugins[0].configured).toBe(true);
  });

  it("checks the correct creds.json path", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    applyWhatsAppQrOverride([], "/my/workspace");

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining("whatsapp-auth"),
    );
    const calledPath = (fs.existsSync as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(calledPath).toMatch(/[/\\]my[/\\]workspace.*creds\.json$/);
  });
});
