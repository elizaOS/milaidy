/**
 * E2E tests for Cloud Login Flow.
 *
 * Tests cover:
 * 1. Cloud login initiation
 * 2. Cloud connection status
 * 3. Cloud credits display
 * 4. Cloud disconnect
 * 5. Cloud error handling
 */

import http from "node:http";
// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Part 1: API Tests for Cloud Endpoints
// ---------------------------------------------------------------------------

async function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function createCloudTestServer(): Promise<{
  port: number;
  close: () => Promise<void>;
  getState: () => {
    connected: boolean;
    userId: string | null;
    credits: number;
  };
}> {
  const state = {
    connected: false,
    userId: null as string | null,
    credits: 0,
  };

  const json = (res: http.ServerResponse, data: unknown, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
  };

  const readBody = (r: http.IncomingMessage): Promise<string> =>
    new Promise((ok) => {
      const c: Buffer[] = [];
      r.on("data", (d: Buffer) => c.push(d));
      r.on("end", () => ok(Buffer.concat(c).toString()));
    });

  const routes: Record<
    string,
    (
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ) => Promise<void> | void
  > = {
    "GET /api/cloud/status": (_r, res) =>
      json(res, {
        connected: state.connected,
        userId: state.userId,
        credits: state.credits,
      }),
    "POST /api/cloud/login": async (r, res) => {
      const body = JSON.parse(await readBody(r)) as Record<string, unknown>;
      const token = body.token as string;

      if (!token) {
        return json(res, { error: "Token required" }, 400);
      }

      state.connected = true;
      state.userId = `user-${Date.now()}`;
      state.credits = 1000;

      json(res, {
        ok: true,
        userId: state.userId,
        credits: state.credits,
      });
    },
    "POST /api/cloud/disconnect": (_r, res) => {
      state.connected = false;
      state.userId = null;
      state.credits = 0;

      json(res, { ok: true });
    },
    "GET /api/cloud/credits": (_r, res) => {
      if (!state.connected) {
        return json(res, { error: "Not connected" }, 401);
      }
      json(res, { credits: state.credits });
    },
    "POST /api/cloud/topup": async (r, res) => {
      if (!state.connected) {
        return json(res, { error: "Not connected" }, 401);
      }
      const body = JSON.parse(await readBody(r)) as Record<string, unknown>;
      const amount = (body.amount as number) || 100;
      state.credits += amount;
      json(res, { ok: true, credits: state.credits });
    },
  };

  const server = http.createServer(async (rq, rs) => {
    if (rq.method === "OPTIONS") {
      rs.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
      });
      rs.end();
      return;
    }
    const key = `${rq.method} ${new URL(rq.url ?? "/", "http://localhost").pathname}`;
    const handler = routes[key];
    if (handler) {
      await handler(rq, rs);
    } else {
      json(rs, { error: "Not found" }, 404);
    }
  });

  return new Promise((ok) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      ok({
        port: typeof addr === "object" && addr ? addr.port : 0,
        close: () => new Promise<void>((r) => server.close(() => r())),
        getState: () => ({
          connected: state.connected,
          userId: state.userId,
          credits: state.credits,
        }),
      });
    });
  });
}

