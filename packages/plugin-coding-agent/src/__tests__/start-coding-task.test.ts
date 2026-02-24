/**
 * START_CODING_TASK action tests
 */

import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { IAgentRuntime, Memory } from "@elizaos/core";

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
const { startCodingTaskAction } = await import(
  "../actions/start-coding-task.js"
);

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockSpawnSession = jest.fn();
const mockOnSessionEvent = jest.fn();
const mockCheckAvailableAgents = jest.fn();
const mockProvisionWorkspace = jest.fn();
const mockSetLabel = jest.fn();

const createMockPTYService = () => ({
  spawnSession: mockSpawnSession,
  onSessionEvent: mockOnSessionEvent,
  checkAvailableAgents: mockCheckAvailableAgents,
  listSessions: jest.fn().mockResolvedValue([]),
  stopSession: jest.fn().mockResolvedValue(undefined),
});

const createMockWorkspaceService = () => ({
  provisionWorkspace: mockProvisionWorkspace,
  setLabel: mockSetLabel,
  removeScratchDir: jest.fn().mockResolvedValue(undefined),
});

const createMockRuntime = (
  ptyService: unknown = null,
  wsService: unknown = null,
) => ({
  getService: jest.fn((name: string) => {
    if (name === "PTY_SERVICE") return ptyService;
    if (name === "CODING_WORKSPACE_SERVICE") return wsService;
    return null;
  }),
  getSetting: jest.fn(),
});

