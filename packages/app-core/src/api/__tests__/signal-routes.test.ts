import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalPairingSession } from "../../services/signal-pairing";
import {
  applySignalQrOverride,
  handleSignalRoute,
  MAX_PAIRING_SESSIONS,
  type SignalRouteState,
} from "../signal-routes";
import { createMockReq, createMockRes } from "./sandbox-test-helpers";

const mockSession = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  getStatus: vi.fn().mockReturnValue("waiting_for_qr"),
}));

const signalAuthExists = vi.hoisted(() => vi.fn().mockReturnValue(false));
const signalLogout = vi.hoisted(() => vi.fn());

vi.mock("../../services/signal-pairing", () => ({
  sanitizeAccountId: (id: string) => {
    const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleaned || cleaned !== id) throw new Error("Invalid accountId");
    return cleaned;
  },
  signalAuthExists,
  signalLogout,
  // biome-ignore lint/complexity/useArrowFunction: regular function required for constructor mock
  SignalPairingSession: vi.fn().mockImplementation(function () {
    return mockSession;
  }),
}));

function createState(
  overrides: Partial<SignalRouteState> = {},
): SignalRouteState {
  return {
    signalPairingSessions: new Map(),
    config: { connectors: {} },
    saveConfig: vi.fn(),
    workspaceDir: "/tmp/test-workspace",
    broadcastWs: vi.fn(),
    ...overrides,
  };
}

describe("handleSignalRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.getStatus.mockReturnValue("waiting_for_qr");
    mockSession.start.mockResolvedValue(undefined);
    signalAuthExists.mockReturnValue(false);
  });

  it("returns false for non-signal routes", async () => {
    const handled = await handleSignalRoute(
      createMockReq("GET"),
      createMockRes(),
      "/api/chat",
      "GET",
      createState(),
    );

    expect(handled).toBe(false);
  });

  it("returns immediately after creating a pairing session", async () => {
    mockSession.start.mockImplementation(
      () => new Promise<void>(() => undefined),
    );

    const promise = handleSignalRoute(
      createMockReq("POST", JSON.stringify({ accountId: "default" })),
      createMockRes(),
      "/api/signal/pair",
      "POST",
      createState(),
    );

    const result = await Promise.race([
      promise,
      new Promise<symbol>((resolve) =>
        setTimeout(() => resolve(Symbol.for("timeout")), 25),
      ),
    ]);

    expect(result).toBe(true);
    expect(mockSession.start).toHaveBeenCalledOnce();
  });

  it("enforces the pairing session limit", async () => {
    const sessions = new Map<string, SignalPairingSession>();
    for (let i = 0; i < MAX_PAIRING_SESSIONS; i += 1) {
      sessions.set(`account-${i}`, mockSession as SignalPairingSession);
    }

    const res = createMockRes();
    await handleSignalRoute(
      createMockReq("POST", JSON.stringify({ accountId: "overflow" })),
      res,
      "/api/signal/pair",
      "POST",
      createState({ signalPairingSessions: sessions }),
    );

    expect(res._status).toBe(429);
    expect(JSON.parse(res._body).error).toContain("Too many concurrent");
  });

  it("marks the Signal plugin configured when auth exists", () => {
    signalAuthExists.mockReturnValue(true);
    const plugins = [
      { id: "signal", validationErrors: ["missing"], configured: false },
    ];

    applySignalQrOverride(plugins, "/workspace");

    expect(plugins[0]).toMatchObject({
      validationErrors: [],
      configured: true,
      qrConnected: true,
    });
  });

  it("disconnects and removes persisted config", async () => {
    const res = createMockRes();
    const state = createState({
      config: { connectors: { signal: { enabled: true } } },
    });

    await handleSignalRoute(
      createMockReq("POST", JSON.stringify({ accountId: "default" })),
      res,
      "/api/signal/disconnect",
      "POST",
      state,
    );

    expect(signalLogout).toHaveBeenCalledWith("/tmp/test-workspace", "default");
    expect(state.config.connectors?.signal).toBeUndefined();
  });
});
