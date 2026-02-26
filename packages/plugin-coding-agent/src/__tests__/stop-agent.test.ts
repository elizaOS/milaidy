/**
 * STOP_CODING_AGENT action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";

const { stopAgentAction } = await import("../actions/stop-agent.js");

const mockStopSession = jest.fn();
const mockGetSession = jest.fn();
const mockListSessions = jest.fn();

const createMockPTYService = (sessions: { id: string }[] = []) => ({
  stopSession: mockStopSession,
  getSession: mockGetSession,
  listSessions: mockListSessions.mockReturnValue(sessions),
});

const createMockRuntime = (ptyService: unknown = null) => ({
  getService: jest.fn((name: string) => {
    if (name === "PTY_SERVICE") return ptyService;
    return null;
  }),
});

const createMockMessage = (content: Record<string, unknown> = {}) => ({
  id: "msg-123",
  userId: "user-456",
  content,
});

describe("stopAgentAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStopSession.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({
      id: "session-123",
      agentType: "claude-code",
      status: "running",
    });
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(stopAgentAction.name).toBe("STOP_CODING_AGENT");
    });

    it("should have similes", () => {
      expect(stopAgentAction.similes).toContain("KILL_CODING_AGENT");
      expect(stopAgentAction.similes).toContain("TERMINATE_AGENT");
    });

    it("should define parameters", () => {
      const paramNames = (stopAgentAction.parameters ?? []).map((p) => p.name);
      expect(paramNames).toContain("sessionId");
      expect(paramNames).toContain("all");
    });
  });

  describe("validate", () => {
    it("should return true when sessions exist", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);

      const result = await stopAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when no sessions exist", async () => {
      const ptyService = createMockPTYService([]);
      const runtime = createMockRuntime(ptyService);

      const result = await stopAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("should stop a specific session", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ sessionId: "session-123" });
      const callback = jest.fn();

      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockStopSession).toHaveBeenCalledWith("session-123");
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Stopped"),
        }),
      );
    });

    it("should stop session from state", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({});
      const state = { codingSession: { id: "session-123" } };
      const callback = jest.fn();

      await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(mockStopSession).toHaveBeenCalledWith("session-123");
    });

    it("should clear session from state after stopping", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ sessionId: "session-123" });
      const state: Record<string, unknown> = {
        codingSession: { id: "session-123" },
      };
      const callback = jest.fn();

      await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(state.codingSession).toBeUndefined();
    });

    it("should stop all sessions when all=true", async () => {
      const sessions = [
        { id: "session-1" },
        { id: "session-2" },
        { id: "session-3" },
      ];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ all: true });
      const callback = jest.fn();

      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockStopSession).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("3"),
        }),
      );
    });

    it("should handle stopping most recent session if none specified", async () => {
      const sessions = [{ id: "session-1" }, { id: "session-2" }];
      const ptyService = createMockPTYService(sessions);
      mockGetSession.mockReturnValue({ id: "session-2", agentType: "shell" });
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({});
      const callback = jest.fn();

      await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockStopSession).toHaveBeenCalledWith("session-2");
    });

    it("should return success when no sessions to stop", async () => {
      const ptyService = createMockPTYService([]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({});
      const callback = jest.fn();

      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No active"),
        }),
      );
    });

    it("should handle session not found", async () => {
      mockGetSession.mockReturnValue(undefined);
      const ptyService = createMockPTYService([{ id: "other" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ sessionId: "nonexistent" });
      const callback = jest.fn();

      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("not found"),
        }),
      );
    });

    it("should handle stop errors gracefully when stopping all", async () => {
      mockStopSession
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Stop failed"))
        .mockResolvedValueOnce(undefined);

      const sessions = [
        { id: "session-1" },
        { id: "session-2" },
        { id: "session-3" },
      ];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ all: true });
      const callback = jest.fn();

      // Should not throw, just log error
      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockStopSession).toHaveBeenCalledTimes(3);
    });

    it("should handle stop error for single session", async () => {
      mockStopSession.mockRejectedValue(new Error("Stop failed"));
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ sessionId: "session-123" });
      const callback = jest.fn();

      const result = await stopAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed"),
        }),
      );
    });
  });
});
