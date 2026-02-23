/**
 * MANAGE_ISSUES action tests
 */

import { beforeEach, describe, expect, it, jest } from "bun:test";

import type { IAgentRuntime, Memory } from "@elizaos/core";

import { manageIssuesAction } from "../actions/manage-issues.js";

const mockCreateIssue = jest.fn();
const mockListIssues = jest.fn();
const mockGetIssue = jest.fn();
const mockUpdateIssue = jest.fn();
const mockAddComment = jest.fn();
const mockCloseIssue = jest.fn();
const mockReopenIssue = jest.fn();
const mockAddLabels = jest.fn();
const mockSetAuthPromptCallback = jest.fn();

const createMockWorkspaceService = () => ({
  createIssue: mockCreateIssue,
  listIssues: mockListIssues,
  getIssue: mockGetIssue,
  updateIssue: mockUpdateIssue,
  addComment: mockAddComment,
  closeIssue: mockCloseIssue,
  reopenIssue: mockReopenIssue,
  addLabels: mockAddLabels,
  setAuthPromptCallback: mockSetAuthPromptCallback,
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

const fakeIssue = (overrides: Record<string, unknown> = {}) => ({
  number: 1,
  title: "Test issue",
  body: "body",
  state: "open",
  labels: [],
  url: "https://github.com/owner/repo/issues/1",
  ...overrides,
});

describe("manageIssuesAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateIssue.mockResolvedValue(fakeIssue());
    mockListIssues.mockResolvedValue([]);
    mockGetIssue.mockResolvedValue(fakeIssue());
    mockUpdateIssue.mockResolvedValue(fakeIssue());
    mockAddComment.mockResolvedValue({
      id: 1,
      url: "https://github.com/owner/repo/issues/1#issuecomment-1",
    });
    mockCloseIssue.mockResolvedValue(fakeIssue({ state: "closed" }));
    mockReopenIssue.mockResolvedValue(fakeIssue({ state: "open" }));
    mockAddLabels.mockResolvedValue(undefined);
  });

  describe("operation inference via handler", () => {
    it("should infer create from 'create an issue on repo'", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "create an issue on owner/repo",
        repo: "owner/repo",
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { repo: "owner/repo", title: "New issue" } },
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCreateIssue).toHaveBeenCalled();
    });

    it("should infer list from 'list issues on repo'", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "list issues on owner/repo",
        repo: "owner/repo",
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockListIssues).toHaveBeenCalled();
    });

    it("should infer close from 'close issue #3'", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "close issue #3 on owner/repo",
        repo: "owner/repo",
        issueNumber: 3,
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCloseIssue).toHaveBeenCalledWith("owner/repo", 3);
    });

    it("should infer comment from 'comment on issue #5'", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "comment on issue #5 on owner/repo",
        repo: "owner/repo",
        issueNumber: 5,
        body: "This is a comment",
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockAddComment).toHaveBeenCalledWith(
        "owner/repo",
        5,
        "This is a comment",
      );
    });
  });

  describe("create operation", () => {
    it("should create an issue with explicit title and repo", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {
          parameters: {
            operation: "create",
            repo: "owner/repo",
            title: "Add login page",
            body: "We need a login page",
          },
        },
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCreateIssue).toHaveBeenCalledWith("owner/repo", {
        title: "Add login page",
        body: "We need a login page",
        labels: undefined,
      });
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("#1"),
        }),
      );
    });

    it("should bulk create from numbered items", async () => {
      mockCreateIssue
        .mockResolvedValueOnce(fakeIssue({ number: 10, title: "Add login" }))
        .mockResolvedValueOnce(fakeIssue({ number: 11, title: "Fix bug" }));

      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "1) Add login 2) Fix bug",
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { operation: "create", repo: "owner/repo" } },
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockCreateIssue).toHaveBeenCalledTimes(2);
      expect(mockCreateIssue).toHaveBeenCalledWith(
        "owner/repo",
        expect.objectContaining({ title: "Add login" }),
      );
      expect(mockCreateIssue).toHaveBeenCalledWith(
        "owner/repo",
        expect.objectContaining({ title: "Fix bug" }),
      );
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Created 2 issues"),
        }),
      );
    });
  });

  describe("list operation", () => {
    it("should list issues with state filter", async () => {
      mockListIssues.mockResolvedValue([
        fakeIssue({ number: 1, title: "Bug", state: "open", labels: ["bug"] }),
        fakeIssue({ number: 2, title: "Feature", state: "open", labels: [] }),
      ]);

      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {
          parameters: {
            operation: "list",
            repo: "owner/repo",
            state: "open",
          },
        },
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockListIssues).toHaveBeenCalledWith("owner/repo", {
        state: "open",
        labels: undefined,
      });
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Issues in owner/repo"),
        }),
      );
    });

    it("should return appropriate message when no issues found", async () => {
      mockListIssues.mockResolvedValue([]);

      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {
          parameters: {
            operation: "list",
            repo: "owner/repo",
            state: "closed",
          },
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No closed issues found"),
        }),
      );
    });
  });

  describe("error paths", () => {
    it("should error MISSING_REPO when no repo is provided", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "create an issue" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { operation: "create" } },
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("MISSING_REPO");
    });

    it("should error MISSING_TITLE when creating without title", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "just some text" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { operation: "create", repo: "owner/repo" } },
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("MISSING_TITLE");
    });

    it("should error UNKNOWN_OPERATION for invalid operation", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        { parameters: { operation: "destroy", repo: "owner/repo" } },
        callback,
      );

      expect(result?.success).toBe(false);
      expect(result?.error).toBe("UNKNOWN_OPERATION");
    });

    it("should error SERVICE_UNAVAILABLE when service is missing", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage({ text: "list issues" });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
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
          text: expect.stringContaining("not available"),
        }),
      );
    });
  });

  describe("label parsing", () => {
    it("should split comma-separated string labels", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {
          parameters: {
            operation: "create",
            repo: "owner/repo",
            title: "Labeled issue",
            labels: "bug,enhancement",
          },
        },
        callback,
      );

      expect(mockCreateIssue).toHaveBeenCalledWith("owner/repo", {
        title: "Labeled issue",
        body: "",
        labels: ["bug", "enhancement"],
      });
    });

    it("should pass through array labels", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({ text: "" });
      const callback = jest.fn();

      await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {
          parameters: {
            operation: "create",
            repo: "owner/repo",
            title: "Array labels",
            labels: ["bug", "enhancement"],
          },
        },
        callback,
      );

      expect(mockCreateIssue).toHaveBeenCalledWith("owner/repo", {
        title: "Array labels",
        body: "",
        labels: ["bug", "enhancement"],
      });
    });
  });

  describe("repo extraction from text", () => {
    it("should extract owner/repo from text when no explicit repo param", async () => {
      const ws = createMockWorkspaceService();
      const runtime = createMockRuntime(ws);
      const message = createMockMessage({
        text: "list issues on HaruHunab1320/git-workspace-service-testbed",
      });
      const callback = jest.fn();

      const result = await manageIssuesAction.handler(
        runtime as unknown as IAgentRuntime,
        message as unknown as Memory,
        undefined,
        {},
        callback,
      );

      expect(result?.success).toBe(true);
      expect(mockListIssues).toHaveBeenCalledWith(
        "HaruHunab1320/git-workspace-service-testbed",
        expect.anything(),
      );
    });
  });
});
