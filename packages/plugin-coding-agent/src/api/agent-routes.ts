/**
 * Coding Agent Route Handlers
 *
 * Handles routes for PTY-based coding agent management:
 * - Preflight checks, metrics, workspace files
 * - Approval presets and config
 * - Agent CRUD: list, spawn, get, send, stop, output
 *
 * @module api/agent-routes
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { RouteContext } from "./routes.js";
import { parseBody, sendError, sendJson } from "./routes.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Handle coding agent routes (/api/coding-agents/*)
 * Returns true if the route was handled, false otherwise
 */
export async function handleAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  ctx: RouteContext,
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
      sendError(
        res,
        error instanceof Error ? error.message : "Preflight check failed",
        500,
      );
    }
    return true;
  }

  // GET /api/coding-agents/metrics
  if (method === "GET" && pathname === "/api/coding-agents/metrics") {
    if (!ctx.ptyService) {
      sendError(res, "PTY Service not available", 503);
      return true;
    }
    sendJson(res, ctx.ptyService.getAgentMetrics() as unknown as JsonValue);
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
        sendError(
          res,
          "agentType query parameter required (claude, gemini, codex, aider)",
          400,
        );
        return true;
      }

      const files = ctx.ptyService.getWorkspaceFiles(
        agentType as import("coding-agent-adapters").AdapterType,
      );
      const memoryFilePath = ctx.ptyService.getMemoryFilePath(
        agentType as import("coding-agent-adapters").AdapterType,
      );
      sendJson(res, {
        agentType,
        memoryFilePath,
        files,
      } as unknown as JsonValue);
    } catch (error) {
      sendError(
        res,
        error instanceof Error
          ? error.message
          : "Failed to get workspace files",
        500,
      );
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
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to list presets",
        500,
      );
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
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to generate config",
        500,
      );
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
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to list agents",
        500,
      );
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
      const {
        agentType,
        workdir: rawWorkdir,
        task,
        memoryContent,
        approvalPreset,
        customCredentials,
        metadata,
      } = body;

      // Validate workdir: must be within workspace base dir or cwd
      const workspaceBaseDir = path.join(
        os.homedir(),
        ".milaidy",
        "workspaces",
      );
      const allowedPrefixes = [
        path.resolve(workspaceBaseDir),
        path.resolve(process.cwd()),
      ];
      let workdir = rawWorkdir as string | undefined;
      if (workdir) {
        const resolved = path.resolve(workdir);
        const isAllowed = allowedPrefixes.some(
          (prefix) =>
            resolved === prefix || resolved.startsWith(prefix + path.sep),
        );
        if (!isAllowed) {
          sendError(
            res,
            "workdir must be within workspace base directory or cwd",
            403,
          );
          return true;
        }
        workdir = resolved;
      }

      // Check concurrency limit before spawning
      const activeSessions = await ctx.ptyService.listSessions();
      const maxSessions = 8;
      if (activeSessions.length >= maxSessions) {
        sendError(
          res,
          `Concurrent session limit reached (${maxSessions})`,
          429,
        );
        return true;
      }

      // Build credentials from runtime
      const credentials = {
        anthropicKey: ctx.runtime.getSetting("ANTHROPIC_API_KEY") as
          | string
          | undefined,
        openaiKey: ctx.runtime.getSetting("OPENAI_API_KEY") as
          | string
          | undefined,
        googleKey: ctx.runtime.getSetting("GOOGLE_GENERATIVE_AI_API_KEY") as
          | string
          | undefined,
        githubToken: ctx.runtime.getSetting("GITHUB_TOKEN") as
          | string
          | undefined,
      };

      // Read model preferences from runtime settings
      const agentStr = ((agentType as string) || "claude").toLowerCase();
      const prefixMap: Record<string, string> = {
        claude: "PARALLAX_CLAUDE",
        gemini: "PARALLAX_GEMINI",
        codex: "PARALLAX_CODEX",
        aider: "PARALLAX_AIDER",
      };
      const prefix = prefixMap[agentStr];
      const modelPowerful = prefix
        ? (ctx.runtime.getSetting(`${prefix}_MODEL_POWERFUL`) as string | null)
        : null;
      const modelFast = prefix
        ? (ctx.runtime.getSetting(`${prefix}_MODEL_FAST`) as string | null)
        : null;
      const aiderProvider =
        agentStr === "aider"
          ? (ctx.runtime.getSetting("PARALLAX_AIDER_PROVIDER") as string | null)
          : null;

      const session = await ctx.ptyService.spawnSession({
        name: `agent-${Date.now()}`,
        agentType:
          agentStr as import("../services/pty-service.js").CodingAgentType,
        workdir: workdir as string,
        initialTask: task as string,
        memoryContent: memoryContent as string | undefined,
        credentials,
        approvalPreset: approvalPreset as
          | import("coding-agent-adapters").ApprovalPreset
          | undefined,
        customCredentials: customCredentials as
          | Record<string, string>
          | undefined,
        metadata: {
          ...(metadata as Record<string, unknown>),
          ...(aiderProvider ? { provider: aiderProvider } : {}),
          modelPrefs: {
            ...(modelPowerful ? { powerful: modelPowerful } : {}),
            ...(modelFast ? { fast: modelFast } : {}),
          },
        },
      });

      sendJson(
        res,
        {
          sessionId: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          status: session.status,
        } as unknown as JsonValue,
        201,
      );
    } catch (error) {
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to spawn agent",
        500,
      );
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
      const { input, keys } = body;

      if (keys) {
        // Send special keys (e.g. "enter", ["down","enter"], "Ctrl-C")
        await ctx.ptyService.sendKeysToSession(
          sessionId,
          keys as string | string[],
        );
        sendJson(res, { success: true });
      } else if (input && typeof input === "string") {
        await ctx.ptyService.sendToSession(sessionId, input);
        sendJson(res, { success: true });
      } else {
        sendError(
          res,
          "Either 'input' (string) or 'keys' (string|string[]) required",
          400,
        );
        return true;
      }
    } catch (error) {
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to send input",
        500,
      );
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
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to stop agent",
        500,
      );
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
      const lines = parseInt(url.searchParams.get("lines") || "100", 10);

      const output = await ctx.ptyService.getSessionOutput(sessionId, lines);
      sendJson(res, { sessionId, output });
    } catch (error) {
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to get output",
        500,
      );
    }
    return true;
  }

  // Route not handled
  return false;
}
