/**
 * Coding Agent API Routes
 *
 * Provides REST endpoints for:
 * - PTY session management (spawn, list, stop coding agents)
 * - Workspace provisioning (clone repos, create worktrees)
 * - Preflight checks (verify CLI tools are installed)
 *
 * @module api/routes
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { IAgentRuntime } from "@elizaos/core";
import { PTYService } from "../services/pty-service.js";
import { CodingWorkspaceService } from "../services/workspace-service.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface RouteContext {
  runtime: IAgentRuntime;
  ptyService: PTYService | null;
  workspaceService: CodingWorkspaceService | null;
}

// Helper to parse JSON body
async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, data: JsonValue, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Helper to send error
function sendError(res: ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

/**
 * Handle coding agent routes
 * Returns true if the route was handled, false otherwise
 */
export async function handleCodingAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  ctx: RouteContext
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // === Preflight Check ===
  // GET /api/coding-agents/preflight
  if (method === "GET" && pathname === "/api/coding-agents/preflight") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const results = await ctx.ptyService.checkAvailableAgents();
      sendJson(res, results as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Preflight check failed", 500);
    }
    return true;
  }

  // === Workspace Files ===
  // GET /api/coding-agents/workspace-files?agentType=claude
  if (method === "GET" && pathname === "/api/coding-agents/workspace-files") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const agentType = url.searchParams.get("agentType");
      if (!agentType) {
        sendError(res, "agentType query parameter required (claude, gemini, codex, aider)", 400);
        return true;
      }

      const files = ctx.ptyService.getWorkspaceFiles(agentType as import("coding-agent-adapters").AdapterType);
      const memoryFilePath = ctx.ptyService.getMemoryFilePath(agentType as import("coding-agent-adapters").AdapterType);
      sendJson(res, { agentType, memoryFilePath, files } as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to get workspace files", 500);
    }
    return true;
  }

  // === Approval Presets ===
  // GET /api/coding-agents/approval-presets
  if (method === "GET" && pathname === "/api/coding-agents/approval-presets") {
    try {
      const { listPresets } = await import("coding-agent-adapters");
      const presets = listPresets();
      sendJson(res, presets as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to list presets", 500);
    }
    return true;
  }

  // GET /api/coding-agents/approval-config?agentType=claude&preset=autonomous
  if (method === "GET" && pathname === "/api/coding-agents/approval-config") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const agentType = url.searchParams.get("agentType");
    const preset = url.searchParams.get("preset");
    if (!agentType || !preset) {
      sendError(res, "agentType and preset query parameters required", 400);
      return true;
    }

    try {
      const config = ctx.ptyService.getApprovalConfig(
        agentType as import("coding-agent-adapters").AdapterType,
        preset as import("coding-agent-adapters").ApprovalPreset,
      );
      sendJson(res, config as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to generate config", 500);
    }
    return true;
  }

  // === List Agents ===
  // GET /api/coding-agents
  if (method === "GET" && pathname === "/api/coding-agents") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const sessions = await ctx.ptyService.listSessions();
      sendJson(res, sessions as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to list agents", 500);
    }
    return true;
  }

  // === Spawn Agent ===
  // POST /api/coding-agents/spawn
  if (method === "POST" && pathname === "/api/coding-agents/spawn") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const body = await parseBody(req);
      const { agentType, workdir, task, memoryContent, approvalPreset, customCredentials, metadata } = body;

      // Build credentials from runtime
      const credentials = {
        anthropicKey: ctx.runtime.getSetting("ANTHROPIC_API_KEY") as string | undefined,
        openaiKey: ctx.runtime.getSetting("OPENAI_API_KEY") as string | undefined,
        googleKey: ctx.runtime.getSetting("GOOGLE_GENERATIVE_AI_API_KEY") as string | undefined,
        githubToken: ctx.runtime.getSetting("GITHUB_TOKEN") as string | undefined,
      };

      const session = await ctx.ptyService.spawnSession({
        name: `agent-${Date.now()}`,
        agentType: ((agentType as string) || "claude") as import("../services/pty-service.js").CodingAgentType,
        workdir: workdir as string,
        initialTask: task as string,
        memoryContent: memoryContent as string | undefined,
        credentials,
        approvalPreset: approvalPreset as import("coding-agent-adapters").ApprovalPreset | undefined,
        customCredentials: customCredentials as Record<string, string> | undefined,
        metadata: metadata as Record<string, unknown>,
      });

      sendJson(res, {
        sessionId: session.id,
        agentType: session.agentType,
        workdir: session.workdir,
        status: session.status,
      } as unknown as JsonValue, 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to spawn agent", 500);
    }
    return true;
  }

  // === Get Agent Status ===
  // GET /api/coding-agents/:id
  const agentMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)$/);
  if (method === "GET" && agentMatch) {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    const sessionId = agentMatch[1];
    const session = ctx.ptyService.getSession(sessionId);

    if (!session) {
      sendError(res, "Agent session not found", 404);
      return true;
    }

    sendJson(res, session as unknown as JsonValue);
    return true;
  }

  // === Send to Agent ===
  // POST /api/coding-agents/:id/send
  const sendMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)\/send$/);
  if (method === "POST" && sendMatch) {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const sessionId = sendMatch[1];
      const body = await parseBody(req);
      const { input } = body;

      if (!input || typeof input !== "string") {
        sendError(res, "Input required", 400);
        return true;
      }

      await ctx.ptyService.sendToSession(sessionId, input);
      sendJson(res, { success: true });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to send input", 500);
    }
    return true;
  }

  // === Stop Agent ===
  // POST /api/coding-agents/:id/stop
  const stopMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)\/stop$/);
  if (method === "POST" && stopMatch) {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const sessionId = stopMatch[1];
      await ctx.ptyService.stopSession(sessionId);
      sendJson(res, { success: true, sessionId });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to stop agent", 500);
    }
    return true;
  }

  // === Get Agent Output ===
  // GET /api/coding-agents/:id/output
  const outputMatch = pathname.match(/^\/api\/coding-agents\/([^/]+)\/output$/);
  if (method === "GET" && outputMatch) {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }

    try {
      const sessionId = outputMatch[1];
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const lines = parseInt(url.searchParams.get("lines") || "100");

      const output = await ctx.ptyService.getSessionOutput(sessionId, lines);
      sendJson(res, { sessionId, output });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to get output", 500);
    }
    return true;
  }

  // === Workspace Routes ===

  // POST /api/workspace/provision
  if (method === "POST" && pathname === "/api/workspace/provision") {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const body = await parseBody(req);
      const { repo, baseBranch, useWorktree, parentWorkspaceId, branchName } = body;

      const workspace = await ctx.workspaceService.provisionWorkspace({
        repo: repo as string,
        baseBranch: baseBranch as string,
        useWorktree: useWorktree as boolean,
        parentWorkspaceId: parentWorkspaceId as string,
      });

      sendJson(res, {
        id: workspace.id,
        path: workspace.path,
        branch: workspace.branch,
        isWorktree: workspace.isWorktree,
      } as unknown as JsonValue, 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to provision workspace", 500);
    }
    return true;
  }

  // GET /api/workspace/:id
  const workspaceMatch = pathname.match(/^\/api\/workspace\/([^/]+)$/);
  if (method === "GET" && workspaceMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const workspaceId = workspaceMatch[1];
      const status = await ctx.workspaceService.getStatus(workspaceId);
      sendJson(res, status as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to get workspace", 500);
    }
    return true;
  }

  // POST /api/workspace/:id/commit
  const commitMatch = pathname.match(/^\/api\/workspace\/([^/]+)\/commit$/);
  if (method === "POST" && commitMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const workspaceId = commitMatch[1];
      const body = await parseBody(req);
      const { message, files } = body;

      const result = await ctx.workspaceService.commit(workspaceId, {
        message: message as string,
        all: true,
      });

      sendJson(res, result as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to commit", 500);
    }
    return true;
  }

  // POST /api/workspace/:id/push
  const pushMatch = pathname.match(/^\/api\/workspace\/([^/]+)\/push$/);
  if (method === "POST" && pushMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const workspaceId = pushMatch[1];
      const body = await parseBody(req);

      const result = await ctx.workspaceService.push(workspaceId, {
        force: body.force as boolean,
        setUpstream: body.setUpstream as boolean,
      });

      sendJson(res, result as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to push", 500);
    }
    return true;
  }

  // POST /api/workspace/:id/pr
  const prMatch = pathname.match(/^\/api\/workspace\/([^/]+)\/pr$/);
  if (method === "POST" && prMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const workspaceId = prMatch[1];
      const body = await parseBody(req);

      const result = await ctx.workspaceService.createPR(workspaceId, {
        title: body.title as string,
        body: body.body as string,
        base: body.baseBranch as string,
        draft: body.draft as boolean,
      });

      sendJson(res, result as unknown as JsonValue, 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to create PR", 500);
    }
    return true;
  }

  // DELETE /api/workspace/:id
  const deleteMatch = pathname.match(/^\/api\/workspace\/([^/]+)$/);
  if (method === "DELETE" && deleteMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const workspaceId = deleteMatch[1];
      await ctx.workspaceService.removeWorkspace(workspaceId);
      sendJson(res, { success: true, workspaceId });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to remove workspace", 500);
    }
    return true;
  }

  // === Issue Routes ===

  // GET /api/issues?repo=owner/repo&state=open
  if (method === "GET" && pathname === "/api/issues") {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const repo = url.searchParams.get("repo");
      if (!repo) {
        sendError(res, "repo query parameter required", 400);
        return true;
      }
      const state = url.searchParams.get("state") as "open" | "closed" | "all" | null;
      const labelsParam = url.searchParams.get("labels");
      const labels = labelsParam ? labelsParam.split(",").map((s) => s.trim()) : undefined;

      const issues = await ctx.workspaceService.listIssues(repo, {
        state: state ?? "open",
        labels,
      });
      sendJson(res, issues as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to list issues", 500);
    }
    return true;
  }

  // POST /api/issues
  if (method === "POST" && pathname === "/api/issues") {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const body = await parseBody(req);
      const { repo, title, body: issueBody, labels } = body;
      if (!repo || !title) {
        sendError(res, "repo and title are required", 400);
        return true;
      }

      const issue = await ctx.workspaceService.createIssue(repo as string, {
        title: title as string,
        body: (issueBody as string) ?? "",
        labels: labels as string[] | undefined,
      });
      sendJson(res, issue as unknown as JsonValue, 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to create issue", 500);
    }
    return true;
  }

  // GET /api/issues/:repo/:number (e.g., /api/issues/owner/repo/42)
  const issueGetMatch = pathname.match(/^\/api\/issues\/([^/]+)\/([^/]+)\/(\d+)$/);
  if (method === "GET" && issueGetMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const repo = `${issueGetMatch[1]}/${issueGetMatch[2]}`;
      const issueNumber = parseInt(issueGetMatch[3]);
      const issue = await ctx.workspaceService.getIssue(repo, issueNumber);
      sendJson(res, issue as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to get issue", 500);
    }
    return true;
  }

  // POST /api/issues/:repo/:number/comment
  const commentMatch = pathname.match(/^\/api\/issues\/([^/]+)\/([^/]+)\/(\d+)\/comment$/);
  if (method === "POST" && commentMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const repo = `${commentMatch[1]}/${commentMatch[2]}`;
      const issueNumber = parseInt(commentMatch[3]);
      const body = await parseBody(req);
      if (!body.body) {
        sendError(res, "body is required", 400);
        return true;
      }
      const comment = await ctx.workspaceService.addComment(repo, issueNumber, body.body as string);
      sendJson(res, comment as unknown as JsonValue, 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to add comment", 500);
    }
    return true;
  }

  // POST /api/issues/:repo/:number/close
  const closeMatch = pathname.match(/^\/api\/issues\/([^/]+)\/([^/]+)\/(\d+)\/close$/);
  if (method === "POST" && closeMatch) {
    if (!ctx.workspaceService) {
      sendError(res, "Workspace Service not available", 503);
      return true;
    }

    try {
      const repo = `${closeMatch[1]}/${closeMatch[2]}`;
      const issueNumber = parseInt(closeMatch[3]);
      const issue = await ctx.workspaceService.closeIssue(repo, issueNumber);
      sendJson(res, issue as unknown as JsonValue);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : "Failed to close issue", 500);
    }
    return true;
  }

  // Route not handled
  return false;
}

/**
 * Create route handler with services from runtime
 */
export function createCodingAgentRouteHandler(runtime: IAgentRuntime) {
  const ptyService = runtime.getService("PTY_SERVICE") as unknown as PTYService | null;
  const workspaceService = runtime.getService("CODING_WORKSPACE_SERVICE") as unknown as CodingWorkspaceService | null;

  const ctx: RouteContext = {
    runtime,
    ptyService,
    workspaceService,
  };

  return (req: IncomingMessage, res: ServerResponse, pathname: string) =>
    handleCodingAgentRoutes(req, res, pathname, ctx);
}
