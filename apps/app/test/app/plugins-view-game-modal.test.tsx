import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginInfo } from "../../src/api-client";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockHandlePluginToggle = vi.fn();
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockTestPluginConnection = vi.fn(async () => ({ success: true, durationMs: 12 }));

let narrowViewport = false;
let originalMatchMedia: typeof window.matchMedia | undefined;

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: vi.fn(),
    restartAndWait: vi.fn(),
    testPluginConnection: (...args: unknown[]) => mockTestPluginConnection(...args),
  },
}));

import { PluginsView } from "../../src/components/PluginsView";

function hasClass(node: TestRenderer.ReactTestInstance, className: string): boolean {
  if (typeof node.props.className !== "string") return false;
  return node.props.className.split(/\s+/).includes(className);
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
}

function createPlugin(id: string, name: string, category: PluginInfo["category"] = "feature"): PluginInfo {
  return {
    id,
    name,
    description: `${name} configuration plugin`,
    enabled: true,
    configured: true,
    envKey: null,
    category,
    source: "bundled",
    parameters: [
      {
        key: "API_KEY",
        type: "string",
        description: "API key",
        required: true,
        sensitive: true,
        currentValue: null,
        isSet: false,
      },
    ],
    validationErrors: [],
    validationWarnings: [],
    version: "1.0.0",
    isActive: true,
    icon: "🧩",
  };
}

function baseContext(plugins?: PluginInfo[]) {
  return {
    plugins: plugins ?? [
      createPlugin("test-plugin", "Test Plugin", "feature"),
      createPlugin("second-plugin", "Second Plugin", "feature"),
      createPlugin("discord", "Discord", "connector"),
    ],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(),
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: mockLoadPlugins,
    handlePluginToggle: mockHandlePluginToggle,
    handlePluginConfigSave: mockHandlePluginConfigSave,
    setActionNotice: mockSetActionNotice,
    setState: mockSetState,
  };
}

describe("PluginsView game modal", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset();
    mockHandlePluginToggle.mockReset();
    mockLoadPlugins.mockReset();
    mockHandlePluginConfigSave.mockReset();
    mockSetActionNotice.mockReset();
    mockSetState.mockReset();
    mockTestPluginConnection.mockReset();

    mockOnWsEvent.mockReturnValue(() => {});
    mockLoadPlugins.mockResolvedValue(undefined);
    mockHandlePluginToggle.mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockResolvedValue(undefined);
    mockTestPluginConnection.mockResolvedValue({ success: true, durationMs: 12 });
    mockUseApp.mockReturnValue(baseContext());

    narrowViewport = false;
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: narrowViewport,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("renders game modal for plugins modal and keeps connectors layout unchanged", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView, { inModal: true, mode: "all" }));
    });

    expect(tree!.root.findAll((node) => hasClass(node, "plugins-game-modal")).length).toBe(1);
    expect(tree!.root.findAll((node) => hasClass(node, "conn-master-detail")).length).toBe(0);

    await act(async () => {
      tree!.update(React.createElement(PluginsView, { inModal: true, mode: "connectors" }));
    });
    expect(tree!.root.findAll((node) => hasClass(node, "conn-master-detail")).length).toBe(1);
    expect(tree!.root.findAll((node) => hasClass(node, "plugins-game-modal")).length).toBe(0);
  });

  it("uses list/detail mobile panes on narrow viewport", async () => {
    narrowViewport = true;
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView, { inModal: true, mode: "all" }));
    });

    const getListPane = () => tree!.root.findAll((node) => hasClass(node, "plugins-game-list-panel"))[0];
    const getDetailPane = () => tree!.root.findAll((node) => hasClass(node, "plugins-game-detail-panel"))[0];
    const firstCard = tree!.root.findAll((node) => hasClass(node, "plugins-game-card"))[0];

    expect(getListPane().props.className.includes("is-hidden")).toBe(false);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(true);

    await act(async () => {
      firstCard.props.onClick();
    });

    expect(getListPane().props.className.includes("is-hidden")).toBe(true);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(false);

    const backButton = tree!.root.findAll((node) => hasClass(node, "plugins-game-back-btn"))[0];
    await act(async () => {
      backButton.props.onClick();
    });

    expect(getListPane().props.className.includes("is-hidden")).toBe(false);
    expect(getDetailPane().props.className.includes("is-hidden")).toBe(true);
  });

  it("re-selects the first visible plugin when the selected one is filtered out", async () => {
    const state = baseContext([
      createPlugin("alpha-plugin", "Alpha Plugin", "feature"),
      createPlugin("bravo-plugin", "Bravo Plugin", "feature"),
    ]);
    mockUseApp.mockImplementation(() => state);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView, { inModal: true, mode: "all" }));
    });

    const cards = tree!.root.findAll((node) => hasClass(node, "plugins-game-card"));
    await act(async () => {
      cards[1].props.onClick();
    });
    expect(text(tree!.root).includes("Bravo Plugin")).toBe(true);

    state.pluginSearch = "Alpha";
    await act(async () => {
      tree!.update(React.createElement(PluginsView, { inModal: true, mode: "all" }));
    });

    expect(text(tree!.root).includes("Alpha Plugin")).toBe(true);
    expect(text(tree!.root).includes("Bravo Plugin configuration plugin")).toBe(false);
  });

  it("keeps detail actions wired in game modal", async () => {
    mockUseApp.mockReturnValue(baseContext([createPlugin("test-plugin", "Test Plugin", "feature")]));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView, { inModal: true, mode: "all" }));
    });

    const toggle = tree!.root.findAll((node) => hasClass(node, "plugins-game-toggle"))[0];
    expect(toggle).toBeDefined();

    const testConnectionBtn = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("plugins-game-action-btn") &&
        text(node).includes("Test Connection"),
    )[0];
    await act(async () => {
      await testConnectionBtn.props.onClick();
    });
    expect(mockTestPluginConnection).toHaveBeenCalledWith("test-plugin");

    const saveBtn = tree!.root.findAll((node) => hasClass(node, "plugins-game-save-btn"))[0];
    await act(async () => {
      await saveBtn.props.onClick();
    });
    expect(mockHandlePluginConfigSave).toHaveBeenCalledWith("test-plugin", {});
  });
});
