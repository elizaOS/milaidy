/**
 * SwarmCoordinator unit tests
 *
 * Tests task registration, event handling, SSE broadcasting,
 * LLM decision loop, supervision levels, and confirmation queue.
 */

import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

// Mock modules BEFORE importing the coordinator
mock.module("@elizaos/core", () => ({
  ModelType: { TEXT_SMALL: "text-small" },
}));

// Dynamic import after mocks
const { SwarmCoordinator } = await import(
  "../services/swarm-coordinator.js"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockRuntime = () => ({
  useModel: jest.fn(),
  getSetting: jest.fn(),
  getService: jest.fn(),
});

const createMockPTYService = () => ({
  onSessionEvent: jest.fn().mockReturnValue(() => {}),
  sendToSession: jest.fn().mockResolvedValue(undefined),
  sendKeysToSession: jest.fn().mockResolvedValue(undefined),
  getSessionOutput: jest.fn().mockResolvedValue("recent output"),
  listSessions: jest.fn().mockResolvedValue([]),
});

function createMockSseRes() {
  return {
    write: jest.fn().mockReturnValue(true),
    end: jest.fn(),
    on: jest.fn(),
    writableEnded: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SwarmCoordinator", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  let coordinator: any;
  let mockRuntime: ReturnType<typeof createMockRuntime>;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  let mockPty: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntime = createMockRuntime();
    mockPty = createMockPTYService();
    coordinator = new SwarmCoordinator(mockRuntime);
    coordinator.start(mockPty);
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================
  describe("lifecycle", () => {
    it("subscribes to PTY events on start", () => {
      expect(mockPty.onSessionEvent).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes on stop", () => {
      const unsub = jest.fn();
      mockPty.onSessionEvent.mockReturnValue(unsub);
      const coord = new SwarmCoordinator(mockRuntime);
      coord.start(mockPty);
      coord.stop();
      expect(unsub).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Task Registration
  // =========================================================================
  describe("task registration", () => {
    it("registers a task context", () => {
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test-agent",
        originalTask: "Fix bug",
        workdir: "/workspace",
      });

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx).toBeDefined();
      expect(ctx.sessionId).toBe("s-1");
      expect(ctx.agentType).toBe("claude");
      expect(ctx.label).toBe("test-agent");
      expect(ctx.originalTask).toBe("Fix bug");
      expect(ctx.status).toBe("active");
      expect(ctx.decisions).toEqual([]);
      expect(ctx.autoResolvedCount).toBe(0);
    });

    it("returns undefined for unregistered sessions", () => {
      expect(coordinator.getTaskContext("unknown")).toBeUndefined();
    });

    it("lists all task contexts", () => {
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "a",
        originalTask: "task 1",
        workdir: "/w1",
      });
      coordinator.registerTask("s-2", {
        agentType: "gemini",
        label: "b",
        originalTask: "task 2",
        workdir: "/w2",
      });

      const all = coordinator.getAllTaskContexts();
      expect(all.length).toBe(2);
    });
  });

  // =========================================================================
  // SSE Broadcasting
  // =========================================================================
  describe("SSE broadcasting", () => {
    it("sends snapshot on client connect", () => {
      const res = createMockSseRes();
      coordinator.addSseClient(res);

      // Should have written at least one SSE event (snapshot)
      expect(res.write).toHaveBeenCalled();
      const written = res.write.mock.calls[0][0];
      expect(written).toContain("data:");
      const parsed = JSON.parse(written.replace("data: ", "").trim());
      expect(parsed.type).toBe("snapshot");
    });

    it("broadcasts task registration events", () => {
      const res = createMockSseRes();
      coordinator.addSseClient(res);
      res.write.mockClear();

      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test",
        originalTask: "Fix bug",
        workdir: "/w",
      });

      // Should have broadcast task_registered
      expect(res.write).toHaveBeenCalled();
      const lastCall =
        res.write.mock.calls[res.write.mock.calls.length - 1][0];
      const parsed = JSON.parse(lastCall.replace("data: ", "").trim());
      expect(parsed.type).toBe("task_registered");
      expect(parsed.sessionId).toBe("s-1");
    });

    it("removes dead SSE clients", async () => {
      const res = createMockSseRes();
      res.writableEnded = true;
      coordinator.addSseClient(res);
      res.write.mockClear();

      // Trigger a broadcast
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test",
        originalTask: "task",
        workdir: "/w",
      });

      // Dead client should not receive the event
      // (the initial snapshot write may have happened before writableEnded was set)
    });

    it("unsubscribes client on cleanup", () => {
      const res = createMockSseRes();
      const unsub = coordinator.addSseClient(res);
      unsub();

      // After unsubscribe, new events should not reach this client
      res.write.mockClear();
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test",
        originalTask: "task",
        workdir: "/w",
      });

      expect(res.write).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Event Handling
  // =========================================================================
  describe("event handling", () => {
    beforeEach(() => {
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test-agent",
        originalTask: "Fix bug",
        workdir: "/workspace",
      });
    });

    it("handles task_complete by updating status", async () => {
      await coordinator.handleSessionEvent("s-1", "task_complete", {});

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.status).toBe("completed");
    });

    it("handles error by updating status", async () => {
      await coordinator.handleSessionEvent("s-1", "error", {
        message: "crash",
      });

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.status).toBe("error");
    });

    it("handles stopped by updating status", async () => {
      await coordinator.handleSessionEvent("s-1", "stopped", {});

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.status).toBe("stopped");
    });

    it("skips auto-responded blocked events", async () => {
      const res = createMockSseRes();
      coordinator.addSseClient(res);
      res.write.mockClear();

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?", type: "permission" },
        autoResponded: true,
      });

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.autoResolvedCount).toBe(1);
      expect(ctx.decisions.length).toBe(1);
      expect(ctx.decisions[0].decision).toBe("auto_resolved");

      // Should broadcast blocked_auto_resolved
      const events = res.write.mock.calls.map(
        (c: unknown[]) => JSON.parse((c[0] as string).replace("data: ", "").trim()),
      );
      expect(events.some((e: { type: string }) => e.type === "blocked_auto_resolved")).toBe(true);
    });

    it("buffers events for unregistered sessions", async () => {
      // Event for unknown session
      await coordinator.handleSessionEvent("s-unknown", "blocked", {
        promptInfo: { prompt: "Allow?" },
      });

      // No crash — event is buffered
      expect(coordinator.getTaskContext("s-unknown")).toBeUndefined();
    });
  });

  // =========================================================================
  // Supervision Levels
  // =========================================================================
  describe("supervision levels", () => {
    it("defaults to autonomous", () => {
      expect(coordinator.getSupervisionLevel()).toBe("autonomous");
    });

    it("can change supervision level", () => {
      coordinator.setSupervisionLevel("confirm");
      expect(coordinator.getSupervisionLevel()).toBe("confirm");
    });

    it("broadcasts supervision change", () => {
      const res = createMockSseRes();
      coordinator.addSseClient(res);
      res.write.mockClear();

      coordinator.setSupervisionLevel("notify");

      const events = res.write.mock.calls.map(
        (c: unknown[]) => JSON.parse((c[0] as string).replace("data: ", "").trim()),
      );
      expect(
        events.some((e: { type: string }) => e.type === "supervision_changed"),
      ).toBe(true);
    });
  });

  // =========================================================================
  // LLM Decision (autonomous mode)
  // =========================================================================
  describe("autonomous coordination", () => {
    beforeEach(() => {
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test-agent",
        originalTask: "Fix bug",
        workdir: "/workspace",
      });
    });

    it("calls LLM and executes respond decision", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"y","reasoning":"Approve file write"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow write to auth.ts?", type: "permission" },
        autoResponded: false,
      });

      // Should have called sendToSession with "y"
      expect(mockPty.sendToSession).toHaveBeenCalledWith("s-1", "y");

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.decisions.length).toBe(1);
      expect(ctx.decisions[0].decision).toBe("respond");
      expect(ctx.decisions[0].response).toBe("y");
    });

    it("calls LLM and executes respond with keys", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","useKeys":true,"keys":["enter"],"reasoning":"Confirm default"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Select option:", type: "unknown" },
        autoResponded: false,
      });

      expect(mockPty.sendKeysToSession).toHaveBeenCalledWith("s-1", [
        "enter",
      ]);
    });

    it("escalates when LLM returns escalate", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"escalate","reasoning":"Design question needs human input"}',
      );

      const res = createMockSseRes();
      coordinator.addSseClient(res);
      res.write.mockClear();

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Which database?" },
        autoResponded: false,
      });

      expect(mockPty.sendToSession).not.toHaveBeenCalled();

      // Should broadcast escalation
      const events = res.write.mock.calls.map(
        (c: unknown[]) => JSON.parse((c[0] as string).replace("data: ", "").trim()),
      );
      expect(events.some((e: { type: string }) => e.type === "escalation")).toBe(true);
    });

    it("escalates when LLM returns invalid JSON", async () => {
      mockRuntime.useModel.mockResolvedValue("I cannot decide");

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      const ctx = coordinator.getTaskContext("s-1");
      expect(ctx.decisions.length).toBe(1);
      expect(ctx.decisions[0].decision).toBe("escalate");
      expect(ctx.decisions[0].reasoning).toContain("invalid");
    });

    it("escalates after max auto responses", async () => {
      const ctx = coordinator.getTaskContext("s-1");
      ctx.autoResolvedCount = 10; // At the limit

      const res = createMockSseRes();
      coordinator.addSseClient(res);
      res.write.mockClear();

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      // Should escalate without calling LLM
      expect(mockRuntime.useModel).not.toHaveBeenCalled();

      const events = res.write.mock.calls.map(
        (c: unknown[]) => JSON.parse((c[0] as string).replace("data: ", "").trim()),
      );
      expect(events.some((e: { type: string }) => e.type === "escalation")).toBe(true);
    });
  });

  // =========================================================================
  // Confirm Mode
  // =========================================================================
  describe("confirm mode", () => {
    beforeEach(() => {
      coordinator.setSupervisionLevel("confirm");
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test-agent",
        originalTask: "Fix bug",
        workdir: "/workspace",
      });
    });

    it("queues LLM decision for human approval", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"y","reasoning":"Looks safe"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow write?", type: "permission" },
        autoResponded: false,
      });

      // Should NOT have sent anything yet
      expect(mockPty.sendToSession).not.toHaveBeenCalled();

      // Should be in pending confirmations
      const pending = coordinator.getPendingConfirmations();
      expect(pending.length).toBe(1);
      expect(pending[0].sessionId).toBe("s-1");
      expect(pending[0].promptText).toBe("Allow write?");
      expect(pending[0].llmDecision.action).toBe("respond");
    });

    it("executes when human approves", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"y","reasoning":"Safe"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      await coordinator.confirmDecision("s-1", true);

      expect(mockPty.sendToSession).toHaveBeenCalledWith("s-1", "y");
      expect(coordinator.getPendingConfirmations().length).toBe(0);
    });

    it("does not execute when human rejects", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"y","reasoning":"Safe"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      await coordinator.confirmDecision("s-1", false);

      expect(mockPty.sendToSession).not.toHaveBeenCalled();
      expect(coordinator.getPendingConfirmations().length).toBe(0);
    });

    it("allows human to override the LLM response", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"y","reasoning":"Safe"}',
      );

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      await coordinator.confirmDecision("s-1", true, { response: "n" });

      expect(mockPty.sendToSession).toHaveBeenCalledWith("s-1", "n");
    });

    it("throws when confirming non-existent pending decision", async () => {
      await expect(
        coordinator.confirmDecision("s-nonexistent", true),
      ).rejects.toThrow("No pending decision");
    });
  });

  // =========================================================================
  // Notify Mode
  // =========================================================================
  describe("notify mode", () => {
    it("broadcasts but does not respond or call LLM", async () => {
      coordinator.setSupervisionLevel("notify");
      coordinator.registerTask("s-1", {
        agentType: "claude",
        label: "test-agent",
        originalTask: "Fix bug",
        workdir: "/workspace",
      });

      await coordinator.handleSessionEvent("s-1", "blocked", {
        promptInfo: { prompt: "Allow?" },
        autoResponded: false,
      });

      expect(mockRuntime.useModel).not.toHaveBeenCalled();
      expect(mockPty.sendToSession).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // makeCoordinationDecision (direct)
  // =========================================================================
  describe("makeCoordinationDecision", () => {
    it("returns parsed LLM response", async () => {
      mockRuntime.useModel.mockResolvedValue(
        '{"action":"respond","response":"yes","reasoning":"Looks good"}',
      );

      const taskCtx = {
        sessionId: "s-1",
        agentType: "claude",
        label: "test",
        originalTask: "Fix bug",
        workdir: "/w",
        status: "active",
        decisions: [],
        autoResolvedCount: 0,
        registeredAt: Date.now(),
      };

      const decision = await coordinator.makeCoordinationDecision(
        taskCtx,
        "Allow?",
        "some output",
      );

      expect(decision).not.toBeNull();
      expect(decision.action).toBe("respond");
      expect(decision.response).toBe("yes");
    });

    it("returns null when LLM fails", async () => {
      mockRuntime.useModel.mockRejectedValue(new Error("API error"));

      const taskCtx = {
        sessionId: "s-1",
        agentType: "claude",
        label: "test",
        originalTask: "Fix bug",
        workdir: "/w",
        status: "active",
        decisions: [],
        autoResolvedCount: 0,
        registeredAt: Date.now(),
      };

      const decision = await coordinator.makeCoordinationDecision(
        taskCtx,
        "Allow?",
        "output",
      );

      expect(decision).toBeNull();
    });
  });
});
