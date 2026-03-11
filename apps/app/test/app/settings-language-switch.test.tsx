import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    getOnboardingOptions: vi.fn(),
    getConfig: vi.fn(),
  },
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  THEMES: [
    { id: "milady", label: "Milady", hint: "default" },
    { id: "qt314", label: "QT314", hint: "pink" },
  ],
}));

vi.mock("@milady/app-core/api", () => ({
  client: mockClient,
}));

vi.mock("../../src/components/ConfigPageView", () => ({
  ConfigPageView: () => null,
}));

vi.mock("../../src/components/config-renderer", () => ({
  ConfigRenderer: () => null,
  defaultRegistry: {},
}));

vi.mock("../../src/components/MediaSettingsSection", () => ({
  MediaSettingsSection: () => null,
}));

vi.mock("../../src/components/VoiceConfigView", () => ({
  VoiceConfigView: () => null,
}));

vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsSection: () => null,
}));

import { SettingsView } from "../../src/components/SettingsView";

function createSettingsContext(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    t: (k: string) => k,
    miladyCloudEnabled: false,
    miladyCloudConnected: false,
    miladyCloudCredits: null,
    miladyCloudCreditsLow: false,
    miladyCloudCreditsCritical: false,
    miladyCloudTopUpUrl: "",
    miladyCloudUserId: "",
    miladyCloudLoginBusy: false,
    miladyCloudLoginError: "",
    cloudDisconnecting: false,
    plugins: [],
    pluginSaving: false,
    pluginSaveSuccess: false,
    currentTheme: "milady",
    uiLanguage: "en",
    updateStatus: null,
    updateLoading: false,
    updateChannelSaving: false,
    extensionStatus: null,
    extensionChecking: false,
    walletExportVisible: false,
    walletExportData: null,
    exportBusy: false,
    exportPassword: "",
    exportIncludeLogs: false,
    exportError: "",
    exportSuccess: "",
    importBusy: false,
    importPassword: "",
    importError: "",
    importSuccess: "",
    loadPlugins: vi.fn(async () => {}),
    handlePluginToggle: vi.fn(async () => {}),
    setTheme: vi.fn(),
    setUiLanguage: vi.fn(),
    setTab: vi.fn(),
    loadUpdateStatus: vi.fn(async () => {}),
    handleChannelChange: vi.fn(async () => {}),
    checkExtensionStatus: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(async () => {}),
    handleAgentExport: vi.fn(async () => {}),
    handleAgentImport: vi.fn(async () => {}),
    handleCloudLogin: vi.fn(async () => {}),
    handleCloudDisconnect: vi.fn(async () => {}),
    handleReset: vi.fn(async () => {}),
    handleExportKeys: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    setActionNotice: vi.fn(),
    setState: vi.fn(),
    ...overrides,
  };
}

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child)))
    .join("");
}

describe("Settings language switch", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    mockUseApp.mockReset();
    mockClient.getOnboardingOptions.mockReset();
    mockClient.getConfig.mockReset();
    class MockIntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    Object.defineProperty(globalThis, "IntersectionObserver", {
      value: MockIntersectionObserver,
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {
        getElementById: () => null,
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: { protocol: "http:" },
      },
      configurable: true,
    });
    mockClient.getOnboardingOptions.mockResolvedValue({
      models: { small: [], large: [] },
      providers: [],
      cloudProviders: [],
      names: [],
      styles: [],
      inventoryProviders: [],
      openrouterModels: [],
      piModels: [],
      piDefaultModel: "",
    });
    mockClient.getConfig.mockResolvedValue({});
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  it("calls setUiLanguage and applies localized labels on rerender", async () => {
    const ctxEn = createSettingsContext();
    mockUseApp.mockReturnValue(ctxEn);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(SettingsView));
    });

    const zhButton = tree?.root.find(
      (node) => node.type === "button" && nodeText(node).includes("中文"),
    );
    expect(zhButton).toBeDefined();

    await act(async () => {
      zhButton.props.onClick();
    });

    expect(ctxEn.setUiLanguage).toHaveBeenCalledWith("zh-CN");

    mockUseApp.mockReturnValue(createSettingsContext({ uiLanguage: "zh-CN" }));
    await act(async () => {
      tree?.update(React.createElement(SettingsView));
    });

    const allText = nodeText(tree?.root);
    expect(allText).toContain("nav.settings");
    expect(allText).toContain("settings.language");
  });
});
