// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TrainingStatus,
  TrainingTrajectoryList,
  TrajectoryConfig,
  TrajectoryDetailResult,
  TrajectoryListResult,
  TrajectoryStats,
} from "../../src/api-client";

const { mockUseApp, mockClientFns } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClientFns: {
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

vi.mock("../../src/api-client", () => ({
  client: mockClientFns,
}));

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
  let currentTab: "trajectories" | "fine-tuning";
  let setTab: ReturnType<typeof vi.fn>;
  let setActionNotice: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.setInterval = globalThis.setInterval.bind(globalThis);
    window.clearInterval = globalThis.clearInterval.bind(globalThis);

    currentTab = "trajectories";
    setTab = vi.fn((nextTab: "trajectories" | "fine-tuning") => {
      currentTab = nextTab;
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

    mockUseApp.mockImplementation(() => ({
      tab: currentTab,
      setTab,
      handleRestart: async () => undefined,
      setActionNotice,
    }));
  });

  afterEach(() => {
    mockUseApp.mockReset();
    for (const fn of Object.values(mockClientFns)) {
      fn.mockReset();
    }
  });

  it("shows the same trajectory in Trajectories detail and Fine-Tuning list", async () => {
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(AdvancedPageView));
    });
    await flush();

    const clickableRows = tree?.root.findAll(
      (node) => node.type === "tr" && typeof node.props.onClick === "function",
    );
    expect(clickableRows.length).toBeGreaterThan(0);

    await act(async () => {
      clickableRows[0].props.onClick();
    });
    await flush();

    const trajectoryPrefix = `${SHARED_TRAJECTORY_ID.slice(0, 8)}...`;
    const detailIdFound = tree?.root.findAll(
      (node) =>
        typeof node.type === "string" && containsText(node, trajectoryPrefix),
    );
    expect(detailIdFound.length).toBeGreaterThan(0);
    expect(mockClientFns.getTrajectoryDetail).toHaveBeenCalledWith(
      SHARED_TRAJECTORY_ID,
    );

    const backButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("← Back"),
    )[0];
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton.props.onClick();
    });
    await flush();

    const fineTuningTabButton = tree?.root.findAll(
      (node) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("Fine-Tuning"),
    )[0];
    expect(fineTuningTabButton).toBeDefined();

    await act(async () => {
      fineTuningTabButton.props.onClick();
    });

    await act(async () => {
      tree?.update(React.createElement(AdvancedPageView));
    });
    await flush();

    expect(setTab).toHaveBeenCalledWith("fine-tuning");

    const fineTuningIdFound = tree?.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        containsText(node, SHARED_TRAJECTORY_ID),
    );
    expect(fineTuningIdFound.length).toBeGreaterThan(0);

    expect(mockClientFns.listTrainingTrajectories).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
    });
  });
});
