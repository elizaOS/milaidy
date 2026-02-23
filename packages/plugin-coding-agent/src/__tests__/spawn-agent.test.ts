/**
 * SPAWN_CODING_AGENT action tests
 */

import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";

// Mock external modules BEFORE dynamic import to avoid transitive
// module resolution errors (pty-service.ts imports pty-manager).
mock.module("@elizaos/core", () => ({
  ModelType: { TEXT_SMALL: "text-small" },
}));

mock.module("pty-manager", () => ({
  PTYManager: class {},
  ShellAdapter: class {},
  BunCompatiblePTYManager: class {},
  isBun: () => false,
  extractTaskCompletionTraceRecords: () => [],
  buildTaskCompletionTimeline: () => ({}),
}));

mock.module("coding-agent-adapters", () => ({
  createAllAdapters: () => [],
  checkAdapters: jest.fn().mockResolvedValue([]),
  createAdapter: jest.fn(),
  generateApprovalConfig: jest.fn(),
}));

// Dynamic import after mocks are registered
const { spawnAgentAction } = await import("../actions/spawn-agent.js");

// Mock PTYService
const mockSpawnSession = jest.fn();
const mockOnSessionEvent = jest.fn();
const mockCheckAvailableAgents = jest.fn();

const createMockPTYService = () => ({
  spawnSession: mockSpawnSession,
  onSessionEvent: mockOnSessionEvent,
  getSession: jest.fn(),
  listSessions: jest.fn().mockReturnValue([]),
  checkAvailableAgents: mockCheckAvailableAgents,
});

// Mock runtime
const createMockRuntime = (ptyService: unknown = null) => ({
  getService: jest.fn((name: string) => {
    if (name === "PTY_SERVICE") return ptyService;
    return null;
  }),
  getSetting: jest.fn(),
});

// Mock message
const createMockMessage = (content: Record<string, unknown> = {}) => ({
  id: "msg-123",
  userId: "user-456",
  content,
  roomId: "room-789",
  createdAt: Date.now(),
});

describe("spawnAgentAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSession.mockResolvedValue({
      id: "session-123",
      agentType: "claude",
      workdir: "/test/path",
      status: "running",
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });
    // Default: agents are installed
    mockCheckAvailableAgents.mockResolvedValue([
      {
        adapter: "claude",
        installed: true,
        installCommand: "npm i -g @anthropic-ai/claude-code",
        docsUrl: "https://docs.anthropic.com",
      },
    ]);
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(spawnAgentAction.name).toBe("SPAWN_CODING_AGENT");
    });

    it("should have similes for matching", () => {
      expect(spawnAgentAction.similes).toContain("START_CODING_AGENT");
      expect(spawnAgentAction.similes).toContain("LAUNCH_CODING_AGENT");
    });

    it("should have description", () => {
      expect(spawnAgentAction.description).toBeDefined();
      expect(spawnAgentAction.description).toContain("coding agent");
    });

    it("should have examples", () => {
      expect(spawnAgentAction.examples).toBeDefined();
      expect((spawnAgentAction.examples ?? []).length).toBeGreaterThan(0);
    });

    it("should define parameters", () => {
      expect(spawnAgentAction.parameters).toBeDefined();
      const paramNames = (spawnAgentAction.parameters ?? []).map((p) => p.name);
      expect(paramNames).toContain("agentType");
      expect(paramNames).toContain("workdir");
      expect(paramNames).toContain("task");
    });
  });

  describe("validate", () => {
    it("should return true when PTYService is available", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();

      const result = await spawnAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when PTYService is not available", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage();

      const result = await spawnAgentAction.validate?.(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    // Use cwd as a valid workdir — handler validates paths against allowed prefixes
    const validWorkdir = process.cwd();

    it("should spawn a coding agent session", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
        task: "Fix the bug",
      });
      const callback = jest.fn();

      const result = await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockSpawnSession).toHaveBeenCalledWith({
        name: expect.stringContaining("coding-"),
        agentType: "claude",
        workdir: validWorkdir,
        initialTask: "Fix the bug",
        credentials: expect.any(Object),
        metadata: expect.objectContaining({
          requestedType: "claude",
          messageId: "msg-123",
        }),
      });
    });

    it("should use default agent type if not specified", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ workdir: validWorkdir });
      const callback = jest.fn();

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "claude",
        }),
      );
    });

    it("should map agent type aliases", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude-code",
        workdir: validWorkdir,
      });
      const callback = jest.fn();

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "claude",
        }),
      );
    });

    it("should use codex adapter for codex type", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "codex",
        workdir: validWorkdir,
      });
      const callback = jest.fn();
      mockCheckAvailableAgents.mockResolvedValue([
        {
          adapter: "codex",
          installed: true,
          installCommand: "npm i -g @openai/codex",
          docsUrl: "https://openai.com",
        },
      ]);

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "codex",
        }),
      );
    });

    it("should return NO_WORKSPACE when workdir not specified and no workspace available", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude" });
      const callback = jest.fn();

      const result = await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("NO_WORKSPACE");
    });

    it("should call callback with success message", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
      });
      const callback = jest.fn();

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Started"),
        }),
      );
    });

    it("should store session in state", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
      });
      const state: Record<string, unknown> = {};
      const callback = jest.fn();

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(state.codingSession).toBeDefined();
      expect((state.codingSession as { id: string }).id).toBe("session-123");
    });

    it("should register session event handler", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
      });

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        jest.fn(),
      );

      expect(mockOnSessionEvent).toHaveBeenCalled();
    });

    it("should fail if agent CLI is not installed", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
      });
      const callback = jest.fn();
      mockCheckAvailableAgents.mockResolvedValue([
        {
          adapter: "claude",
          installed: false,
          installCommand: "npm i -g @anthropic-ai/claude-code",
          docsUrl: "https://docs.anthropic.com",
        },
      ]);

      const result = await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("AGENT_NOT_INSTALLED");
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("not installed"),
        }),
      );
    });

    it("should return false when PTYService not available", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage({});
      const callback = jest.fn();

      const result = await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
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

    it("should handle spawn errors", async () => {
      mockSpawnSession.mockRejectedValue(new Error("PTY spawn failed"));
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude",
        workdir: validWorkdir,
      });
      const callback = jest.fn();

      const result = await spawnAgentAction.handler(
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

    it("should skip preflight check for shell agent type", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "shell",
        workdir: validWorkdir,
      });
      const callback = jest.fn();

      await spawnAgentAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      // checkAvailableAgents should not be called for shell
      expect(mockCheckAvailableAgents).not.toHaveBeenCalled();
      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "shell",
        }),
      );
    });
  });
});
