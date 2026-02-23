/**
 * SEND_TO_CODING_AGENT action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { sendToAgentAction } from "../actions/send-to-agent.js";

// Mock PTYService
const mockSendToSession = jest.fn();
const mockSendKeysToSession = jest.fn();
const mockGetSession = jest.fn();
const mockListSessions = jest.fn();

const createMockPTYService = (sessions: { id: string }[] = []) => ({
  sendToSession: mockSendToSession,
  sendKeysToSession: mockSendKeysToSession,
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

describe("sendToAgentAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendToSession.mockResolvedValue(undefined);
    mockSendKeysToSession.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({
      id: "session-123",
      status: "running",
    });
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(sendToAgentAction.name).toBe("SEND_TO_CODING_AGENT");
    });

    it("should have similes", () => {
      expect(sendToAgentAction.similes).toContain("MESSAGE_CODING_AGENT");
    });

    it("should define input and keys parameters", () => {
      const paramNames = (sendToAgentAction.parameters ?? []).map(
        (p) => p.name,
      );
      expect(paramNames).toContain("sessionId");
      expect(paramNames).toContain("input");
      expect(paramNames).toContain("keys");
    });
  });

  describe("validate", () => {
    it("should return true when PTYService has active sessions", async () => {
      const sessions = [{ id: "session-123" }];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);

      const result = await sendToAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when no active sessions", async () => {
      const ptyService = createMockPTYService([]);
      const runtime = createMockRuntime(ptyService);

      const result = await sendToAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(false);
    });

    it("should return false when PTYService not available", async () => {
      const runtime = createMockRuntime(null);

      const result = await sendToAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("should send text input to session", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        sessionId: "session-123",
        input: "yes",
      });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockSendToSession).toHaveBeenCalledWith("session-123", "yes");
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("yes"),
        }),
      );
    });

    it("should send keys to session", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        sessionId: "session-123",
        keys: "Enter",
      });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockSendKeysToSession).toHaveBeenCalledWith(
        "session-123",
        "Enter",
      );
    });

    it("should use session from state if not specified", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ input: "test" });
      const state = { codingSession: { id: "session-123" } };
      const callback = jest.fn();

      await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(mockSendToSession).toHaveBeenCalledWith("session-123", "test");
    });

    it("should use most recent session if none specified", async () => {
      const sessions = [{ id: "session-1" }, { id: "session-2" }];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ input: "test" });
      const callback = jest.fn();

      await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockSendToSession).toHaveBeenCalledWith("session-2", "test");
    });

    it("should return error when no sessions available", async () => {
      const ptyService = createMockPTYService([]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ input: "test" });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No active"),
        }),
      );
    });

    it("should return error when session not found", async () => {
      mockGetSession.mockReturnValue(undefined);
      const ptyService = createMockPTYService([{ id: "other-session" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        sessionId: "nonexistent",
        input: "test",
      });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
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

    it("should return error when no input provided", async () => {
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ sessionId: "session-123" });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("input"),
        }),
      );
    });

    it("should handle send errors", async () => {
      mockSendToSession.mockRejectedValue(new Error("Send failed"));
      const ptyService = createMockPTYService([{ id: "session-123" }]);
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        sessionId: "session-123",
        input: "test",
      });
      const callback = jest.fn();

      const result = await sendToAgentAction.handler(
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
