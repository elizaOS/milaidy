// @vitest-environment jsdom

/**
 * Shell-mode switching E2E test.
 *
 * Verifies that:
 * 1. Every view renders valid content in NATIVE shell mode.
 * 2. Only the companion tab uses COMPANION shell; settings/skills/etc. use native layout.
 * 3. Switching from native → companion → native produces valid output each time.
 * 4. No console errors or unexpected warnings are emitted during any transition.
 */

import type { Tab } from "@milady/app-core/navigation";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, noop } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  noop: vi.fn(),
  sceneHostState: {
    activeHistory: [] as boolean[],
    mounts: 0,
    unmounts: 0,
  },
}));

/* ── Mock every leaf component ────────────────────────────────────── */

vi.mock("@milady/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getVrmUrl: vi.fn(() => "mock-vrm-url"),
  getVrmPreviewUrl: vi.fn(() => "mock-vrm-preview"),
  getVrmBackgroundUrl: vi.fn(() => "mock-vrm-bg"),
}));

vi.mock("@milady/app-core/components", async () => {
  const actual = await vi.importActual<
    typeof import("@milady/app-core/components")
  >("@milady/app-core/components");
  return {
    ...actual,
    AppsPageView: () =>
      React.createElement("section", null, "AppsPageView Ready"),
    BugReportModal: () => React.createElement("div", null, "BugReportModal"),
    CloudDashboard: () =>
      React.createElement("section", null, "MiladyCloudDashboard Ready"),
    CommandPalette: () => React.createElement("div", null, "CommandPalette"),
    ConnectorsPageView: () =>
      React.createElement("section", null, "ConnectorsPageView Ready"),
    EmotePicker: () => React.createElement("div", null, "EmotePicker"),
    ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    HeartbeatsView: () =>
      React.createElement("section", null, "HeartbeatsView Ready"),
    PairingView: () => React.createElement("div", null, "PairingView"),
    PluginsPageView: () =>
      React.createElement("section", null, "PluginsPageView Ready"),
    PluginsView: () =>
      React.createElement("section", null, "PluginsView Ready"),
    SaveCommandModal: () =>
      React.createElement("div", null, "SaveCommandModal"),
    ConnectionFailedBanner: () =>
      React.createElement("div", null, "ConnectionFailedBanner"),
    SettingsView: () =>
      React.createElement("section", null, "SettingsView Ready"),
    SkillsView: () => React.createElement("section", null, "SkillsView Ready"),
    SystemWarningBanner: () =>
      React.createElement("div", null, "SystemWarningBanner"),
  };
});

vi.mock("../../src/components/Header", () => ({
  Header: () => React.createElement("header", null, "Header"),
}));

vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));

vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));

vi.mock("../../src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));

vi.mock("../../src/components/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));

vi.mock("../../src/components/ChatView", () => ({
  ChatView: () => React.createElement("section", null, "ChatView Ready"),
}));

vi.mock("../../src/components/StreamView", () => ({
  StreamView: () => React.createElement("section", null, "StreamView Ready"),
}));

vi.mock("../../src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("aside", null, "ConversationsSidebar"),
}));

vi.mock("../../src/components/CustomActionsPanel", () => ({
  CustomActionsPanel: () =>
    React.createElement("aside", null, "CustomActionsPanel"),
}));

vi.mock("../../src/components/CustomActionEditor", () => ({
  CustomActionEditor: () =>
    React.createElement("aside", null, "CustomActionEditor"),
}));

vi.mock("../../src/components/AppsPageView", () => ({
  AppsPageView: () =>
    React.createElement("section", null, "AppsPageView Ready"),
}));

vi.mock("../../src/components/CharacterView", () => ({
  CharacterView: () =>
    React.createElement("section", null, "CharacterView Ready"),
}));

vi.mock("../../src/components/AdvancedPageView", () => ({
  AdvancedPageView: () =>
    React.createElement("section", null, "AdvancedPageView Ready"),
}));

vi.mock("../../src/components/CompanionView", () => ({
  CompanionView: () =>
    React.createElement("section", null, "CompanionView Ready"),
}));

vi.mock("../../src/components/companion/CompanionSceneHost", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    SharedCompanionScene: ({
      active,
      children,
    }: {
      active: boolean;
      children: React.ReactNode;
    }) => {
      const { useEffect } = React;
      useEffect(() => {
        sceneHostState.mounts += 1;
        return () => {
          sceneHostState.unmounts += 1;
        };
      }, []);
      sceneHostState.activeHistory.push(active);
      return React.createElement(React.Fragment, null, children);
    },
    CompanionSceneHost: () => null,
    useSharedCompanionScene: () => true,
  };
});