const createMockMessage = (content: Record<string, unknown> = {}) => ({
  id: "msg-123",
  userId: "user-456",
  content,
  roomId: "room-789",
  createdAt: Date.now(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startCodingTaskAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSpawnSession.mockResolvedValue({
      id: "session-001",
      agentType: "claude",
      workdir: "/workspace/test",
      status: "running",
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });

    mockCheckAvailableAgents.mockResolvedValue([
      {
        adapter: "claude",
        installed: true,
        installCommand: "npm i -g @anthropic-ai/claude-code",
        docsUrl: "https://docs.anthropic.com",
      },
    ]);

    mockProvisionWorkspace.mockResolvedValue({
      id: "ws-001",
      path: "/workspace/cloned-repo",
      branch: "main",
      isWorktree: false,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Action metadata
  // -------------------------------------------------------------------------

  describe("action metadata", () => {
    it("should have name START_CODING_TASK", () => {
      expect(startCodingTaskAction.name).toBe("START_CODING_TASK");
    });

    it("should have similes for matching", () => {
      expect(startCodingTaskAction.similes).toBeDefined();
      expect(startCodingTaskAction.similes?.length).toBeGreaterThan(0);
      expect(startCodingTaskAction.similes).toContain("LAUNCH_CODING_TASK");
    });

    it("should define expected parameters", () => {
      expect(startCodingTaskAction.parameters).toBeDefined();
      const names = (startCodingTaskAction.parameters ?? []).map((p) => p.name);
      expect(names).toContain("repo");
      expect(names).toContain("agentType");
      expect(names).toContain("task");
      expect(names).toContain("agents");
      expect(names).toContain("memoryContent");
      expect(names).toContain("label");
      expect(names).toContain("approvalPreset");
    });
  });

  // -------------------------------------------------------------------------
  // 2. validate
  // -------------------------------------------------------------------------

  describe("validate", () => {
    it("should return true when PTY service is available", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();

      const result = await startCodingTaskAction.validate?.(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when PTY service is null", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage();

      const result = await startCodingTaskAction.validate?.(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Single-agent mode
  // -------------------------------------------------------------------------

  describe("single-agent mode", () => {
    it("should call spawnSession with correct params", async () => {
      const ptyService = createMockPTYService();
      const wsService = createMockWorkspaceService();
      const runtime = createMockRuntime(ptyService, wsService);
      const message = createMockMessage({ text: "Fix the login bug" });
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Fix the login bug", agentType: "claude" } },
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining("coding-"),
          agentType: "claude",
          initialTask: "Fix the login bug",
          credentials: expect.any(Object),
          metadata: expect.objectContaining({
            messageId: "msg-123",
          }),
        }),
      );
    });

    it("should map pi agent type to shell and wrap the task as a pi command", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ text: "Fix flaky tests" });
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Fix flaky tests", agentType: "pi" } },
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "shell",
          initialTask: "pi 'Fix flaky tests'",
        }),
      );
    });

    it("should create scratch dir when no repo provided", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ text: "Research React patterns" });
      const callback = jest.fn();

      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Research React patterns" } },
        callback,
      );

      expect(result?.success).toBe(true);
      // Scratch dir is under home directory
      const spawnCall = mockSpawnSession.mock.calls[0][0];
      expect(spawnCall.workdir).toContain(".milaidy");
    });

    it("should extract repo URL from text content", async () => {
      const ptyService = createMockPTYService();
      const wsService = createMockWorkspaceService();
      const runtime = createMockRuntime(ptyService, wsService);
      const message = createMockMessage({
        text: "Clone https://github.com/acme/my-app and fix the auth bug",
      });
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Fix auth bug" } },
        callback,
      );

      expect(mockProvisionWorkspace).toHaveBeenCalledWith({
        repo: "https://github.com/acme/my-app",
      });
    });

    it("should return error when workspace service unavailable and repo specified", async () => {
      const ptyService = createMockPTYService();
      // No workspace service
      const runtime = createMockRuntime(ptyService, null);
      const message = createMockMessage();
      const callback = jest.fn();

      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { repo: "https://github.com/acme/my-app" } },
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("WORKSPACE_SERVICE_UNAVAILABLE");
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Workspace Service is not available"),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Multi-agent mode
  // -------------------------------------------------------------------------

  describe("multi-agent mode", () => {
    it("should parse pipe-delimited tasks and spawn multiple agents", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();
      const callback = jest.fn();

      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { agents: "Fix auth | Write tests | Update docs" } },
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockSpawnSession).toHaveBeenCalledTimes(3);
    });

    it("should handle agent type prefix in pipe-delimited specs", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { agents: "claude:Fix auth | gemini:Write tests" } },
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledTimes(2);

      const firstCall = mockSpawnSession.mock.calls[0][0];
      expect(firstCall.agentType).toBe("claude");
      expect(firstCall.initialTask).toBe("Fix auth");

      const secondCall = mockSpawnSession.mock.calls[1][0];
      expect(secondCall.agentType).toBe("gemini");
      expect(secondCall.initialTask).toBe("Write tests");
    });

    it("should handle pi agent prefix in pipe-delimited specs", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { agents: "pi:Investigate flaky tests" } },
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "shell",
          initialTask: "pi 'Investigate flaky tests'",
        }),
      );
    });

    it("should return error when more than 8 agents requested", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();
      const callback = jest.fn();

      const tasks = Array.from({ length: 9 }, (_, i) => `task-${i + 1}`);
      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { agents: tasks.join(" | ") } },
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("TOO_MANY_AGENTS");
      expect(mockSpawnSession).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Error paths
  // -------------------------------------------------------------------------

  describe("error paths", () => {
    it("should return error when PTY service is unavailable", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage();
      const callback = jest.fn();

      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("SERVICE_UNAVAILABLE");
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("PTY Service is not available"),
        }),
      );
    });

    it("should return error for agent type whose CLI is not installed", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();
      const callback = jest.fn();

      mockCheckAvailableAgents.mockResolvedValue([
        {
          adapter: "claude",
          installed: false,
          installCommand: "npm i -g @anthropic-ai/claude-code",
          docsUrl: "https://docs.anthropic.com",
        },
      ]);

      const result = await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Do something" } },
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
  });

  // -------------------------------------------------------------------------
  // 6. Credential building
  // -------------------------------------------------------------------------

  describe("credential building", () => {
    it("should pass credentials from runtime.getSetting() to spawnSession", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      runtime.getSetting.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          ANTHROPIC_API_KEY: "sk-ant-test",
          OPENAI_API_KEY: "sk-oai-test",
          GOOGLE_GENERATIVE_AI_API_KEY: "goog-test",
          GITHUB_TOKEN: "ghp-test",
        };
        return map[key] ?? undefined;
      });

      const message = createMockMessage({ text: "Do something" });
      const callback = jest.fn();

      await startCodingTaskAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { task: "Do something" } },
        callback,
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {
            anthropicKey: "sk-ant-test",
            openaiKey: "sk-oai-test",
            googleKey: "goog-test",
            githubToken: "ghp-test",
          },
        }),
      );
    });
  });
});
