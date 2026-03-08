// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockUseBugReport, mockUseTabNavigation } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBugReport: vi.fn(() => ({ open: vi.fn() })),
  mockUseTabNavigation: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks/useBugReport", () => ({
  useBugReport: () => mockUseBugReport(),
  BugReportProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/hooks/useTabNavigation", () => ({
  useTabNavigation: () => mockUseTabNavigation(),
}));

import { CommandPalette } from "../../src/components/CommandPalette";

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : text(child as TestRenderer.ReactTestInstance),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function createContext(overrides?: Record<string, unknown>) {
  return {
    agentStatus: { state: "running" },
    closeCommandPalette: vi.fn(),
    commandActiveIndex: 0,
    commandPaletteOpen: true,
    commandQuery: "",
    handleChatClear: vi.fn(),
    handlePauseResume: vi.fn(),
    handleRestart: vi.fn(),
    handleStart: vi.fn(),
    loadLogs: vi.fn(),
    loadPlugins: vi.fn(),
    loadSkills: vi.fn(),
    loadWorkbench: vi.fn(),
    setState: vi.fn(),
    ...overrides,
  };
}

function createNavigationMock(overrides?: Record<string, unknown>) {
  return {
    activeTab: "chat",
    navGroups: [],
    navigateToTab: vi.fn(),
    persistShellPanels: vi.fn(),
    quickActions: [
      {
        aliases: ["quiet mode"],
        available: true,
        dataTestId: "quick-action-mute-voice-pause-agent",
        hint: "Silence playback and pause the agent if it is running",
        id: "mute-voice-pause-agent",
        keywords: ["voice", "audio", "pause"],
        label: "Mute voice + pause agent",
        run: vi.fn(async () => {}),
      },
    ],
    restoreShellPanels: vi.fn(() => ({
      mobileAutonomousOpen: false,
      mobileConversationsOpen: false,
      mobileNavOpen: false,
    })),
    runQuickAction: vi.fn(async () => {}),
    streamEnabled: false,
    tabs: [
      {
        aliases: ["conversation"],
        id: "chat",
        keywords: ["messages"],
        navGroup: "chat",
        paletteLabel: "Open Chat",
        path: "/chat",
        restoreKey: "milady:shell-panels:chat",
        title: "Chat",
      },
      {
        aliases: ["console"],
        id: "logs",
        keywords: ["errors"],
        navGroup: "advanced",
        paletteLabel: "Open Logs",
        path: "/logs",
        restoreKey: "milady:shell-panels:logs",
        title: "Logs",
      },
    ],
    ...overrides,
  };
}

let addListenerSpy: ReturnType<typeof vi.spyOn>;

function getWindowKeydownHandler(): (e: KeyboardEvent) => void {
  const keydownCall = addListenerSpy.mock.calls.find(
    (call: unknown[]) => call[0] === "keydown",
  );
  if (!keydownCall || typeof keydownCall[1] !== "function") {
    throw new Error("Expected keydown listener to be registered");
  }
  return keydownCall[1] as (e: KeyboardEvent) => void;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseApp.mockReset();
    mockUseBugReport.mockClear();
    mockUseTabNavigation.mockReset();
    vi.restoreAllMocks();
    addListenerSpy = vi.spyOn(window, "addEventListener");
  });

  it("renders registry-backed tab commands and quick actions", () => {
    mockUseApp.mockReturnValue(createContext());
    mockUseTabNavigation.mockReturnValue(createNavigationMock());

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(CommandPalette));
    });

    const commandButtons = tree.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props["data-testid"] === "string" &&
        /^(palette-command|quick-action-)/.test(
          String(node.props["data-testid"]),
        ),
    );

    const labels = commandButtons.map((node) => text(node)).join(" ");

    expect(labels).toContain("Open Chat");
    expect(labels).toContain("Open Logs");
    expect(labels).toContain("Mute voice + pause agent");
  });

  it("fuzzy-matches aliases and keywords", () => {
    mockUseApp.mockReturnValue(
      createContext({
        commandQuery: "quiet",
      }),
    );
    mockUseTabNavigation.mockReturnValue(createNavigationMock());

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(CommandPalette));
    });

    const quietAction = tree.root.findByProps({
      "data-testid": "quick-action-mute-voice-pause-agent",
    });
    expect(quietAction).toBeTruthy();
  });

  it("runs the highlighted command on Enter and closes the palette", async () => {
    const ctx = createContext({
      commandActiveIndex: 0,
      commandQuery: "quiet",
    });
    const quickActionRun = vi.fn(async () => {});
    mockUseApp.mockReturnValue(ctx);
    mockUseTabNavigation.mockReturnValue(
      createNavigationMock({
        quickActions: [
          {
            aliases: ["quiet mode"],
            available: true,
            dataTestId: "quick-action-mute-voice-pause-agent",
            hint: "Silence playback and pause the agent if it is running",
            id: "mute-voice-pause-agent",
            keywords: ["voice", "audio", "pause"],
            label: "Mute voice + pause agent",
            run: quickActionRun,
          },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(CommandPalette));
    });

    const keydown = getWindowKeydownHandler();
    await act(async () => {
      keydown({ key: "Enter", preventDefault: vi.fn() } as KeyboardEvent);
    });

    expect(quickActionRun).toHaveBeenCalledTimes(1);
    expect(ctx.closeCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when nothing matches", () => {
    mockUseApp.mockReturnValue(
      createContext({
        commandQuery: "this-will-never-match",
      }),
    );
    mockUseTabNavigation.mockReturnValue(createNavigationMock());

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(CommandPalette));
    });

    const emptyState = tree.root.findByProps({ "data-testid": "palette-list" });
    expect(text(emptyState)).toContain("No commands found");
  });
});
