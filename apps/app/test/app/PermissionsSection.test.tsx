/**
 * Tests for PermissionsSection — platform-aware rendering.
 *
 * Validates that the settings-page PermissionsSection renders the correct
 * view for each platform: Electron (desktop permissions), Web (info message),
 * and Capacitor/mobile (streaming permissions).
 */
// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────

const { mockUseApp, mockIsWeb, mockIsElectron, mockIsNative } = vi.hoisted(
  () => ({
    mockUseApp: vi.fn(),
    mockIsWeb: vi.fn(() => false),
    mockIsElectron: vi.fn(() => true),
    mockIsNative: { value: false },
  }),
);
const {
  mockGetPermissions,
  mockIsShellEnabled,
  mockRefreshPermissions,
  mockRequestPermission,
  mockOpenPermissionSettings,
  mockSetShellEnabled,
  mockInvokeDesktopBridgeRequest,
} = vi.hoisted(() => ({
  mockGetPermissions: vi.fn(),
  mockIsShellEnabled: vi.fn(),
  mockRefreshPermissions: vi.fn(),
  mockRequestPermission: vi.fn(),
  mockOpenPermissionSettings: vi.fn(),
  mockSetShellEnabled: vi.fn(),
  mockInvokeDesktopBridgeRequest: vi.fn(),
}));

vi.mock("@milady/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@milady/app-core/platform", () => ({
  hasRequiredOnboardingPermissions: vi.fn(() => true),
  isWebPlatform: () => mockIsWeb(),
  isElectronPlatform: () => mockIsElectron(),
  get isNative() {
    return mockIsNative.value;
  },
  isIOS: false,
  isAndroid: false,
  platform: "web",
}));

vi.mock("@milady/app-core/api", () => ({
  client: {
    getPermissions: mockGetPermissions,
    isShellEnabled: mockIsShellEnabled,
    refreshPermissions: mockRefreshPermissions,
    requestPermission: mockRequestPermission,
    openPermissionSettings: mockOpenPermissionSettings,
    setShellEnabled: mockSetShellEnabled,
  },
}));

vi.mock("@milady/app-core/bridge", () => ({
  invokeDesktopBridgeRequest: mockInvokeDesktopBridgeRequest,
}));

vi.mock("@milady/app-core/components/ui-badges", () => ({
  StatusBadge: ({ label }: { label: string }) =>
    React.createElement("span", { "data-testid": "status-badge" }, label),
}));

vi.mock("@milady/app-core/components/ui-switch", () => ({
  Switch: () => React.createElement("span", null, "switch"),
}));

vi.mock("@milady/ui", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) =>
    React.createElement(
      "button",
      { type: "button", onClick, ...rest },
      children,
    ),
}));

vi.mock("lucide-react", () => ({
  Camera: () => React.createElement("span", null, "📷"),
  Check: () => React.createElement("span", null, "✓"),
  CircleUserRound: () => React.createElement("span", null, "👤"),
  Cloud: () => React.createElement("span", null, "☁"),
  Mic: () => React.createElement("span", null, "🎤"),
  Monitor: () => React.createElement("span", null, "🖥"),
  MousePointer2: () => React.createElement("span", null, "🖱"),
  Settings: () => React.createElement("span", null, "⚙"),
  Smartphone: () => React.createElement("span", null, "📱"),
  Terminal: () => React.createElement("span", null, "💻"),
}));

import { PermissionsSection } from "@milady/app-core/components/PermissionsSection";

// ── Helpers ───────────────────────────────────────────────────────────

