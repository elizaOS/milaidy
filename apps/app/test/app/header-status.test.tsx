// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@milady/app-core/hooks", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("../../src/hooks/useBugReport", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

vi.mock("../../src/components/shared/AgentModeDropdown", () => ({
  AgentModeDropdown: () =>
    React.createElement("div", null, "AgentModeDropdown"),
}));

vi.mock("@milady/app-core/navigation", () => ({
  getTabGroups: () => [
    {
      label: "Chat",
      tabs: ["chat"],
      icon: () => React.createElement("span", null, "💬"),
      description: "Chat",
    },
  ],
}));

vi.mock("@milady/app-core/components", () => ({
  LanguageDropdown: () => React.createElement("div", null, "LanguageDropdown"),
}));

vi.mock("@milady/ui", () => ({
  IconTooltip: ({
    children,
  }: {
    children: React.ReactNode;
    content?: string;
    side?: string;
  }) => React.createElement("div", null, children),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "⚠"),
  Bug: () => React.createElement("span", null, "🐛"),
  CircleDollarSign: () => React.createElement("span", null, "💰"),
  Menu: () => React.createElement("span", null, "☰"),
  Monitor: () => React.createElement("span", null, "🖥"),
  Smartphone: () => React.createElement("span", null, "📱"),
  X: () => React.createElement("span", null, "✕"),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("header status", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      t: (k: string) => k,
      agentStatus: {
        state: "running",
        agentName: "Milady",
        model: undefined,
        startedAt: undefined,
        uptime: undefined,
      },
      miladyCloudEnabled: false,
      miladyCloudConnected: false,
      miladyCloudCredits: null,
      miladyCloudCreditsCritical: false,
      miladyCloudCreditsLow: false,
      miladyCloudTopUpUrl: "",
      walletAddresses: null,
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      tab: "chat",
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
      plugins: [],
      uiShellMode: "native",
      setUiShellMode: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("renders agent name via data-testid", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });
    expect(tree).toBeDefined();
    const agentName = tree?.root.findByProps({ "data-testid": "agent-name" });
    expect(agentName).toBeDefined();
    expect(agentName?.children).toContain("Milady");
  });

  it("renders shell toggle button", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });
    expect(tree).toBeDefined();
    const shellToggle = tree?.root.findByProps({
      "data-testid": "ui-shell-toggle",
    });
    expect(shellToggle).toBeDefined();
  });

  it("renders bug report button with aria-label", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });
    expect(tree).toBeDefined();
    const bugButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "header.reportBug",
    );
    expect(bugButton?.length).toBeGreaterThan(0);
  });
});
