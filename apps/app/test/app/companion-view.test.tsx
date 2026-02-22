import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanionStateSnapshot } from "../../src/api-client";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm",
  getVrmTitle: (index: number) => `MILADY-${index}`,
  VRM_COUNT: 24,
}));

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: () => React.createElement("div", null, "VrmViewer"),
}));

import { CompanionView } from "../../src/components/CompanionView";

function createSnapshot(overrides?: Partial<CompanionStateSnapshot>): CompanionStateSnapshot {
  const base: CompanionStateSnapshot = {
    moodTier: "calm",
    nextLevelXp: 150,
    thresholds: {
      softPenalty: false,
      autopostEligible: true,
      reasons: [],
    },
    today: {
      timezone: "UTC",
      dayKey: "2026-02-16",
      chatCount: 3,
      chatCap: 40,
      externalCount: 1,
      externalCap: 30,
      manualShareCount: 1,
      manualShareCap: 2,
      autoPostCount: 2,
      autoPostCap: 6,
    },
    evolutionStage: {
      id: "baby",
      label: "Seed",
      description: "Newly awakened companion.",
    },
    state: {
      version: 1,
      stats: {
        mood: 70,
        hunger: 65,
        energy: 62,
        social: 58,
      },
      xp: 33,
      level: 3,
      streakDays: 2,
      lastAppliedAtMs: Date.now(),
      cooldowns: {
        feedAvailableAtMs: Date.now() + 30_000,
        restAvailableAtMs: Date.now() + 60_000,
        manualShareAvailableAtMs: Date.now() + 120_000,
      },
      daily: {
        dayKey: "2026-02-16",
        timezone: "UTC",
        chatCount: 3,
        externalCount: 1,
        manualShareCount: 1,
        autoPostCount: 2,
        lastResetAtMs: Date.now(),
      },
      autopost: {
        enabled: true,
        dryRun: true,
        policyLevel: "balanced",
        quietHoursStart: 1,
        quietHoursEnd: 8,
        maxPostsPerDay: 6,
        intervalMinutes: 240,
        jitterMinutes: 20,
        nextAttemptAtMs: Date.now() + 60_000,
        pauseUntilMs: null,
        failureWindowStartMs: null,
        failureCountInWindow: 0,
        lastAttemptAtMs: null,
        lastSuccessAtMs: null,
        recentPostHashes: [],
      },
      activity: [
        {
          id: "evt-1",
          ts: Date.now(),
          kind: "signal",
          message: "Chat interaction reward applied.",
        },
      ],
    },
  };

  return {
    ...base,
    ...overrides,
    state: {
      ...base.state,
      ...(overrides?.state ?? {}),
      stats: {
        ...base.state.stats,
        ...(overrides?.state?.stats ?? {}),
      },
      cooldowns: {
        ...base.state.cooldowns,
        ...(overrides?.state?.cooldowns ?? {}),
      },
      autopost: {
        ...base.state.autopost,
        ...(overrides?.state?.autopost ?? {}),
      },
    },
    today: {
      ...base.today,
      ...(overrides?.today ?? {}),
    },
    thresholds: {
      ...base.thresholds,
      ...(overrides?.thresholds ?? {}),
    },
  };
}

function createContext(snapshot: CompanionStateSnapshot | null) {
  return {
    companionSnapshot: snapshot,
    loadCompanion: vi.fn(async () => {}),
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
    mockUseApp.mockReturnValue(createContext(createSnapshot()));

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
    mockUseApp.mockReturnValue(createContext(createSnapshot()));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const rosterCount = countByClass(tree!, "anime-roster");
    expect(rosterCount).toBe(1);
  });

  it("navigates when hub buttons are clicked", async () => {
    const ctx = createContext(createSnapshot());
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
    const ctx = createContext(createSnapshot());
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

  it("renders core companion view when snapshot is unavailable", async () => {
    mockUseApp.mockReturnValue(createContext(null));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Milady");
    expect(content).toContain("Character");
    expect(content).not.toContain("Companion is not available yet.");
  });
});
