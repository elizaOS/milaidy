/**
 * Coding Workspace Service - Manages git workspaces for coding tasks
 *
 * Delegates to:
 * - workspace-github.ts  (issue management, OAuth, PAT auth)
 * - workspace-git-ops.ts (status, commit, push, PR creation)
 * - workspace-lifecycle.ts (GC, scratch dir cleanup)
 * - workspace-types.ts   (shared interface definitions)
 *
 * @module services/workspace-service
 */

import * as os from "node:os";
import * as path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import {
  type CreateIssueOptions,
  CredentialService,
  GitHubPatClient,
  type IssueComment,
  type IssueInfo,
  type IssueState,
  MemoryTokenStore,
  type PullRequestInfo,
  type WorkspaceConfig,
  type WorkspaceEvent,
  WorkspaceService,
} from "git-workspace-service";

import type { AuthPromptCallback } from "./workspace-github.js";
import {
  type GitHubContext,
  addComment as ghAddComment,
  addLabels as ghAddLabels,
  closeIssue as ghCloseIssue,
  createIssue as ghCreateIssue,
  getIssue as ghGetIssue,
  listComments as ghListComments,
  listIssues as ghListIssues,
  reopenIssue as ghReopenIssue,
  updateIssue as ghUpdateIssue,
} from "./workspace-github.js";

export type { AuthPromptCallback } from "./workspace-github.js";

import {
  commit as gitCommit,
  createPR as gitCreatePR,
  getStatus as gitGetStatus,
  push as gitPush,
} from "./workspace-git-ops.js";

import {
  gcOrphanedWorkspaces,
  removeScratchDir,
} from "./workspace-lifecycle.js";

export type {
  CodingWorkspaceConfig,
  CommitOptions,
  PROptions,
  ProvisionWorkspaceOptions,
  PushOptions,
  WorkspaceResult,
  WorkspaceStatusResult,
} from "./workspace-types.js";

import type {
  CodingWorkspaceConfig,
  CommitOptions,
  PROptions,
  ProvisionWorkspaceOptions,
  PushOptions,
  WorkspaceResult,
  WorkspaceStatusResult,
} from "./workspace-types.js";

type WorkspaceEventCallback = (event: WorkspaceEvent) => void;

export class CodingWorkspaceService {
  static serviceType = "CODING_WORKSPACE_SERVICE";
  capabilityDescription = "Manages git workspaces for coding tasks";

  private runtime: IAgentRuntime;
  private workspaceService: WorkspaceService | null = null;
  private credentialService: CredentialService | null = null;
  private githubClient: GitHubPatClient | null = null;
  private githubAuthInProgress: Promise<GitHubPatClient> | null = null;
  private serviceConfig: CodingWorkspaceConfig;
  private workspaces: Map<string, WorkspaceResult> = new Map();
  private labels: Map<string, string> = new Map(); // label -> workspaceId
  private eventCallbacks: WorkspaceEventCallback[] = [];
  private authPromptCallback: AuthPromptCallback | null = null;