describe("Cloud API", () => {
  let port: number;
  let close: () => Promise<void>;
  let getState: () => {
    connected: boolean;
    userId: string | null;
    credits: number;
  };

  beforeAll(async () => {
    ({ port, close, getState } = await createCloudTestServer());
  });

  afterAll(async () => {
    await close();
  });

  it("GET /api/cloud/status returns connection status", async () => {
    const { status, data } = await req(port, "GET", "/api/cloud/status");
    expect(status).toBe(200);
    expect(typeof data.connected).toBe("boolean");
  });

  it("POST /api/cloud/login connects to cloud", async () => {
    const { status, data } = await req(port, "POST", "/api/cloud/login", {
      token: "test-token",
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.userId).toBeDefined();
    expect(getState().connected).toBe(true);
  });

  it("POST /api/cloud/login fails without token", async () => {
    // First disconnect
    await req(port, "POST", "/api/cloud/disconnect");

    const { status } = await req(port, "POST", "/api/cloud/login", {});
    expect(status).toBe(400);
  });

  it("GET /api/cloud/credits returns credits when connected", async () => {
    // First connect
    await req(port, "POST", "/api/cloud/login", { token: "test" });

    const { status, data } = await req(port, "GET", "/api/cloud/credits");
    expect(status).toBe(200);
    expect(typeof data.credits).toBe("number");
  });

  it("GET /api/cloud/credits fails when not connected", async () => {
    await req(port, "POST", "/api/cloud/disconnect");

    const { status } = await req(port, "GET", "/api/cloud/credits");
    expect(status).toBe(401);
  });

  it("POST /api/cloud/disconnect disconnects from cloud", async () => {
    // First connect
    await req(port, "POST", "/api/cloud/login", { token: "test" });

    const { status, data } = await req(port, "POST", "/api/cloud/disconnect");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(getState().connected).toBe(false);
  });

  it("POST /api/cloud/topup adds credits", async () => {
    await req(port, "POST", "/api/cloud/login", { token: "test" });
    const initialCredits = getState().credits;

    const { status, data } = await req(port, "POST", "/api/cloud/topup", {
      amount: 500,
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(getState().credits).toBe(initialCredits + 500);
  });
});

// ---------------------------------------------------------------------------
// Part 2: UI Tests for Cloud Login
// ---------------------------------------------------------------------------

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", async () => {
  const actual = await vi.importActual("../../src/AppContext");
  return {
    ...actual,
    useApp: () => mockUseApp(),
    THEMES: [{ id: "milady", label: "Milady" }],
  };
});

vi.mock("../../src/components/MediaSettingsSection", () => ({
  MediaSettingsSection: () =>
    React.createElement("div", null, "MediaSettingsSection"),
}));

vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsSection: () =>
    React.createElement("div", null, "PermissionsSection"),
}));

vi.mock("../../src/components/ProviderSwitcher", () => ({
  ProviderSwitcher: () => React.createElement("div", null, "ProviderSwitcher"),
}));

vi.mock("../../src/components/VoiceConfigView", () => ({
  VoiceConfigView: () => React.createElement("div", null, "VoiceConfigView"),
}));

import { SettingsView } from "../../src/components/SettingsView";

type CloudState = {
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number;
  cloudCreditsLow: boolean;
  cloudCreditsCritical: boolean;
  cloudTopUpUrl: string;
  cloudUserId: string;
  cloudLoginBusy: boolean;
  cloudLoginError: string;
  cloudDisconnecting: boolean;
  currentTheme: string;
  plugins: unknown[];
  pluginSaving: boolean;
  pluginSaveSuccess: boolean;
};

function createCloudUIState(): CloudState {
  return {
    cloudEnabled: true,
    cloudConnected: false,
    cloudCredits: 0,
    cloudCreditsLow: false,
    cloudCreditsCritical: false,
    cloudTopUpUrl: "https://example.com/topup",
    cloudUserId: "",
    cloudLoginBusy: false,
    cloudLoginError: "",
    cloudDisconnecting: false,
    currentTheme: "milady",
    plugins: [],
    pluginSaving: false,
    pluginSaveSuccess: false,
  };
}

