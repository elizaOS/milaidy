// @vitest-environment jsdom

import type {
  TrainingStatus,
  TrainingTrajectoryList,
  TrajectoryConfig,
  TrajectoryDetailResult,
  TrajectoryListResult,
  TrajectoryStats,
} from "@milady/app-core/api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Provide a minimal DOM-like mock for ref callbacks so react-test-renderer
// doesn't crash with "createNodeMock is not a function" or
// "parentInstance.children.indexOf is not a function".
const createNodeMock = () => ({
  children: [] as unknown[],
  scrollIntoView: vi.fn(),
  focus: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getBoundingClientRect: vi.fn(() => ({
    top: 0,
    left: 0,
    width: 100,
    height: 20,
  })),
});

const { mockUseApp, mockClientFns } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClientFns: {
    getCodingAgentStatus: vi.fn(async () => null),
    getTrajectories: vi.fn(),
    getTrajectoryStats: vi.fn(),
    getTrajectoryConfig: vi.fn(),
    getTrajectoryDetail: vi.fn(),
    updateTrajectoryConfig: vi.fn(),
    exportTrajectories: vi.fn(),
    clearAllTrajectories: vi.fn(),
    getTrainingStatus: vi.fn(),
    listTrainingTrajectories: vi.fn(),
    listTrainingDatasets: vi.fn(),
    listTrainingJobs: vi.fn(),
    listTrainingModels: vi.fn(),
    getTrainingTrajectory: vi.fn(),
    onWsEvent: vi.fn(),
  },
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@milady/app-core/api", () => ({
  client: mockClientFns,
}));