function baseContext(overrides?: Record<string, unknown>) {
  return {
    t: (k: string) => k,
    plugins: [],
    handlePluginToggle: vi.fn(),
    ...overrides,
  };
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

// ====================================================================

describe("PermissionsSection", () => {
  const defaultPermissions = {
    accessibility: {
      id: "accessibility",
      status: "granted",
      canRequest: false,
    },
    "screen-recording": {
      id: "screen-recording",
      status: "granted",
      canRequest: false,
    },
    microphone: {
      id: "microphone",
      status: "not-determined",
      canRequest: true,
    },
    camera: { id: "camera", status: "granted", canRequest: false },
    shell: { id: "shell", status: "granted", canRequest: false },
  };

  beforeEach(() => {
    mockUseApp.mockReset();
    mockIsWeb.mockReturnValue(false);
    mockIsElectron.mockReturnValue(true);
    mockIsNative.value = false;
    mockGetPermissions.mockReset();
    mockIsShellEnabled.mockReset();
    mockRefreshPermissions.mockReset();
    mockRequestPermission.mockReset();
    mockOpenPermissionSettings.mockReset();
    mockSetShellEnabled.mockReset();
    mockInvokeDesktopBridgeRequest.mockReset();
    mockGetPermissions.mockResolvedValue(defaultPermissions);
    mockIsShellEnabled.mockResolvedValue(true);
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return defaultPermissions;
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        return null;
      },
    );
  });

  it("renders web informational message when isWebPlatform() is true", async () => {
    mockIsWeb.mockReturnValue(true);
    mockIsElectron.mockReturnValue(false);
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const webInfo = root.findByProps({ "data-testid": "web-permissions-info" });
    expect(webInfo).toBeDefined();
    const text = collectText(root);
    expect(text).toContain("permissionssection.BrowserPermissions");
    expect(text).toContain("Camera");
    expect(text).toContain("Microphone");
  });

  it("renders mobile streaming permissions when isNative and not Electron", async () => {
    mockIsWeb.mockReturnValue(false);
    mockIsElectron.mockReturnValue(false);
    mockIsNative.value = true;
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const mobileView = root.findByProps({
      "data-testid": "mobile-permissions",
    });
    expect(mobileView).toBeDefined();
    const text = collectText(root);
    expect(text).toContain("permissionssection.StreamingPermissions");
    expect(text).toContain("Camera");
    expect(text).toContain("Microphone");
  });

  it("renders desktop permission rows on Electron", async () => {
    mockIsWeb.mockReturnValue(false);
    mockIsElectron.mockReturnValue(true);
    mockIsNative.value = false;
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const root = tree?.root;
    const text = collectText(root);
    // Should show system permissions section with permission rows
    expect(text).toContain("permissionssection.SystemPermissions");
    expect(text).toContain("appsview.Capabilities");
  });

  it("uses the Electrobun bridge for permission requests", async () => {
    mockUseApp.mockReturnValue(baseContext());
    mockInvokeDesktopBridgeRequest.mockImplementation(
      async (options: { rpcMethod: string; params?: { id?: string } }) => {
        if (options.rpcMethod === "permissionsGetAll") {
          return defaultPermissions;
        }
        if (options.rpcMethod === "permissionsIsShellEnabled") {
          return true;
        }
        if (options.rpcMethod === "permissionsRequest") {
          return {
            id: options.params?.id ?? "microphone",
            status: "granted",
            canRequest: false,
            lastChecked: Date.now(),
          };
        }
        return null;
      },
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    const requestButton = tree?.root.findByProps({
      children: "permissionssection.Request",
    });
    expect(requestButton).toBeDefined();

    await act(async () => {
      requestButton?.props.onClick();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith({
      rpcMethod: "permissionsRequest",
      ipcChannel: "permissions:request",
      params: { id: "microphone" },
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("uses the Electrobun bridge for permission refresh", async () => {
    mockUseApp.mockReturnValue(baseContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PermissionsSection));
    });

    mockInvokeDesktopBridgeRequest.mockClear();

    const refreshButton = tree?.root.findByProps({ children: "Refresh" });
    expect(refreshButton).toBeDefined();

    await act(async () => {
      refreshButton?.props.onClick();
    });

    expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith({
      rpcMethod: "permissionsGetAll",
      ipcChannel: "permissions:getAll",
      params: { forceRefresh: true },
    });
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
  });
});