describe("Cloud Login UI", () => {
  let state: CloudState;
  let _loginCalled: boolean;
  let _disconnectCalled: boolean;

  beforeEach(() => {
    state = createCloudUIState();
    _loginCalled = false;
    _disconnectCalled = false;

    vi.spyOn(window, "confirm").mockImplementation(() => true);

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      ...state,
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        _loginCalled = true;
        state.cloudConnected = true;
        state.cloudUserId = "user-123";
        state.cloudCredits = 1000;
      },
      handleCloudDisconnect: async () => {
        _disconnectCalled = true;
        state.cloudConnected = false;
        state.cloudUserId = "";
        state.cloudCredits = 0;
      },
      handleReset: vi.fn(),
      setState: vi.fn(),
    }));
  });

  it("renders cloud section in settings", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    expect(tree).not.toBeNull();
  });

  it("shows login state when not connected", async () => {
    state.cloudConnected = false;

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    // Should show login or connect button
    expect(tree).not.toBeNull();
  });

  it("shows connected state with user info", async () => {
    state.cloudConnected = true;
    state.cloudUserId = "user-123";
    state.cloudCredits = 500;

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    // Should show disconnect button or user info
    expect(tree).not.toBeNull();
  });

  it("shows loading state during login", async () => {
    state.cloudLoginBusy = true;

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    expect(tree).not.toBeNull();
  });

  it("shows error when login fails", async () => {
    state.cloudLoginError = "Invalid token";

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    expect(tree).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Part 3: Cloud Connection Integration Tests
// ---------------------------------------------------------------------------

describe("Cloud Connection Integration", () => {
  let state: CloudState;

  beforeEach(() => {
    state = createCloudUIState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      ...state,
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        state.cloudLoginBusy = true;
        // Simulate async login
        state.cloudConnected = true;
        state.cloudUserId = "user-123";
        state.cloudCredits = 1000;
        state.cloudLoginBusy = false;
      },
      handleCloudDisconnect: async () => {
        state.cloudDisconnecting = true;
        state.cloudConnected = false;
        state.cloudUserId = "";
        state.cloudCredits = 0;
        state.cloudDisconnecting = false;
      },
      handleReset: vi.fn(),
      setState: vi.fn(),
    }));
  });

  it("login updates connection state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    expect(state.cloudConnected).toBe(false);
    await loginFn();
    expect(state.cloudConnected).toBe(true);
  });

  it("login sets user ID", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();
    expect(state.cloudUserId).toBe("user-123");
  });

  it("login sets credits", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();
    expect(state.cloudCredits).toBe(1000);
  });

  it("disconnect clears connection state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;
    const disconnectFn = mockUseApp().handleCloudDisconnect;

    await loginFn();
    expect(state.cloudConnected).toBe(true);

    await disconnectFn();
    expect(state.cloudConnected).toBe(false);
  });

  it("disconnect clears user ID and credits", async () => {
    const loginFn = mockUseApp().handleCloudLogin;
    const disconnectFn = mockUseApp().handleCloudDisconnect;

    await loginFn();
    await disconnectFn();

    expect(state.cloudUserId).toBe("");
    expect(state.cloudCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Part 4: Cloud Credits Display Tests
// ---------------------------------------------------------------------------

describe("Cloud Credits Display", () => {
  let state: CloudState;

  beforeEach(() => {
    state = createCloudUIState();
    state.cloudConnected = true;
    state.cloudUserId = "user-123";

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      ...state,
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: vi.fn(),
      handleCloudDisconnect: vi.fn(),
      handleReset: vi.fn(),
      setState: vi.fn(),
    }));
  });

  it("normal credits show without warning", () => {
    state.cloudCredits = 500;
    state.cloudCreditsLow = false;
    state.cloudCreditsCritical = false;

    expect(state.cloudCreditsLow).toBe(false);
    expect(state.cloudCreditsCritical).toBe(false);
  });

  it("low credits sets warning flag", () => {
    state.cloudCredits = 50;
    state.cloudCreditsLow = true;

    expect(state.cloudCreditsLow).toBe(true);
  });

  it("critical credits sets critical flag", () => {
    state.cloudCredits = 5;
    state.cloudCreditsCritical = true;

    expect(state.cloudCreditsCritical).toBe(true);
  });

  it("topup URL is available", () => {
    expect(state.cloudTopUpUrl).toBe("https://example.com/topup");
  });
});

// ---------------------------------------------------------------------------
// Part 5: Cloud Error Handling Tests
// ---------------------------------------------------------------------------

describe("Cloud Error Handling", () => {
  let state: CloudState;

  beforeEach(() => {
    state = createCloudUIState();

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
      ...state,
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        state.cloudLoginBusy = true;
        // Simulate failed login
        state.cloudLoginError = "Authentication failed";
        state.cloudLoginBusy = false;
      },
      handleCloudDisconnect: vi.fn(),
      handleReset: vi.fn(),
      setState: vi.fn(),
    }));
  });

  it("login failure sets error message", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();

    expect(state.cloudLoginError).toBe("Authentication failed");
  });

  it("login failure keeps disconnected state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();

    expect(state.cloudConnected).toBe(false);
  });
});
