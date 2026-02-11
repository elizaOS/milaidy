import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import type {
  AgentStatus,
  StreamEventEnvelope,
  WorkbenchOverview,
} from "../../src/api-client";

interface AutonomousPanelContextStub {
  agentStatus: AgentStatus | null;
  autonomousEvents: StreamEventEnvelope[];
  workbench: WorkbenchOverview | null;
  workbenchLoading: boolean;
  workbenchGoalsAvailable: boolean;
  workbenchTodosAvailable: boolean;
}

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn<() => AutonomousPanelContextStub>(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { AutonomousPanel } from "../../src/components/AutonomousPanel";

function makeStatus(state: AgentStatus["state"]): AgentStatus {
  return {
    state,
    agentName: "TestAgent",
    model: "gpt-test",
    uptime: 42,
    startedAt: Date.now(),
  };
}

function makeEvent(
  id: string,
  stream: string,
  payload: object,
  type: StreamEventEnvelope["type"] = "agent_event",
): StreamEventEnvelope {
  return {
    type,
    version: 1,
    eventId: id,
    ts: Date.now(),
    stream,
    payload,
  };
}

function makeContext(
  overrides: Partial<AutonomousPanelContextStub> = {},
): AutonomousPanelContextStub {
  return {
    agentStatus: null,
    autonomousEvents: [],
    workbench: null,
    workbenchLoading: false,
    workbenchGoalsAvailable: false,
    workbenchTodosAvailable: false,
    ...overrides,
  };
}

function readAllText(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("AutonomousPanel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("shows not-running state when agent is offline", async () => {
    mockUseApp.mockReturnValue(makeContext({ agentStatus: null }));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AutonomousPanel));
    });

    expect(
      tree!.root.findByProps({ "data-testid": "autonomous-panel" }),
    ).toBeDefined();
    expect(readAllText(tree!)).toContain("Agent not running");
  });

  it("updates current thought/action and stream count as events arrive", async () => {
    const liveState = makeContext({
      agentStatus: makeStatus("running"),
      autonomousEvents: [
        makeEvent("evt-1", "assistant", { text: "Thinking about priorities" }),
        makeEvent("evt-2", "action", { text: "Called resolve_priority action" }),
      ],
    });
    mockUseApp.mockImplementation(() => liveState);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AutonomousPanel));
    });

    const initialText = normalizeText(readAllText(tree!));
    expect(initialText).toContain("Event Stream ( 2 )");
    expect(initialText).toContain("Thinking about priorities");
    expect(initialText).toContain("Called resolve_priority action");

    liveState.autonomousEvents = [
      ...liveState.autonomousEvents,
      makeEvent("evt-3", "assistant", { text: "Switching to execution mode" }),
      makeEvent("evt-4", "provider", {}, "heartbeat_event"),
    ];

    await act(async () => {
      tree!.update(React.createElement(AutonomousPanel));
    });

    const panelText = normalizeText(readAllText(tree!));
    expect(panelText).toContain("Event Stream ( 4 )");
    expect(panelText).toContain("Switching to execution mode");
    expect(panelText).toContain("provider event");
  });

  it("renders goals and tasks from workbench context", async () => {
    mockUseApp.mockReturnValue(
      makeContext({
        agentStatus: makeStatus("running"),
        workbenchGoalsAvailable: true,
        workbenchTodosAvailable: true,
        workbench: {
          goals: [
            {
              id: "goal-1",
              name: "Investigate autonomous stream reliability",
              description: "Track and validate stream correctness",
              isCompleted: false,
              tags: ["ops", "observability"],
              score: 1,
            },
          ],
          todos: [
            {
              id: "todo-1",
              name: "Verify panel receives heartbeat updates",
              description: "Ensure realtime rendering updates",
              priority: 1,
              isUrgent: false,
              isCompleted: false,
              type: "task",
            },
          ],
          autonomy: {
            enabled: true,
            thinking: true,
          },
        },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AutonomousPanel));
    });

    const panelText = normalizeText(readAllText(tree!));
    expect(panelText).toContain("Goals ( 1 )");
    expect(panelText).toContain("Tasks ( 1 )");
    expect(panelText).toContain("Investigate autonomous stream reliability");
    expect(panelText).toContain("Verify panel receives heartbeat updates");
  });
});

