import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { CompanionStateSnapshot } from "../../src/api-client";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm",
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
    companionActivity: snapshot?.state.activity ?? [],
    companionLoading: false,
    companionActionBusy: false,
    loadCompanion: vi.fn(async () => {}),
    refreshCompanionActivity: vi.fn(async () => {}),
    runCompanionAction: vi.fn(async () => {}),
    updateCompanionSettings: vi.fn(async () => {}),
    setState: vi.fn(),
    selectedVrmIndex: 1,
    customVrmUrl: "",
    copyToClipboard: vi.fn(async () => {}),
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
}

describe("CompanionView", () => {
  it("renders game-style companion sections and autopost summary", async () => {
    mockUseApp.mockReturnValue(createContext(createSnapshot()));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Companion Console");
    expect(content).toContain("Agent Companion");
    expect(content).toContain("Character Roster");
    expect(content).toContain("Mood");
    expect(content).toContain("Hunger");
    expect(content).toContain("Energy");
    expect(content).toContain("Social");
    expect(content).toContain("Autopost today: 2/6");
    expect(content).toContain("Control Hub");
  });

  it("disables action buttons when cooldown is active", async () => {
    mockUseApp.mockReturnValue(createContext(createSnapshot()));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const feedButton = tree!.root.findAll(
      (node) => node.type === "button" && node.props["data-testid"] === "companion-action-feed",
    )[0];
    expect(feedButton).toBeDefined();
    expect(feedButton.props.disabled).toBe(true);
  });

  it("opens control drawer and saves settings", async () => {
    const ctx = createContext(createSnapshot());
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const hubButton = tree!.root.findAll(
      (node) => node.type === "button" && text(node).trim() === "Control Hub",
    )[0];
    expect(hubButton).toBeDefined();

    await act(async () => {
      hubButton.props.onClick();
    });

    const drawer = tree!.root.findAll(
      (node) =>
        node.type === "aside" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("companion-game__drawer"),
    )[0];
    expect(drawer.props.className.includes("is-open")).toBe(true);

    const saveButton = tree!.root.findAll(
      (node) => node.type === "button" && text(node).trim() === "Save Settings",
    )[0];
    expect(saveButton).toBeDefined();

    await act(async () => {
      await saveButton.props.onClick();
    });
    expect(ctx.updateCompanionSettings).toHaveBeenCalledTimes(1);
  });

  it("shows retry state when snapshot is unavailable", async () => {
    mockUseApp.mockReturnValue(createContext(null));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree!.root);
    expect(content).toContain("Companion state is not available.");
    expect(content).toContain("Retry");
  });
});
