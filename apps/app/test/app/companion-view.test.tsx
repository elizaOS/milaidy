import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmNeedsFlip: () => false,
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm",
  getVrmTitle: (index: number) => `MILADY-${index}`,
  VRM_COUNT: 24,
}));

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: () => React.createElement("div", null, "VrmViewer"),
}));

vi.mock("../../src/components/ChatModalView.js", () => ({
  ChatModalView: () =>
    React.createElement(
      "div",
      { "data-testid": "companion-chat-modal-stub" },
      "ChatModalView",
    ),
}));

import { CompanionView } from "../../src/components/CompanionView";

function createContext() {
  return {
    setState: vi.fn(),
    selectedVrmIndex: 1,
    customVrmUrl: "",
    walletAddresses: null,
    walletBalances: null,
    walletLoading: false,
    walletError: null,
    loadBalances: vi.fn(async () => {}),
    getBscTradePreflight: vi.fn(async () => ({ ok: false, reasons: ["disabled"] })),
    getBscTradeQuote: vi.fn(async () => ({
      route: [],
      quoteIn: { amount: "0", symbol: "BNB" },
      quoteOut: { amount: "0", symbol: "BNB" },
      minReceive: { amount: "0", symbol: "BNB" },
      slippageBps: 100,
    })),
    executeBscTrade: vi.fn(async () => ({ executed: false, execution: null, requiresUserSignature: false })),
    setActionNotice: vi.fn(),
    agentStatus: { state: "running", agentName: "Milady", platform: "test", pid: null },
    cloudEnabled: false,
    cloudConnected: false,
    cloudCredits: null,
    cloudCreditsCritical: false,
    cloudCreditsLow: false,
    cloudTopUpUrl: "",
    lifecycleBusy: false,
    lifecycleAction: null,
    handlePauseResume: vi.fn(async () => {}),
    handleRestart: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    uiLanguage: "en",
    setUiLanguage: vi.fn(),
    uiShellMode: "companion",
    setUiShellMode: vi.fn(),
    setTab: vi.fn(),
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
}

function countByClass(node: TestRenderer.ReactTestInstance, className: string): number {
  return node.root.findAll((candidate) => (
    typeof candidate.props.className === "string" &&
    candidate.props.className
      .split(/\s+/)
      .includes(className)
  )).length;
}

describe("CompanionView", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  it("renders clean companion page without tomodachi status blocks", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Milady");
    expect(content).toContain("MILADY");
    expect(content).not.toContain("Mood");
    expect(content).not.toContain("Hunger");
    expect(content).not.toContain("Energy");
    expect(content).not.toContain("Social");
    expect(content).not.toContain("Control Hub");
    expect(content).toContain("Character");
  });

  it("renders a single character roster panel", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const rosterCount = countByClass(tree!, "anime-roster");
    expect(rosterCount).toBe(1);
  });

  it("navigates when hub buttons are clicked", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const skillButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Talents",
    )[0];
    expect(skillButton).toBeDefined();

    await act(async () => {
      skillButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("skills");

    const settingsButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Settings",
    )[0];
    expect(settingsButton).toBeDefined();

    await act(async () => {
      settingsButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("settings");

    const advancedButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-hub-btn") &&
        text(node).trim() === "Advanced",
    )[0];
    expect(advancedButton).toBeDefined();

    await act(async () => {
      advancedButton.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("advanced");
  });

  it("toggles character roster from top-right character header", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const characterToggle = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "character-roster-toggle",
    );
    expect(characterToggle).toBeDefined();

    const shellBefore = tree!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-character-panel-shell"),
    );
    expect(shellBefore.props.className.includes("is-open")).toBe(false);

    await act(async () => {
      characterToggle.props.onClick();
    });

    const shellAfter = tree!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-character-panel-shell"),
    );
    expect(shellAfter.props.className.includes("is-open")).toBe(true);

    const characterSettings = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "character-roster-settings",
    );
    expect(characterSettings).toBeDefined();

    await act(async () => {
      characterSettings.props.onClick();
    });
    expect(ctx.setTab).toHaveBeenCalledWith("character");
  });

  it("switches language from companion top-right toggle", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const zhToggle = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-language-zh",
    );

    await act(async () => {
      zhToggle.props.onClick();
    });
    expect(ctx.setUiLanguage).toHaveBeenCalledWith("zh-CN");

    const enToggle = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-language-en",
    );

    await act(async () => {
      enToggle.props.onClick();
    });
    expect(ctx.setUiLanguage).toHaveBeenCalledWith("en");
  });

  it("renders core companion view when snapshot is unavailable", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Milady");
    expect(content).toContain("Character");
  });

  it("toggles left chat dock from companion header", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const toggle = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props["data-testid"] === "companion-chat-toggle",
    );
    expect(toggle).toBeDefined();

    const dock = tree!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-comp-chat-dock-anchor"),
    );
    expect(dock.props.className.includes("is-open")).toBe(true);

    await act(async () => {
      toggle.props.onClick();
    });

    const dockAfter = tree!.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("anime-comp-chat-dock-anchor"),
    );
    expect(dockAfter.props.className.includes("is-open")).toBe(false);
  });
});
