// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));

vi.mock("@elizaos/app-core/state", () => ({
  useApp: useAppMock,
}));

vi.mock("../../src/BrowserSurfaceWindow", () => ({
  BrowserSurfaceWindow: () => <div data-testid="browser-surface-window" />,
}));

vi.mock("@elizaos/app-core/components", () => ({
  ChatView: () => <div data-testid="chat-view" />,
  CloudDashboard: () => <div data-testid="cloud-dashboard" />,
  CodingAgentSettingsSection: () => (
    <div data-testid="coding-agent-settings-section" />
  ),
  ConfigPageView: ({ embedded }: { embedded?: boolean }) => (
    <div
      data-embedded={embedded ? "true" : "false"}
      data-testid="config-page-view"
    />
  ),
  ConnectorsPageView: () => <div data-testid="connectors-view" />,
  HeartbeatsView: () => <div data-testid="heartbeats-view" />,
  MediaSettingsSection: () => <div data-testid="media-settings-section" />,
  PairingView: () => <div data-testid="pairing-view" />,
  PermissionsSection: () => <div data-testid="permissions-section" />,
  PluginsPageView: () => <div data-testid="plugins-page-view" />,
  ProviderSwitcher: () => <div data-testid="provider-switcher" />,
  SettingsView: ({ initialSection }: { initialSection?: string }) => (
    <div data-section={initialSection ?? ""} data-testid="settings-view" />
  ),
  StartupFailureView: ({ error }: { error: unknown; onRetry: () => void }) => (
    <div data-error={String(error)} data-testid="startup-failure-view" />
  ),
  VoiceConfigView: () => <div data-testid="voice-config-view" />,
}));

import { DetachedShellRoot } from "../../src/DetachedShellRoot";

describe("DetachedShellRoot", () => {
  const retryStartup = vi.fn();

  beforeEach(() => {
    retryStartup.mockReset();
    useAppMock.mockReset();
    useAppMock.mockReturnValue({
      authRequired: false,
      retryStartup,
      startupError: null,
    });
  });

  it("forces detached surface windows onto the requested desktop tab", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "plugins" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "plugins-page-view" }),
    ).toBeTruthy();
    expect(tree?.root.findAllByProps({ "data-testid": "header" }).length).toBe(
      0,
    );
    expect(
      tree?.root.findAllByProps({ "data-testid": "milady-bar" }).length,
    ).toBe(0);
  });

  it("renders focused cloud content instead of the full settings navigator", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "settings", tab: "cloud" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "cloud-dashboard" }),
    ).toBeTruthy();
    expect(
      tree?.root.findAllByProps({ "data-testid": "settings-view" }),
    ).toHaveLength(0);
  });

  it("renders focused settings sections when a detached settings tab is requested", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "settings", tab: "voice" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "voice-config-view" }),
    ).toBeTruthy();
    expect(
      tree?.root.findAllByProps({ "data-testid": "settings-view" }),
    ).toHaveLength(0);
  });

  it("falls back to the full settings view when no focused section is available", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "settings" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "settings-view" }),
    ).toBeTruthy();
  });

  it("renders the dedicated browser surface without desktop shell chrome", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "browser" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "browser-surface-window" }),
    ).toBeTruthy();
  });

  it("still shows auth and startup failures when detached shells cannot load", async () => {
    useAppMock.mockReturnValueOnce({
      authRequired: true,
      retryStartup,
      startupError: null,
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "chat" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "pairing-view" }),
    ).toBeTruthy();

    useAppMock.mockReturnValueOnce({
      authRequired: false,
      retryStartup,
      startupError: new Error("boom"),
    });

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "chat" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "startup-failure-view" }),
    ).toBeTruthy();
  });

  it("lets browser windows render even when app auth or startup is unavailable", async () => {
    useAppMock.mockReturnValueOnce({
      authRequired: true,
      retryStartup,
      startupError: null,
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "browser" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "browser-surface-window" }),
    ).toBeTruthy();

    useAppMock.mockReturnValueOnce({
      authRequired: false,
      retryStartup,
      startupError: new Error("boom"),
    });

    await act(async () => {
      tree = TestRenderer.create(
        <DetachedShellRoot route={{ mode: "surface", tab: "browser" }} />,
      );
    });

    expect(
      tree?.root.findByProps({ "data-testid": "browser-surface-window" }),
    ).toBeTruthy();
  });
});
