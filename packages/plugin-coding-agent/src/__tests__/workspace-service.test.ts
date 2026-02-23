/**
 * CodingWorkspaceService unit tests
 *
 * Tests git workspace management, branch operations, and PR creation.
 */

import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

import type { IAgentRuntime } from "@elizaos/core";

// Track workspace count for unique IDs
let workspaceCounter = 0;

// Mock workspace service
const mockWorkspaceService = {
  initialize: jest.fn(),
  provision: jest.fn(),
  finalize: jest.fn(),
  cleanup: jest.fn(),
  onEvent: jest.fn(),
};

// Mock modules BEFORE importing CodingWorkspaceService
// Classes are required because arrow functions cannot be used with `new`.
mock.module("git-workspace-service", () => ({
  WorkspaceService: class {
    constructor() {
      Object.assign(this, mockWorkspaceService);
    }
  },
  CredentialService: class {},
  MemoryTokenStore: class {},
  GitHubPatClient: class {},
  OAuthDeviceFlow: class {},
}));

mock.module("node:child_process", () => ({
  execSync: jest.fn(() => ""),
  execFileSync: jest.fn((_cmd: string, args: string[]) => {
    if (args.includes("--porcelain")) return "";
    if (args.includes("--show-current")) return "main\n";
    if (args.includes("HEAD")) return "abc123def456\n";
    return "";
  }),
}));

// Dynamic import after mocks are registered
const { CodingWorkspaceService } = await import(
  "../services/workspace-service.js"
);
type CodingWorkspaceConfig =
  import("../services/workspace-service.js").CodingWorkspaceConfig;
type WorkspaceResult =
  import("../services/workspace-service.js").WorkspaceResult;

// Mock runtime
const createMockRuntime = (settings: Record<string, unknown> = {}) => ({
  getSetting: jest.fn((key: string) => settings[key]),
  getService: jest.fn(),
});

