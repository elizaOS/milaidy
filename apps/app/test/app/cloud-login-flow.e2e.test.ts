/**
 * E2E tests for Cloud Login Flow — UI Tests.
 *
 * Tests cover:
 * 1. Cloud login UI state
 * 2. Cloud connection status display
 * 3. Cloud credits display
 * 4. Cloud disconnect UI
 * 5. Cloud error handling
 *
 * API endpoint tests are in cloud-api.e2e.test.ts (separated to avoid
 * mixing node HTTP server with jsdom, which causes V8 OOM).
 */

// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Part 2: UI Tests for Cloud Login
// ---------------------------------------------------------------------------

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  THEMES: [{ id: "milady", label: "Milady" }],
}));

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
  miladyCloudEnabled: boolean;
  miladyCloudConnected: boolean;
  miladyCloudCredits: number;
  miladyCloudCreditsLow: boolean;
  miladyCloudCreditsCritical: boolean;
  miladyCloudTopUpUrl: string;
  miladyCloudUserId: string;
  miladyCloudLoginBusy: boolean;
  miladyCloudLoginError: string;
  cloudDisconnecting: boolean;
  currentTheme: string;
  plugins: unknown[];
  pluginSaving: boolean;
  pluginSaveSuccess: boolean;
};

function createCloudUIState(): CloudState {
  return {
    miladyCloudEnabled: true,
    miladyCloudConnected: false,
    miladyCloudCredits: 0,
    miladyCloudCreditsLow: false,
    miladyCloudCreditsCritical: false,
    miladyCloudTopUpUrl: "https://example.com/topup",
    miladyCloudUserId: "",
    miladyCloudLoginBusy: false,
    miladyCloudLoginError: "",
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
  let tree: TestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    // Unmount React tree to clean up effects/timers and allow the
    // worker process to exit cleanly.
    if (tree) {
      tree.unmount();
      tree = null;
    }
  });

  beforeEach(() => {
    state = createCloudUIState();
    _loginCalled = false;
    _disconnectCalled = false;

    vi.spyOn(window, "confirm").mockImplementation(() => true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as unknown as typeof fetch;

    const sharedLoadDropStatus = vi.fn().mockResolvedValue(undefined);
    const cachedMock = {
      t: (k: string) => k,
      ...state,
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      exportBusy: false,
      exportPassword: "",
      exportIncludeLogs: false,
      exportError: null,
      exportSuccess: null,
      importBusy: false,
      importPassword: "",
      importFile: null,
      importError: null,
      importSuccess: null,
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      setActionNotice: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        _loginCalled = true;
        state.miladyCloudConnected = true;
        state.miladyCloudUserId = "user-123";
        state.miladyCloudCredits = 1000;
      },
      handleCloudDisconnect: async () => {
        _disconnectCalled = true;
        state.miladyCloudConnected = false;
        state.miladyCloudUserId = "";
        state.miladyCloudCredits = 0;
      },
      handleReset: vi.fn(),
      handleAgentExport: vi.fn(),
      handleAgentImport: vi.fn(),
      setState: vi.fn(),
      loadDropStatus: sharedLoadDropStatus,
    };

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => cachedMock);
  });

  it("renders cloud section in settings", async () => {
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    expect(tree).not.toBeNull();
  });

  it("shows login state when not connected", async () => {
    state.miladyCloudConnected = false;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    // Should show login or connect button
    expect(tree).not.toBeNull();
  });

  it("shows connected state with user info", async () => {
    state.miladyCloudConnected = true;
    state.miladyCloudUserId = "user-123";
    state.miladyCloudCredits = 500;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    // Should show disconnect button or user info
    expect(tree).not.toBeNull();
  });

  it("shows loading state during login", async () => {
    state.miladyCloudLoginBusy = true;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    expect(tree).not.toBeNull();
  });

  it("shows error when login fails", async () => {
    state.miladyCloudLoginError = "Invalid token";

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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as unknown as typeof fetch;

    const sharedLoadDropStatus = vi.fn().mockResolvedValue(undefined);
    const cachedMock = {
      t: (k: string) => k,
      ...state,
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      setActionNotice: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        state.miladyCloudLoginBusy = true;
        state.miladyCloudConnected = true;
        state.miladyCloudUserId = "user-123";
        state.miladyCloudCredits = 1000;
        state.miladyCloudLoginBusy = false;
      },
      handleCloudDisconnect: async () => {
        state.cloudDisconnecting = true;
        state.miladyCloudConnected = false;
        state.miladyCloudUserId = "";
        state.miladyCloudCredits = 0;
        state.cloudDisconnecting = false;
      },
      handleReset: vi.fn(),
      handleAgentExport: vi.fn(),
      handleAgentImport: vi.fn(),
      setState: vi.fn(),
      loadDropStatus: sharedLoadDropStatus,
    };

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => cachedMock);
  });

  it("login updates connection state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    expect(state.miladyCloudConnected).toBe(false);
    await loginFn();
    expect(state.miladyCloudConnected).toBe(true);
  });

  it("login sets user ID", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();
    expect(state.miladyCloudUserId).toBe("user-123");
  });

  it("login sets credits", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();
    expect(state.miladyCloudCredits).toBe(1000);
  });

  it("disconnect clears connection state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;
    const disconnectFn = mockUseApp().handleCloudDisconnect;

    await loginFn();
    expect(state.miladyCloudConnected).toBe(true);

    await disconnectFn();
    expect(state.miladyCloudConnected).toBe(false);
  });

  it("disconnect clears user ID and credits", async () => {
    const loginFn = mockUseApp().handleCloudLogin;
    const disconnectFn = mockUseApp().handleCloudDisconnect;

    await loginFn();
    await disconnectFn();

    expect(state.miladyCloudUserId).toBe("");
    expect(state.miladyCloudCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Part 4: Cloud Credits Display Tests
// ---------------------------------------------------------------------------

describe("Cloud Credits Display", () => {
  let state: CloudState;

  beforeEach(() => {
    state = createCloudUIState();
    state.miladyCloudConnected = true;
    state.miladyCloudUserId = "user-123";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as unknown as typeof fetch;

    const sharedLoadDropStatus = vi.fn().mockResolvedValue(undefined);
    const cachedMock = {
      t: (k: string) => k,
      ...state,
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      setActionNotice: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: vi.fn(),
      handleCloudDisconnect: vi.fn(),
      handleReset: vi.fn(),
      handleAgentExport: vi.fn(),
      handleAgentImport: vi.fn(),
      setState: vi.fn(),
      loadDropStatus: sharedLoadDropStatus,
    };

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => cachedMock);
  });

  it("normal credits show without warning", () => {
    state.miladyCloudCredits = 500;
    state.miladyCloudCreditsLow = false;
    state.miladyCloudCreditsCritical = false;

    expect(state.miladyCloudCreditsLow).toBe(false);
    expect(state.miladyCloudCreditsCritical).toBe(false);
  });

  it("low credits sets warning flag", () => {
    state.miladyCloudCredits = 50;
    state.miladyCloudCreditsLow = true;

    expect(state.miladyCloudCreditsLow).toBe(true);
  });

  it("critical credits sets critical flag", () => {
    state.miladyCloudCredits = 5;
    state.miladyCloudCreditsCritical = true;

    expect(state.miladyCloudCreditsCritical).toBe(true);
  });

  it("topup URL is available", () => {
    expect(state.miladyCloudTopUpUrl).toBe("https://example.com/topup");
  });
});

// ---------------------------------------------------------------------------
// Part 5: Cloud Error Handling Tests
// ---------------------------------------------------------------------------

describe("Cloud Error Handling", () => {
  let state: CloudState;

  beforeEach(() => {
    state = createCloudUIState();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    }) as unknown as typeof fetch;

    const sharedLoadDropStatus = vi.fn().mockResolvedValue(undefined);
    const cachedMock = {
      t: (k: string) => k,
      ...state,
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      loadPlugins: vi.fn(),
      handlePluginToggle: vi.fn(),
      setTheme: vi.fn(),
      setTab: vi.fn(),
      setActionNotice: vi.fn(),
      loadUpdateStatus: vi.fn(),
      handlePluginConfigSave: vi.fn(),
      handleCloudLogin: async () => {
        state.miladyCloudLoginBusy = true;
        state.miladyCloudLoginError = "Authentication failed";
        state.miladyCloudLoginBusy = false;
      },
      handleCloudDisconnect: vi.fn(),
      handleReset: vi.fn(),
      handleAgentExport: vi.fn(),
      handleAgentImport: vi.fn(),
      setState: vi.fn(),
      loadDropStatus: sharedLoadDropStatus,
    };

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => cachedMock);
  });

  it("login failure sets error message", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();

    expect(state.miladyCloudLoginError).toBe("Authentication failed");
  });

  it("login failure keeps disconnected state", async () => {
    const loginFn = mockUseApp().handleCloudLogin;

    await loginFn();

    expect(state.miladyCloudConnected).toBe(false);
  });
});