  constructor(runtime: IAgentRuntime, config: CodingWorkspaceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      baseDir:
        config.baseDir ?? path.join(os.homedir(), ".milaidy", "workspaces"),
      branchPrefix: config.branchPrefix ?? "milaidy",
      debug: config.debug ?? false,
      workspaceTtlMs: config.workspaceTtlMs ?? 24 * 60 * 60 * 1000,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<CodingWorkspaceService> {
    const config = runtime.getSetting("CODING_WORKSPACE_CONFIG") as
      | CodingWorkspaceConfig
      | null
      | undefined;
    const service = new CodingWorkspaceService(runtime, config ?? {});
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("CODING_WORKSPACE_SERVICE") as unknown as
      | CodingWorkspaceService
      | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    this.credentialService = new CredentialService({
      tokenStore: new MemoryTokenStore(),
    });

    this.workspaceService = new WorkspaceService({
      config: {
        baseDir: this.serviceConfig.baseDir as string,
        branchPrefix: this.serviceConfig.branchPrefix,
      },
      credentialService: this.credentialService,
      logger: this.serviceConfig.debug
        ? {
            info: (data: unknown, msg?: string) =>
              console.log(`[WorkspaceService] ${msg ?? ""}`, data),
            warn: (data: unknown, msg?: string) =>
              console.warn(`[WorkspaceService] ${msg ?? ""}`, data),
            error: (data: unknown, msg?: string) =>
              console.error(`[WorkspaceService] ${msg ?? ""}`, data),
            debug: (_data: unknown, msg?: string) => this.log(`${msg ?? ""}`),
          }
        : undefined,
    });

    await this.workspaceService.initialize();

    const githubToken = this.runtime.getSetting("GITHUB_TOKEN") as
      | string
      | undefined;
    if (githubToken) {
      this.githubClient = new GitHubPatClient({ token: githubToken });
      this.log("GitHubPatClient initialized with PAT");
    } else {
      this.log(
        "GITHUB_TOKEN not set - will use OAuth device flow when GitHub access is needed",
      );
    }

    this.workspaceService.onEvent((event: WorkspaceEvent) => {
      this.emitEvent(event);
    });

    this.log("CodingWorkspaceService initialized");

    // Run startup GC in background (non-blocking)
    this.gcOrphanedWorkspaces().catch((err) => {
      console.warn("[CodingWorkspaceService] Startup GC failed:", err);
    });
  }

  async stop(): Promise<void> {
    for (const [id] of this.workspaces) {
      try {
        await this.removeWorkspace(id);
      } catch (err) {
        this.log(`Error cleaning up workspace ${id}: ${err}`);
      }
    }
    this.workspaces.clear();
    this.workspaceService = null;
    this.credentialService = null;
    this.githubClient = null;
    this.log("CodingWorkspaceService shutdown complete");
  }

  /** Provision a new workspace */
  async provisionWorkspace(
    options: ProvisionWorkspaceOptions,
  ): Promise<WorkspaceResult> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    // Strip trailing slashes to prevent git-workspace-service from
    // appending .git incorrectly (e.g. "repo/" -> "repo/.git")
    const repo = options.repo.replace(/\/+$/, "");
    const executionId = options.execution?.id ?? `exec-${Date.now()}`;
    const taskId = options.task?.id ?? `task-${Date.now()}`;

    const workspaceConfig: WorkspaceConfig = {
      repo,
      strategy: options.useWorktree ? "worktree" : "clone",
      parentWorkspace: options.parentWorkspaceId,
      branchStrategy: "feature_branch",
      branchName: options.branchName,
      baseBranch: options.baseBranch ?? "main",
      execution: {
        id: executionId,
        patternName: options.execution?.patternName ?? "milaidy-coding",
      },
      task: {
        id: taskId,
        role: options.task?.role ?? "coding-agent",
        slug: options.task?.slug,
      },
      userCredentials: options.userCredentials
        ? {
            type: options.userCredentials.type,
            token: options.userCredentials.token ?? "",
            provider: "github",
          }
        : undefined,
    };

    const workspace = await this.workspaceService.provision(workspaceConfig);
    const result: WorkspaceResult = {
      id: workspace.id,
      path: workspace.path,
      branch: workspace.branch.name,
      baseBranch: workspace.branch.baseBranch,
      isWorktree: workspace.strategy === "worktree",
      repo: workspace.repo,
      status: workspace.status,
    };

    this.workspaces.set(workspace.id, result);
    this.log(`Provisioned workspace ${workspace.id}`);
    return result;
  }

  getWorkspace(id: string): WorkspaceResult | undefined {
    return this.workspaces.get(id);
  }

  listWorkspaces(): WorkspaceResult[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Assign a semantic label to a workspace (e.g. "auth-bugfix").
   * If the label already exists, it is reassigned to the new workspace.
   */
  setLabel(workspaceId: string, label: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    if (workspace.label) {
      this.labels.delete(workspace.label);
    }
    const existing = this.labels.get(label);
    if (existing && existing !== workspaceId) {
      const oldWs = this.workspaces.get(existing);
      if (oldWs) oldWs.label = undefined;
    }
    workspace.label = label;
    this.labels.set(label, workspaceId);
    this.log(`Labeled workspace ${workspaceId} as "${label}"`);
  }

  getWorkspaceByLabel(label: string): WorkspaceResult | undefined {
    const id = this.labels.get(label);
    return id ? this.workspaces.get(id) : undefined;
  }

  /** Resolve a workspace by label or ID. */
  resolveWorkspace(labelOrId: string): WorkspaceResult | undefined {
    return (
      this.getWorkspaceByLabel(labelOrId) ?? this.workspaces.get(labelOrId)
    );
  }

  // === Delegated Git Operations ===

  async getStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return gitGetStatus(workspace.path);
  }

