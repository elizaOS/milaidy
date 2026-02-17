import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  workbenchTasksAvailable: boolean;
  workbenchTriggersAvailable: boolean;
  workbenchTodosAvailable: boolean;
}

const mockUseApp = vi.fn<() => AutonomousPanelContextStub>();

vi.mock("../../src/AppContext", async () => {
  const actual = await vi.importActual<typeof import("../../src/AppContext")>(
    "../../src/AppContext",
  );
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

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
    workbenchTasksAvailable: false,
    workbenchTriggersAvailable: false,
    workbenchTodosAvailable: false,
    ...overrides,
  };
}

function readAllText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
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

    const markup = renderToStaticMarkup(React.createElement(AutonomousPanel));

    expect(markup).toContain('data-testid="autonomous-panel"');
    expect(readAllText(markup)).toContain("Agent not running");
  });

  it("updates current thought/action and stream count as events arrive", async () => {
    const liveState = makeContext({
      agentStatus: makeStatus("running"),
      autonomousEvents: [
        makeEvent("evt-1", "evaluator", { text: "Thinking about priorities" }),
        makeEvent("evt-2", "action", {
          text: "Called resolve_priority action",
        }),
      ],
    });
    mockUseApp.mockImplementation(() => liveState);

    const initialMarkup = renderToStaticMarkup(
      React.createElement(AutonomousPanel),
    );

    const initialText = normalizeText(readAllText(initialMarkup));
    expect(initialText).toMatch(/Event Stream \(2\)/);
    expect(initialText).toContain("Thinking about priorities");
    expect(initialText).toContain("Called resolve_priority action");

    liveState.autonomousEvents = [
      ...liveState.autonomousEvents,
      makeEvent("evt-3", "assistant", { text: "Switching to execution mode" }),
      makeEvent("evt-4", "provider", {}, "heartbeat_event"),
    ];

    const updatedMarkup = renderToStaticMarkup(
      React.createElement(AutonomousPanel),
    );

    const panelText = normalizeText(readAllText(updatedMarkup));
    expect(panelText).toMatch(/Event Stream \(4\)/);
    expect(panelText).toContain("Switching to execution mode");
    expect(panelText).toContain("provider event");
    expect(panelText).toContain("Action provider event");
  });

  it("renders tasks, triggers, and todos from workbench context", async () => {
    mockUseApp.mockReturnValue(
      makeContext({
        agentStatus: makeStatus("running"),
        workbenchTasksAvailable: true,
        workbenchTriggersAvailable: true,
        workbenchTodosAvailable: true,
        workbench: {
          tasks: [
            {
              id: "task-1",
              name: "Investigate autonomous stream reliability",
              description: "Track and validate stream correctness",
              isCompleted: false,
              tags: ["ops", "observability"],
              updatedAt: Date.now(),
            },
          ],
          triggers: [
            {
              id: "trigger-1",
              taskId: "trigger-task-1",
              displayName: "Heartbeat Trigger",
              instructions: "Emit heartbeat update",
              triggerType: "interval",
              enabled: true,
              wakeMode: "inject_now",
              createdBy: "test",
              runCount: 2,
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

    const markup = renderToStaticMarkup(React.createElement(AutonomousPanel));

    const panelText = normalizeText(readAllText(markup));
    expect(panelText).toMatch(/Tasks \(1\)/);
    expect(panelText).toMatch(/Triggers \(1\)/);
    expect(panelText).toMatch(/Todos \(1\)/);
    expect(panelText).toContain("Investigate autonomous stream reliability");
    expect(panelText).toContain("Heartbeat Trigger");
    expect(panelText).toContain("Verify panel receives heartbeat updates");
  });
});
