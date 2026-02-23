/**
 * FINALIZE_WORKSPACE action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";

import type { IAgentRuntime, Memory, State } from "@elizaos/core";

import { finalizeWorkspaceAction } from "../actions/finalize-workspace.js";

const mockGetWorkspace = jest.fn();
const mockListWorkspaces = jest.fn();
const mockGetStatus = jest.fn();
const mockCommit = jest.fn();
const mockPush = jest.fn();
const mockCreatePR = jest.fn();

const createMockWorkspaceService = () => ({
  getWorkspace: mockGetWorkspace,
  listWorkspaces: mockListWorkspaces.mockReturnValue([]),
  getStatus: mockGetStatus,
  commit: mockCommit,
  push: mockPush,
  createPR: mockCreatePR,
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

describe("finalizeWorkspaceAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetWorkspace.mockReturnValue({
      id: "ws-123",
      path: "/tmp/workspaces/ws-123",
      branch: "feature/test",
      isWorktree: false,
    });

    mockGetStatus.mockResolvedValue({
      branch: "feature/test",
      clean: false,
      modified: ["src/index.ts"],
      staged: [],
      untracked: [],
    });

    mockCommit.mockResolvedValue("abc123def456");
    mockPush.mockResolvedValue(undefined);
    mockCreatePR.mockResolvedValue({
      number: 42,
      url: "https://github.com/user/repo/pull/42",
      title: "Test PR",
    });
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(finalizeWorkspaceAction.name).toBe("FINALIZE_WORKSPACE");
    });

    it("should have similes", () => {
      expect(finalizeWorkspaceAction.similes).toContain("COMMIT_AND_PR");
      expect(finalizeWorkspaceAction.similes).toContain("CREATE_PR");
    });

    it("should define parameters", () => {
      const paramNames = (finalizeWorkspaceAction.parameters ?? []).map(
        (p) => p.name,
      );
      expect(paramNames).toContain("workspaceId");
      expect(paramNames).toContain("commitMessage");
      expect(paramNames).toContain("prTitle");
      expect(paramNames).toContain("prBody");
      expect(paramNames).toContain("baseBranch");
      expect(paramNames).toContain("draft");
      expect(paramNames).toContain("skipPR");
    });
  });

  describe("validate", () => {
    it("should return true when WorkspaceService available", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);

      const result = await finalizeWorkspaceAction.validate?.(
        runtime as unknown as IAgentRuntime,
        createMockMessage() as unknown as Memory,
      );
      expect(result).toBe(true);
    });
  });

  describe("handler", () => {
    it("should commit, push, and create PR", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        workspaceId: "ws-123",
        commitMessage: "feat: add new feature",
        prTitle: "Add new feature",
        prBody: "This adds the new feature",
      });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCommit).toHaveBeenCalledWith("ws-123", {
        message: "feat: add new feature",
        all: true,
      });
      expect(mockPush).toHaveBeenCalledWith("ws-123", { setUpstream: true });
      expect(mockCreatePR).toHaveBeenCalledWith("ws-123", {
        title: "Add new feature",
        body: "This adds the new feature",
        base: undefined,
        draft: undefined,
      });
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("PR #42"),
        }),
      );
    });

    it("should use workspace from state", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        commitMessage: "test commit",
      });
      const state: Record<string, unknown> = {
        codingWorkspace: { id: "ws-from-state" },
      };
      mockGetWorkspace.mockReturnValue({
        id: "ws-from-state",
        branch: "main",
      });
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        state as unknown as State,
        {},
        callback,
      );

      expect(mockGetStatus).toHaveBeenCalledWith("ws-from-state");
    });

    it("should use most recent workspace if none specified", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);

      // Set up mocks AFTER creating service (factory resets listWorkspaces)
      mockListWorkspaces.mockReturnValue([{ id: "ws-1" }, { id: "ws-2" }]);
      mockGetWorkspace.mockReturnValue({
        id: "ws-2",
        branch: "main",
      });
      const message = createMockMessage({});
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockGetStatus).toHaveBeenCalledWith("ws-2");
    });

    it("should skip PR when skipPR is true", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        workspaceId: "ws-123",
        skipPR: true,
      });
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockCommit).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalled();
      expect(mockCreatePR).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.not.stringContaining("PR #"),
        }),
      );
    });

    it("should create draft PR when requested", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        workspaceId: "ws-123",
        prTitle: "WIP: New feature",
        draft: true,
      });
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockCreatePR).toHaveBeenCalledWith(
        "ws-123",
        expect.objectContaining({
          draft: true,
        }),
      );
    });

    it("should use custom base branch", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        workspaceId: "ws-123",
        prTitle: "Feature",
        baseBranch: "develop",
      });
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockCreatePR).toHaveBeenCalledWith(
        "ws-123",
        expect.objectContaining({
          base: "develop",
        }),
      );
    });

    it("should use default commit message if not provided", async () => {
      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({
        workspaceId: "ws-123",
      });
      const callback = jest.fn();

      await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(mockCommit).toHaveBeenCalledWith("ws-123", {
        message: expect.stringContaining("automated changes"),
        all: true,
      });
    });

    it("should handle clean workspace (no changes)", async () => {
      mockGetStatus.mockResolvedValue({
        branch: "main",
        clean: true,
        modified: [],
        staged: [],
        untracked: [],
      });

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({ workspaceId: "ws-123" });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCommit).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No changes"),
        }),
      );
    });

    it("should error when no workspace available", async () => {
      mockListWorkspaces.mockReturnValue([]);

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({});
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No workspace"),
        }),
      );
    });

    it("should error when workspace not found", async () => {
      mockGetWorkspace.mockReturnValue(undefined);
      mockListWorkspaces.mockReturnValue([{ id: "other" }]);

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({ workspaceId: "nonexistent" });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
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

    it("should handle commit errors", async () => {
      mockCommit.mockRejectedValue(
        new Error("Commit failed: nothing to commit"),
      );

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({ workspaceId: "ws-123" });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
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

    it("should handle push errors", async () => {
      mockPush.mockRejectedValue(new Error("Push failed: permission denied"));

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({ workspaceId: "ws-123" });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("permission denied"),
        }),
      );
    });

    it("should handle PR creation errors", async () => {
      mockCreatePR.mockRejectedValue(new Error("PR creation failed"));

      const workspaceService = createMockWorkspaceService();
      const runtime = createMockRuntime(workspaceService);
      const message = createMockMessage({ workspaceId: "ws-123" });
      const callback = jest.fn();

      const result = await finalizeWorkspaceAction.handler(
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
