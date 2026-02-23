/**
 * LIST_CODING_AGENTS action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { listAgentsAction } from "../actions/list-agents.js";

const mockListSessions = jest.fn();

const createMockPTYService = (sessions: unknown[] = []) => ({
  listSessions: mockListSessions.mockReturnValue(sessions),
});

const createMockRuntime = (ptyService: unknown = null) => ({
  getService: jest.fn((name: string) => {
    if (name === "PTY_SERVICE") return ptyService;
    return null;
  }),
});

const createMockMessage = () => ({
  id: "msg-123",
  userId: "user-456",
  content: {},
});

describe("listAgentsAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(listAgentsAction.name).toBe("LIST_CODING_AGENTS");
    });

    it("should have similes", () => {
      expect(listAgentsAction.similes).toContain("SHOW_CODING_AGENTS");
      expect(listAgentsAction.similes).toContain("GET_ACTIVE_AGENTS");
    });

    it("should have no required parameters", () => {
      expect(listAgentsAction.parameters).toEqual([]);
    });
  });

  describe("validate", () => {
    it("should return true when PTYService is available", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);

      const result = await listAgentsAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when PTYService not available", async () => {
      const runtime = createMockRuntime(null);

      const result = await listAgentsAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("should list all active sessions", async () => {
      const sessions = [
        {
          id: "session-1",
          agentType: "claude-code",
          status: "running",
          workdir: "/project/a",
          createdAt: new Date("2024-01-01T10:00:00Z"),
          lastActivityAt: new Date("2024-01-01T10:30:00Z"),
        },
        {
          id: "session-2",
          agentType: "shell",
          status: "blocked",
          workdir: "/project/b",
          createdAt: new Date("2024-01-01T11:00:00Z"),
          lastActivityAt: new Date("2024-01-01T11:15:00Z"),
        },
      ];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const callback = jest.fn();

      const result = await listAgentsAction.handler(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("claude-code"),
        }),
      );
    });

    it("should show message when no sessions", async () => {
      const ptyService = createMockPTYService([]);
      const runtime = createMockRuntime(ptyService);
      const callback = jest.fn();

      const result = await listAgentsAction.handler(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
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

    it("should format session summaries correctly", async () => {
      const sessions = [
        {
          id: "abc123def456",
          agentType: "claude-code",
          status: "running",
          workdir: "/path/to/project",
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
      ];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const callback = jest.fn();

      await listAgentsAction.handler(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
        undefined,
        {},
        callback,
      );

      const callArg = callback.mock.calls[0][0];
      expect(callArg.text).toContain("/path/to/project");
    });

    it("should show status emojis in text output", async () => {
      const sessions = [
        {
          id: "session-1",
          agentType: "claude-code",
          status: "completed",
          workdir: "/a",
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
        {
          id: "session-2",
          agentType: "shell",
          status: "error",
          workdir: "/b",
          createdAt: new Date(),
          lastActivityAt: new Date(),
        },
      ];
      const ptyService = createMockPTYService(sessions);
      const runtime = createMockRuntime(ptyService);
      const callback = jest.fn();

      await listAgentsAction.handler(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
        undefined,
        {},
        callback,
      );

      const text = callback.mock.calls[0][0].text;
      // Should contain status indicators
      expect(text).toMatch(/completed|error/);
    });

    it("should return false when PTYService not available", async () => {
      const runtime = createMockRuntime(null);
      const callback = jest.fn();

      const result = await listAgentsAction.handler(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("not available"),
        }),
      );
    });
  });
});