vi.mock("../../src/components/companion/VrmStage", () => ({
  VrmStage: () => React.createElement("div", null, "VrmStage Ready"),
}));

vi.mock("../../src/components/TriggersView", () => ({
  TriggersView: () =>
    React.createElement("section", null, "TriggersView Ready"),
}));

vi.mock("../../src/components/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("section", null, "ConnectorsPageView Ready"),
}));

vi.mock("../../src/components/InventoryView", () => ({
  InventoryView: () =>
    React.createElement("section", null, "InventoryView Ready"),
}));

vi.mock("../../src/components/KnowledgeView", () => ({
  KnowledgeView: () =>
    React.createElement("section", null, "KnowledgeView Ready"),
}));

vi.mock("../../src/components/avatar/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));

vi.mock("../../src/components/PluginsPageView", () => ({
  PluginsPageView: () =>
    React.createElement("section", null, "PluginsPageView Ready"),
}));

vi.mock("../../src/components/PluginsView", () => ({
  PluginsView: () => React.createElement("section", null, "PluginsView Ready"),
}));

vi.mock("../../src/components/SkillsView", () => ({
  SkillsView: () => React.createElement("section", null, "SkillsView Ready"),
}));

vi.mock("../../src/components/CustomActionsView", () => ({
  CustomActionsView: () =>
    React.createElement("section", null, "CustomActionsView Ready"),
}));

vi.mock("../../src/components/FineTuningView", () => ({
  FineTuningView: () =>
    React.createElement("section", null, "FineTuningView Ready"),
}));

vi.mock("../../src/components/TrajectoriesView", () => ({
  TrajectoriesView: () =>
    React.createElement("section", null, "TrajectoriesView Ready"),
}));

vi.mock("../../src/components/TrajectoryDetailView", () => ({
  TrajectoryDetailView: () =>
    React.createElement("section", null, "TrajectoryDetailView Ready"),
}));

vi.mock("../../src/components/LifoSandboxView", () => ({
  LifoSandboxView: () =>
    React.createElement("section", null, "LifoSandboxView Ready"),
}));

vi.mock("@milady/app-core/hooks", async () => {
  const actual = await vi.importActual<typeof import("@milady/app-core/hooks")>(
    "@milady/app-core/hooks",
  );
  return {
    ...actual,
    useContextMenu: () => ({
      saveCommandModalOpen: false,
      saveCommandText: "",
      confirmSaveCommand: noop,
      closeSaveCommandModal: noop,
    }),
  };
});

import { App } from "../../src/App";

/* ── Harness state ────────────────────────────────────────────────── */

type HarnessState = {
  onboardingLoading: boolean;
  authRequired: boolean;
  onboardingComplete: boolean;
  tab: Tab;
  uiShellMode: "native" | "companion";
  actionNotice: null;
  setTab: (tab: Tab) => void;
  setUiShellMode: (mode: "native" | "companion") => void;
  [key: string]: unknown;
};

function tFn(k: string): string {
  const labels: Record<string, string> = {
    "nav.chat": "Chat",
    "nav.companion": "Companion",
    "nav.stream": "Stream",
    "nav.character": "Character",
    "nav.wallets": "Wallets",
    "nav.knowledge": "Knowledge",
    "nav.social": "Social",
    "nav.apps": "Apps",
    "nav.settings": "Settings",
    "nav.heartbeats": "Heartbeats",
    "nav.advanced": "Advanced",
    "nav.cloud": "Cloud",
    "nav.plugins": "Plugins",
    "nav.skills": "Skills",
    "nav.channels": "Channels",
    "nav.talents": "Talents",
    "companion.switchToNativeUi": "Switch to native UI",
    "companion.zoomIn": "Zoom in",
    "companion.zoomOut": "Zoom out",
  };
  return labels[k] ?? k;
}

function makeState(overrides?: Partial<HarnessState>): HarnessState {
  const state: HarnessState = {
    t: tFn,
    onboardingLoading: false,
    authRequired: false,
    onboardingComplete: true,
    tab: "chat",
    actionNotice: null,
    plugins: [],
    uiShellMode: "native",
    setUiShellMode: vi.fn((mode: "native" | "companion") => {
      state.uiShellMode = mode;
    }),
    uiLanguage: "en",
    agentStatus: { state: "running", agentName: "Milady" },
    loadDropStatus: vi.fn(),
    unreadConversations: new Set(),
    activeGameViewerUrl: null,
    gameOverlayEnabled: false,
    startupPhase: "ready",
    startupError: null,
    retryStartup: vi.fn(),
    setActionNotice: vi.fn(),
    setTab: (tab: Tab) => {
      state.tab = tab;
    },
    ...overrides,
  };
  return state;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function expectValidContent(content: string): void {
  expect(content.trim().length).toBeGreaterThan(0);
  const invalidPatterns = [
    /\bundefined\b/i,
    /\bnull\b/i,
    /\bnan\b/i,
    /\btypeerror\b/i,
    /\breferenceerror\b/i,
    /\berror:\b/i,
  ];
  for (const pattern of invalidPatterns) {
    expect(pattern.test(content)).toBe(false);
  }
}

function filterRealErrors(spy: ReturnType<typeof vi.spyOn>): Array<unknown[]> {
  return spy.mock.calls.filter((args) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    return (
      !msg.includes("react-test-renderer is deprecated") &&
      !msg.includes(
        "The current testing environment is not configured to support act(...)",
      ) &&
      !msg.startsWith("ERROR:")
    );
  });
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("shell mode switching (e2e)", () => {
  let state: HarnessState;

  beforeEach(() => {
    state = makeState();
    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => state);
    sceneHostState.activeHistory = [];
    sceneHostState.mounts = 0;
    sceneHostState.unmounts = 0;
  });

  // --- Native shell: every tab renders valid content ---

  it("renders every tab in NATIVE shell mode with valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    state.uiShellMode = "native";

    const nativeTabs: Array<{ tab: Tab; token: string }> = [
      { tab: "chat", token: "ChatView Ready" },
      { tab: "companion", token: "CompanionView Ready" },
      { tab: "character", token: "CharacterView Ready" },
      { tab: "wallets", token: "InventoryView Ready" },
      { tab: "knowledge", token: "KnowledgeView Ready" },
      { tab: "connectors", token: "ConnectorsPageView Ready" },
      { tab: "triggers", token: "HeartbeatsView Ready" },
      // All advanced sub-tabs route through AdvancedPageView in ViewRouter
      { tab: "plugins", token: "AdvancedPageView Ready" },
      { tab: "skills", token: "AdvancedPageView Ready" },
      { tab: "settings", token: "SettingsView Ready" },
      { tab: "advanced", token: "AdvancedPageView Ready" },
      { tab: "fine-tuning", token: "AdvancedPageView Ready" },
      { tab: "trajectories", token: "AdvancedPageView Ready" },
      { tab: "runtime", token: "AdvancedPageView Ready" },
      { tab: "database", token: "AdvancedPageView Ready" },
      { tab: "logs", token: "AdvancedPageView Ready" },
      { tab: "lifo", token: "AdvancedPageView Ready" },
    ];

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    for (const { tab, token } of nativeTabs) {
      state.tab = tab;
      await act(async () => {
        tree?.update(React.createElement(App));
      });
      const text = textOf(tree.root);
      expect(text).toContain(token);
      expectValidContent(text);
    }

    expect(filterRealErrors(errorSpy).length).toBe(0);
    expect(
      warnSpy.mock.calls.filter(
        (args) =>
          !(typeof args[0] === "string" && args[0].includes("[RenderGuard]")),
      ).length,
    ).toBe(0);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Companion shell: only companion tab uses companion shell; others use native ---

  it("renders companion tab in COMPANION shell mode; other tabs use native layout", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    state.uiShellMode = "companion";

    // Only companion tab stays in companion shell
    state.tab = "companion";
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    let text = textOf(tree.root);
    expect(text).toContain("CompanionView Ready");
    expect(text).not.toContain("Header");
    expectValidContent(text);

    // Settings/skills/etc. in companion mode fall back to native layout
    const nativeFallbackCases: Array<{ tab: Tab; token: string }> = [
      { tab: "settings", token: "SettingsView Ready" },
      { tab: "triggers", token: "HeartbeatsView Ready" },
      { tab: "skills", token: "AdvancedPageView Ready" },
      { tab: "character", token: "CharacterView Ready" },
    ];

    for (const { tab, token } of nativeFallbackCases) {
      state.tab = tab;
      await act(async () => {
        tree?.update(React.createElement(App));
      });
      text = textOf(tree.root);
      expect(text).toContain("Header");
      expect(text).toContain(token);
      expectValidContent(text);
    }

    expect(filterRealErrors(errorSpy).length).toBe(0);
    expect(
      warnSpy.mock.calls.filter(
        (args) =>
          !(typeof args[0] === "string" && args[0].includes("[RenderGuard]")),
      ).length,
    ).toBe(0);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Switch native → companion → native, checking content at each step ---

  it("switches from native to companion and back without rendering errors", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    let tree: TestRenderer.ReactTestRenderer | null = null;

    // 1. Start in native mode on chat
    state.uiShellMode = "native";
    state.tab = "chat";
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    let text = textOf(tree.root);
    expect(text).toContain("ChatView Ready");
    expect(text).toContain("Header");
    expectValidContent(text);

    // 2. Navigate to settings in native mode
    state.tab = "settings";
    await act(async () => {
      tree?.update(React.createElement(App));
    });
    text = textOf(tree.root);
    expect(text).toContain("SettingsView Ready");
    expect(text).toContain("Header");
    expectValidContent(text);

    // 3. Switch to companion mode
    state.uiShellMode = "companion";
    state.tab = "companion";
    await act(async () => {
      tree?.update(React.createElement(App));
    });
    text = textOf(tree.root);
    expect(text).toContain("CompanionView Ready");
    // Companion mode should NOT render the native Header
    expect(text).not.toContain("Header");
    expectValidContent(text);

    // 4. Navigate to skills in companion mode — falls back to native layout
    state.tab = "skills";
    await act(async () => {
      tree?.update(React.createElement(App));
    });
    text = textOf(tree.root);
    expect(text).toContain("Header");
    expect(text).toContain("AdvancedPageView Ready");
    expectValidContent(text);

    // 5. Navigate to settings in companion mode — falls back to native layout
    state.tab = "settings";
    await act(async () => {
      tree?.update(React.createElement(App));
    });
    text = textOf(tree.root);
    expect(text).toContain("Header");
    expect(text).toContain("SettingsView Ready");
    expectValidContent(text);

    // 6. Switch back to native mode
    state.uiShellMode = "native";
    state.tab = "chat";
    await act(async () => {
      tree?.update(React.createElement(App));
    });
    text = textOf(tree.root);
    expect(text).toContain("ChatView Ready");
    expect(text).toContain("Header");
    expectValidContent(text);

    // 7. Navigate through several native tabs to verify no stale companion state
    for (const nextTab of [
      "character",
      "wallets",
      "plugins",
      "settings",
    ] as Tab[]) {
      state.tab = nextTab;
      await act(async () => {
        tree?.update(React.createElement(App));
      });
      text = textOf(tree.root);
      expect(text).toContain("Header");
      expectValidContent(text);
    }

    expect(filterRealErrors(errorSpy).length).toBe(0);
    expect(
      warnSpy.mock.calls.filter(
        (args) =>
          !(typeof args[0] === "string" && args[0].includes("[RenderGuard]")),
      ).length,
    ).toBe(0);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Rapid tab switching in companion mode ---

  it("handles rapid tab switching in companion mode without errors", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    state.uiShellMode = "companion";
    state.tab = "companion";

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    // Rapid-fire: companion stays in CompanionShell; others show native layout
    const rapidTabs: Tab[] = [
      "companion",
      "skills",
      "companion",
      "settings",
      "companion",
    ];

    for (const tab of rapidTabs) {
      state.tab = tab;
      await act(async () => {
        tree?.update(React.createElement(App));
      });
      const text = textOf(tree.root);
      expectValidContent(text);
    }

    expect(filterRealErrors(errorSpy).length).toBe(0);
    expect(
      warnSpy.mock.calls.filter(
        (args) =>
          !(typeof args[0] === "string" && args[0].includes("[RenderGuard]")),
      ).length,
    ).toBe(0);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Mode toggle back and forth multiple times ---

  it("toggles shell mode multiple times without stale rendering", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    let tree: TestRenderer.ReactTestRenderer | null = null;
    state.tab = "chat";
    state.uiShellMode = "native";
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    // Toggle 5 times
    for (let i = 0; i < 5; i++) {
      const isCompanion = i % 2 === 0;
      state.uiShellMode = isCompanion ? "companion" : "native";
      state.tab = isCompanion ? "companion" : "chat";
      await act(async () => {
        tree?.update(React.createElement(App));
      });
      const text = textOf(tree.root);
      if (isCompanion) {
        expect(text).toContain("CompanionView Ready");
        expect(text).not.toContain("Header");
      } else {
        expect(text).toContain("ChatView Ready");
        expect(text).toContain("Header");
      }
      expectValidContent(text);
    }

    expect(filterRealErrors(errorSpy).length).toBe(0);
    expect(
      warnSpy.mock.calls.filter(
        (args) =>
          !(typeof args[0] === "string" && args[0].includes("[RenderGuard]")),
      ).length,
    ).toBe(0);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("keeps the shared companion scene mounted while shell mode changes", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    state.uiShellMode = "native";
    state.tab = "chat";
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    if (!tree) throw new Error("failed to render App");

    state.uiShellMode = "companion";
    state.tab = "companion";
    await act(async () => {
      tree?.update(React.createElement(App));
    });

    state.uiShellMode = "native";
    state.tab = "chat";
    await act(async () => {
      tree?.update(React.createElement(App));
    });

    expect(sceneHostState.mounts).toBe(1);
    expect(sceneHostState.unmounts).toBe(0);
    expect(sceneHostState.activeHistory).toEqual([false, true, false]);
  });
});
