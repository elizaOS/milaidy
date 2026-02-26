/**
 * PROVISION_WORKSPACE action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";

type IAgentRuntime = import("@elizaos/core").IAgentRuntime;
type Memory = import("@elizaos/core").Memory;
type State = import("@elizaos/core").State;

const { provisionWorkspaceAction } = await import(
  "../actions/provision-workspace.js"
);

const mockProvisionWorkspace = jest.fn();
const mockGetWorkspace = jest.fn();
const mockListWorkspaces = jest.fn();

const createMockWorkspaceService = () => ({
  provisionWorkspace: mockProvisionWorkspace,
  getWorkspace: mockGetWorkspace,
  listWorkspaces: mockListWorkspaces.mockReturnValue([]),
});

const createMockRuntime = (workspaceService: unknown = null) => ({
  getService: jest.fn((name: string) => {
    if (name === "CODING_WORKSPACE_SERVICE") return workspaceService;
    return null;
  }),
});

const createMockMessage = (content: Record<string, unknown> = {}) => ({
  id: "msg-123",
  userId: "user-456",
  content,
});

describe("provisionWorkspaceAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvisionWorkspace.mockResolvedValue({
      id: "ws-123",
      path: "/tmp/workspaces/ws-123",
      repo: "https://github.com/user/repo.git",
      branch: "main",
      isWorktree: false,
    });
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(provisionWorkspaceAction.name).toBe("PROVISION_WORKSPACE");
    });

    it("should have similes", () => {
      expect(provisionWorkspaceAction.similes).toContain("CREATE_WORKSPACE");
      expect(provisionWorkspaceAction.similes).toContain("CLONE_REPO");
    });

    it("should define parameters", () => {
      const paramNames = (provisionWorkspaceAction.parameters ?? []).map(
        (p) => p.name,
      );
      expect(paramNames).toContain("repo");
      expect(paramNames).toContain("baseBranch");
      expect(paramNames).toContain("useWorktree");
      expect(paramNames).toContain("parentWorkspaceId");
    });
  });

  describe("validate", () => {
    it("should return true when WorkspaceService available", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);

      const result = await provisionWorkspaceAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(true);
    });

    it("should return false when WorkspaceService not available", async () => {
      const runtime = createMockRuntime(null);

      const result = await provisionWorkspaceAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("should provision a workspace by cloning repo", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
        baseBranch: "develop",
      });
      const callback = jest.fn();

      const result = await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockProvisionWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: "https://github.com/user/repo.git",
          baseBranch: "develop",
        }),
      );
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("/tmp/workspaces"),
        }),
      );
    });

    it("should provision a worktree", async () => {
      // Setup parent workspace
      mockGetWorkspace.mockReturnValue({ id: "parent-ws" });
      mockProvisionWorkspace.mockResolvedValue({
        id: "wt-456",
        path: "/tmp/workspaces/wt-456",
        repo: "https://github.com/user/repo.git",
        branch: "feature/test",
        isWorktree: true,
        parentId: "parent-ws",
      });

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
        useWorktree: true,
        parentWorkspaceId: "parent-ws",
        branch: "feature/test",
      });
      const callback = jest.fn();

      const result = await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockProvisionWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          useWorktree: true,
          parentWorkspaceId: "parent-ws",
        }),
      );
    });

    it("should use workspace from state for worktree parent", async () => {
      mockGetWorkspace.mockReturnValue({ id: "state-ws" });
      mockProvisionWorkspace.mockResolvedValue({
        id: "wt-789",
        path: "/tmp/workspaces/wt-789",
        repo: "https://github.com/user/repo.git",
        branch: "feature/from-state",
        isWorktree: true,
        parentId: "state-ws",
      });

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
        useWorktree: true,
        branch: "feature/from-state",
      });
      const state: Record<string, unknown> = {
        codingWorkspace: { id: "state-ws" },
      };
      const callback = jest.fn();

      await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(mockProvisionWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          parentWorkspaceId: "state-ws",
        }),
      );
    });

    it("should store workspace in state", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
      });
      const state: Record<string, unknown> = {};
      const callback = jest.fn();

      await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(state.codingWorkspace).toBeDefined();
      expect((state.codingWorkspace as { id: string }).id).toBe("ws-123");
      expect((state.codingWorkspace as { path: string }).path).toBe(
        "/tmp/workspaces/ws-123",
      );
    });

    it("should error when no repo URL for clone", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({});
      const callback = jest.fn();

      const result = await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("repo"),
        }),
      );
    });

    it("should error when worktree without parent", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
        useWorktree: true,
        // no parentWorkspaceId or state
      });
      const callback = jest.fn();

      const result = await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("parent"),
        }),
      );
    });

    it("should handle provision errors", async () => {
      mockProvisionWorkspace.mockRejectedValue(
        new Error("Clone failed: repository not found"),
      );

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/nonexistent.git",
      });
      const callback = jest.fn();

      const result = await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Clone failed"),
        }),
      );
    });

    it("should provision workspace with provided repo", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        repo: "https://github.com/user/repo.git",
      });
      const callback = jest.fn();

      await provisionWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockProvisionWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: "https://github.com/user/repo.git",
        }),
      );
    });
  });
});