// Mock sub-views not under test — they transitively import Radix UI
// components (Select, DropdownMenu) that call DOM methods like closest()
// which react-test-renderer does not provide.
// Each factory must inline require('react') because vi.mock is hoisted.
vi.mock("../../src/components/CustomActionsView", () => {
  const R = require("react");
  return { CustomActionsView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/DatabasePageView", () => {
  const R = require("react");
  return { DatabasePageView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/FineTuningView", () => {
  const R = require("react");
  return { FineTuningView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/LifoSandboxView", () => {
  const R = require("react");
  return { LifoSandboxView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/LogsPageView", () => {
  const R = require("react");
  return { LogsPageView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/PluginsPageView", () => {
  const R = require("react");
  return { PluginsPageView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/RuntimeView", () => {
  const R = require("react");
  return { RuntimeView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/SkillsView", () => {
  const R = require("react");
  return { SkillsView: () => R.createElement("div", null, "stub") };
});
vi.mock("../../src/components/TriggersView", () => {
  const R = require("react");
  return { TriggersView: () => R.createElement("div", null, "stub") };
});

// Mock @milady/ui components that use React.forwardRef with DOM refs,
// which are incompatible with react-test-renderer.
// Fully explicit mock — do NOT use vi.importActual since it pulls in
// Radix UI context providers that crash outside a real DOM.
vi.mock("@milady/ui", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test mock factory
  const p = (props: any) =>
    React.createElement("div", { "data-testid": "ui-mock" }, props.children);
  const noop = () => null;
  return {
    // Primitives
    Button: p,
    Input: p,
    Textarea: p,
    Label: p,
    Checkbox: p,
    Separator: p,
    Skeleton: p,
    Slider: p,
    Spinner: p,
    Switch: p,
    // Select
    Select: p,
    SelectTrigger: p,
    SelectContent: p,
    SelectItem: p,
    SelectValue: p,
    // Dropdown
    DropdownMenu: p,
    DropdownMenuTrigger: p,
    DropdownMenuContent: p,
    DropdownMenuItem: p,
    // Dialog
    Dialog: p,
    DialogTrigger: p,
    DialogContent: p,
    DialogHeader: p,
    DialogTitle: p,
    DialogDescription: p,
    DialogFooter: p,
    DialogClose: p,
    DialogOverlay: p,
    DialogPortal: p,
    // Card
    Card: p,
    CardHeader: p,
    CardTitle: p,
    CardContent: p,
    CardDescription: p,
    CardFooter: p,
    // Tabs
    Tabs: p,
    TabsList: p,
    TabsTrigger: p,
    TabsContent: p,
    // Tooltip
    Tooltip: p,
    TooltipTrigger: p,
    TooltipContent: p,
    TooltipProvider: p,
    // Popover
    Popover: p,
    PopoverTrigger: p,
    PopoverContent: p,
    // Badge / Status
    Badge: p,
    StatusBadge: p,
    StatusDot: p,
    // Layout
    Stack: p,
    Grid: p,
    SectionCard: p,
    // Composed
    Banner: p,
    CopyButton: p,
    ConfirmDelete: p,
    ConfirmDialog: p,
    ConnectionStatus: p,
    EmptyState: p,
    ErrorBoundary: p,
    SaveFooter: p,
    SearchBar: p,
    SearchInput: p,
    TagEditor: p,
    TagInput: p,
    ThemedSelect: p,
    ThemedSelectGroup: p,
    ChatEmptyState: p,
    TypingIndicator: p,
    // Typography
    Heading: p,
    Text: p,
    // HoverTooltip / IconTooltip
    HoverTooltip: p,
    IconTooltip: p,
    Spotlight: p,
    StatCard: p,
    // Utilities
    cn: (...args: string[]) => args.filter(Boolean).join(" "),
    btnPrimary: "",
    btnDanger: "",
    btnGhost: "",
    inputCls: "",
    statusToneForBoolean: noop,
    useConfirm: () => ({ confirm: noop }),
    useGuidedTour: () => ({ start: noop, stop: noop }),
  };
});

import { AdvancedPageView } from "../../src/components/AdvancedPageView";

const SHARED_TRAJECTORY_ID = "shared-traj-123456789";

const trajectoriesResult: TrajectoryListResult = {
  trajectories: [
    {
      id: SHARED_TRAJECTORY_ID,
      agentId: "agent-1",
      roomId: null,
      entityId: null,
      conversationId: null,
      source: "chat",
      status: "completed",
      startTime: Date.now() - 2_500,
      endTime: Date.now() - 500,
      durationMs: 2_000,
      llmCallCount: 2,
      providerAccessCount: 0,
      totalPromptTokens: 33,
      totalCompletionTokens: 12,
      metadata: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
};

const trajectoryStats: TrajectoryStats = {
  totalTrajectories: 1,
  totalLlmCalls: 2,
  totalProviderAccesses: 0,
  totalPromptTokens: 33,
  totalCompletionTokens: 12,
  averageDurationMs: 2_000,
  bySource: { chat: 1 },
  byModel: { "test-model": 1 },
};

const trajectoryConfig: TrajectoryConfig = {
  enabled: true,
};

const trajectoryDetail: TrajectoryDetailResult = {
  trajectory: trajectoriesResult.trajectories[0],
  llmCalls: [
    {
      id: "call-1",
      trajectoryId: SHARED_TRAJECTORY_ID,
      stepId: "step-1",
      model: "test-model",
      systemPrompt: "You are helpful.",
      userPrompt: "hello from user",
      response: "hi there",
      temperature: 0,
      maxTokens: 64,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 10,
      promptTokens: 33,
      completionTokens: 12,
      timestamp: Date.now(),
      createdAt: new Date(0).toISOString(),
    },
  ],
  providerAccesses: [],
};

const trainingStatus: TrainingStatus = {
  runningJobs: 0,
  queuedJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  modelCount: 0,
  datasetCount: 0,
  runtimeAvailable: true,
};

const trainingTrajectories: TrainingTrajectoryList = {
  available: true,
  total: 1,
  trajectories: [
    {
      id: "row-1",
      trajectoryId: SHARED_TRAJECTORY_ID,
      agentId: "agent-1",
      archetype: "default",
      createdAt: new Date(0).toISOString(),
      totalReward: 0,
      aiJudgeReward: 0,
      episodeLength: 1,
      hasLlmCalls: true,
      llmCallCount: 2,
    },
  ],
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") return child;
      return nodeText(child);
    })
    .join("");
}

function containsText(
  node: TestRenderer.ReactTestInstance,
  text: string,
): boolean {
  return nodeText(node).includes(text);
}

describe("Advanced trajectories/fine-tuning integration", () => {
  let _currentTab: "trajectories" | "fine-tuning";
  let setTab: ReturnType<typeof vi.fn>;
  let setActionNotice: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    let _currentTab: "trajectories" | "fine-tuning";
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    window.setInterval = globalThis.setInterval.bind(globalThis) as any;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    window.clearInterval = globalThis.clearInterval.bind(globalThis) as any;
    setTab = vi.fn((nextTab: "trajectories" | "fine-tuning") => {
      _currentTab = nextTab;
    });
    setActionNotice = vi.fn();

    mockClientFns.getTrajectories.mockResolvedValue(trajectoriesResult);
    mockClientFns.getTrajectoryStats.mockResolvedValue(trajectoryStats);
    mockClientFns.getTrajectoryConfig.mockResolvedValue(trajectoryConfig);
    mockClientFns.getTrajectoryDetail.mockResolvedValue(trajectoryDetail);
    mockClientFns.updateTrajectoryConfig.mockResolvedValue(trajectoryConfig);
    mockClientFns.exportTrajectories.mockResolvedValue(
      new Blob(["[]"], { type: "application/json" }),
    );
    mockClientFns.clearAllTrajectories.mockResolvedValue({ deleted: 0 });

    mockClientFns.getTrainingStatus.mockResolvedValue(trainingStatus);
    mockClientFns.listTrainingTrajectories.mockResolvedValue(
      trainingTrajectories,
    );
    mockClientFns.listTrainingDatasets.mockResolvedValue({ datasets: [] });
    mockClientFns.listTrainingJobs.mockResolvedValue({ jobs: [] });
    mockClientFns.listTrainingModels.mockResolvedValue({ models: [] });
    mockClientFns.getTrainingTrajectory.mockResolvedValue({
      trajectory: {
        ...trainingTrajectories.trajectories[0],
        stepsJson: "[]",
        aiJudgeReasoning: null,
      },
    });
    mockClientFns.onWsEvent.mockImplementation(() => () => undefined);

    _currentTab = "trajectories";
    const handleRestart = vi.fn().mockResolvedValue(undefined);
    const t = (k: string) => k;
    const cachedMock = {
      t,
      tab: _currentTab,
      setTab,
      handleRestart,
      setActionNotice,
    };
    mockUseApp.mockImplementation(() => cachedMock);
  });

  afterEach(() => {
    mockUseApp.mockReset();
    for (const fn of Object.values(mockClientFns)) {
      fn.mockReset();
    }
  });

  it("shows the same trajectory in Trajectories detail and Fine-Tuning list", async () => {
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(AdvancedPageView), {
        createNodeMock,
      });
    });
    await flush();

    const clickableRows = tree.root.findAll(
      (node) => node.type === "tr" && typeof node.props.onClick === "function",
    );
    expect(clickableRows.length).toBeGreaterThan(0);

    await act(async () => {
      clickableRows[0]?.props.onClick();
    });
    await flush();

    const trajectoryPrefix = `${SHARED_TRAJECTORY_ID.slice(0, 8)}...`;
    const detailIdFound = tree.root.findAll(
      (node) =>
        typeof node.type === "string" && containsText(node, trajectoryPrefix),
    );
    expect(detailIdFound.length).toBeGreaterThan(0);
    expect(mockClientFns.getTrajectoryDetail).toHaveBeenCalledWith(
      SHARED_TRAJECTORY_ID,
    );

    const backButton = tree.root.findAll(
      (node) =>
        node.type === "button" &&
        containsText(node, "trajectorydetailview.Back"),
    )[0] as TestRenderer.ReactTestInstance;
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton.props.onClick();
    });
    await flush();
  });
});