  async commit(workspaceId: string, options: CommitOptions): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const hash = await gitCommit(workspace.path, options, (msg) =>
      this.log(msg),
    );
    this.log(`Committed ${hash.slice(0, 8)} in workspace ${workspaceId}`);
    return hash;
  }

  async push(workspaceId: string, options?: PushOptions): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    await gitPush(workspace.path, workspace.branch, options, (msg) =>
      this.log(msg),
    );
    this.log(`Pushed workspace ${workspaceId}`);
  }

  async createPR(
    workspaceId: string,
    options: PROptions,
  ): Promise<PullRequestInfo> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return gitCreatePR(
      this.workspaceService,
      workspace,
      workspaceId,
      options,
      (msg) => this.log(msg),
    );
  }

  // === Delegated GitHub / Issue Management ===

  private getGitHubContext(): GitHubContext {
    return {
      runtime: this.runtime,
      githubClient: this.githubClient,
      setGithubClient: (client: GitHubPatClient) => {
        this.githubClient = client;
      },
      githubAuthInProgress: this.githubAuthInProgress,
      setGithubAuthInProgress: (p: Promise<GitHubPatClient> | null) => {
        this.githubAuthInProgress = p;
      },
      authPromptCallback: this.authPromptCallback,
      log: (msg: string) => this.log(msg),
    };
  }

  /** Set a callback to surface OAuth auth prompts to the user. */
  setAuthPromptCallback(callback: AuthPromptCallback): void {
    this.authPromptCallback = callback;
  }

  async createIssue(
    repo: string,
    options: CreateIssueOptions,
  ): Promise<IssueInfo> {
    return ghCreateIssue(this.getGitHubContext(), repo, options);
  }

  async getIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    return ghGetIssue(this.getGitHubContext(), repo, issueNumber);
  }

  async listIssues(
    repo: string,
    options?: {
      state?: IssueState | "all";
      labels?: string[];
      assignee?: string;
    },
  ): Promise<IssueInfo[]> {
    return ghListIssues(this.getGitHubContext(), repo, options);
  }

  async updateIssue(
    repo: string,
    issueNumber: number,
    options: {
      title?: string;
      body?: string;
      state?: IssueState;
      labels?: string[];
      assignees?: string[];
    },
  ): Promise<IssueInfo> {
    return ghUpdateIssue(this.getGitHubContext(), repo, issueNumber, options);
  }

  async addComment(
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<IssueComment> {
    return ghAddComment(this.getGitHubContext(), repo, issueNumber, body);
  }

  async listComments(
    repo: string,
    issueNumber: number,
  ): Promise<IssueComment[]> {
    return ghListComments(this.getGitHubContext(), repo, issueNumber);
  }

  async closeIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    return ghCloseIssue(this.getGitHubContext(), repo, issueNumber);
  }

  async reopenIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    return ghReopenIssue(this.getGitHubContext(), repo, issueNumber);
  }

  async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    return ghAddLabels(this.getGitHubContext(), repo, issueNumber, labels);
  }

  // === Workspace Lifecycle ===

  async removeWorkspace(workspaceId: string): Promise<void> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }
    await this.workspaceService.cleanup(workspaceId);
    const workspace = this.workspaces.get(workspaceId);
    if (workspace?.label) {
      this.labels.delete(workspace.label);
    }
    this.workspaces.delete(workspaceId);
    this.log(`Removed workspace ${workspaceId}`);
  }

  onEvent(callback: WorkspaceEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index !== -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  private emitEvent(event: WorkspaceEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  /** Remove a scratch directory (non-git workspace) under the workspaces base dir. */
  async removeScratchDir(dirPath: string): Promise<void> {
    return removeScratchDir(
      dirPath,
      this.serviceConfig.baseDir as string,
      (msg) => this.log(msg),
    );
  }

  /** GC orphaned workspace directories older than workspaceTtlMs. */
  private async gcOrphanedWorkspaces(): Promise<void> {
    return gcOrphanedWorkspaces(
      this.serviceConfig.baseDir as string,
      this.serviceConfig.workspaceTtlMs ?? 24 * 60 * 60 * 1000,
      new Set(this.workspaces.keys()),
      (msg) => this.log(msg),
    );
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[CodingWorkspaceService] ${message}`);
    }
  }
}