describe("CodingWorkspaceService", () => {
  let service: InstanceType<typeof CodingWorkspaceService>;

  beforeEach(async () => {
    workspaceCounter = 0;
    jest.clearAllMocks();

    // Reset mock implementations
    mockWorkspaceService.initialize.mockResolvedValue(undefined);
    mockWorkspaceService.provision.mockImplementation(() =>
      Promise.resolve({
        id: `ws-${++workspaceCounter}`,
        path: `/tmp/workspaces/ws-${workspaceCounter}`,
        branch: { name: "milaidy/test", baseBranch: "main" },
        strategy: "clone",
        repo: "https://github.com/user/repo.git",
        status: "ready",
      }),
    );
    mockWorkspaceService.finalize.mockResolvedValue({
      number: 42,
      url: "https://github.com/user/repo/pull/42",
      title: "Test PR",
    });
    mockWorkspaceService.cleanup.mockResolvedValue(undefined);
    mockWorkspaceService.onEvent.mockImplementation(() => {});

    const runtime = createMockRuntime();
    service = await CodingWorkspaceService.start(
      runtime as unknown as IAgentRuntime,
    );
  });

  describe("initialization", () => {
    it("should initialize with default config", () => {
      expect(service).toBeInstanceOf(CodingWorkspaceService);
    });

    it("should accept custom config from runtime settings", async () => {
      const customConfig: CodingWorkspaceConfig = {
        baseDir: "/custom/workspaces",
        debug: true,
      };
      const runtime = createMockRuntime({
        CODING_WORKSPACE_CONFIG: customConfig,
      });
      const customService = await CodingWorkspaceService.start(
        runtime as unknown as IAgentRuntime,
      );
      expect(customService).toBeInstanceOf(CodingWorkspaceService);
    });
  });

  describe("workspace provisioning", () => {
    it("should provision a workspace", async () => {
      const workspace = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
        baseBranch: "main",
      });

      expect(workspace).toBeDefined();
      expect(workspace.id).toMatch(/^ws-\d+$/);
      expect(workspace.path).toMatch(/^\/tmp\/workspaces\/ws-\d+$/);
      expect(workspace.branch).toBe("milaidy/test");
      expect(workspace.isWorktree).toBe(false);
    });

    it("should provision with worktree strategy", async () => {
      // First provision parent
      const parent = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });

      // Set up worktree mock
      mockWorkspaceService.provision.mockImplementationOnce(() =>
        Promise.resolve({
          id: `wt-${++workspaceCounter}`,
          path: `/tmp/workspaces/wt-${workspaceCounter}`,
          branch: { name: "milaidy/feature", baseBranch: "main" },
          strategy: "worktree",
          repo: "https://github.com/user/repo.git",
          status: "ready",
        }),
      );

      // Create worktree
      const worktree = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
        useWorktree: true,
        parentWorkspaceId: parent.id,
      });

      expect(worktree.isWorktree).toBe(true);
    });
  });

  describe("workspace retrieval", () => {
    it("should get workspace by ID", async () => {
      const created = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });

      const retrieved = service.getWorkspace(created.id);
      expect(retrieved).toEqual(created);
    });

    it("should return undefined for unknown workspace", () => {
      const workspace = service.getWorkspace("unknown-id");
      expect(workspace).toBeUndefined();
    });

    it("should list all workspaces", async () => {
      await service.provisionWorkspace({
        repo: "https://github.com/user/repo1.git",
      });

      const workspaces = service.listWorkspaces();
      expect(workspaces.length).toBeGreaterThan(0);
    });
  });

  describe("commit and push", () => {
    let workspace: WorkspaceResult;

    beforeEach(async () => {
      workspace = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });
    });

    it("should commit changes with message", async () => {
      const hash = await service.commit(workspace.id, {
        message: "feat: add new feature",
        all: true,
      });

      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should push changes", async () => {
      await service.push(workspace.id);
      // If it doesn't throw, it succeeded
    });

    it("should push with force", async () => {
      await service.push(workspace.id, { force: true });
      // If it doesn't throw, it succeeded
    });

    it("should push with upstream", async () => {
      await service.push(workspace.id, { setUpstream: true });
      // If it doesn't throw, it succeeded
    });

    it("should throw for unknown workspace git operations", async () => {
      await expect(
        service.commit("unknown-id", { message: "test", all: true }),
      ).rejects.toThrow(/not found/);

      await expect(service.push("unknown-id")).rejects.toThrow(/not found/);
    });
  });

  describe("status", () => {
    let workspace: WorkspaceResult;

    beforeEach(async () => {
      workspace = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });
    });

    it("should get workspace status", async () => {
      const status = await service.getStatus(workspace.id);

      expect(status.branch).toBe("main");
      expect(status.clean).toBe(true);
    });

    it("should throw for unknown workspace status", async () => {
      await expect(service.getStatus("unknown-id")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("PR creation", () => {
    let workspace: WorkspaceResult;

    beforeEach(async () => {
      workspace = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });
    });

    it("should create a pull request", async () => {
      const pr = await service.createPR(workspace.id, {
        title: "Test PR",
        body: "Test body",
      });

      expect(pr.number).toBe(42);
      expect(pr.url).toBe("https://github.com/user/repo/pull/42");
    });

    it("should create PR with base branch", async () => {
      await service.createPR(workspace.id, {
        title: "Test PR",
        body: "Test body",
        base: "develop",
      });

      expect(mockWorkspaceService.finalize).toHaveBeenCalled();
    });

    it("should create draft PR", async () => {
      await service.createPR(workspace.id, {
        title: "Test PR",
        body: "Test body",
        draft: true,
      });

      expect(mockWorkspaceService.finalize).toHaveBeenCalled();
    });

    it("should throw for unknown workspace PR creation", async () => {
      await expect(
        service.createPR("unknown-id", { title: "Test", body: "Test body" }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("workspace removal", () => {
    it("should remove a workspace", async () => {
      const workspace = await service.provisionWorkspace({
        repo: "https://github.com/user/repo.git",
      });

      await service.removeWorkspace(workspace.id);

      const retrieved = service.getWorkspace(workspace.id);
      expect(retrieved).toBeUndefined();
    });
  });
});
