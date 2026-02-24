/**
 * Swarm Coordinator Route Handlers
 *
 * Provides SSE streaming and HTTP API for the coordination layer:
 * - SSE event stream for real-time dashboard
 * - Task status and context queries
 * - Pending confirmation management
 * - Supervision level control
 *
 * @module api/coordinator-routes
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { SwarmCoordinator } from "../services/swarm-coordinator.js";
import type { RouteContext } from "./routes.js";
import { parseBody, sendError, sendJson } from "./routes.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const COORDINATOR_PREFIX = "/api/coding-agents/coordinator";

/**
 * Handle coordinator routes (/api/coding-agents/coordinator/*)
 * Returns true if the route was handled, false otherwise.
 */
export async function handleCoordinatorRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  ctx: RouteContext & { coordinator?: SwarmCoordinator },
): Promise<boolean> {
  if (!pathname.startsWith(COORDINATOR_PREFIX)) {
    return false;
  }

  const method = req.method?.toUpperCase();
  const subPath = pathname.slice(COORDINATOR_PREFIX.length);

  if (!ctx.coordinator) {
    sendError(res, "Swarm Coordinator not available", 503);
    return true;
  }

  const coordinator = ctx.coordinator;

  // === SSE Event Stream ===
  // GET /api/coding-agents/coordinator/events
  if (method === "GET" && subPath === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial comment to establish connection
    res.write(":ok\n\n");

    // Register as SSE client (sends snapshot on connect)
    const unsubscribe = coordinator.addSseClient(res);

    // Clean up on close
    req.on("close", unsubscribe);

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        return;
      }
      res.write(":ping\n\n");
    }, 30_000);

    req.on("close", () => clearInterval(keepAlive));

    return true;
  }

  // === All Task Contexts ===
  // GET /api/coding-agents/coordinator/status
  if (method === "GET" && subPath === "/status") {
    const tasks = coordinator.getAllTaskContexts();
    sendJson(res, {
      supervisionLevel: coordinator.getSupervisionLevel(),
      taskCount: tasks.length,
      tasks: tasks.map((t) => ({
        sessionId: t.sessionId,
        agentType: t.agentType,
        label: t.label,
        originalTask: t.originalTask,
        workdir: t.workdir,
        status: t.status,
        decisionCount: t.decisions.length,
        autoResolvedCount: t.autoResolvedCount,
      })),
      pendingConfirmations: coordinator.getPendingConfirmations().length,
    } as unknown as JsonValue);
    return true;
  }

  // === Single Task Context ===
  // GET /api/coding-agents/coordinator/tasks/:sessionId
  const taskMatch = subPath.match(/^\/tasks\/([^/]+)$/);
  if (method === "GET" && taskMatch) {
    const sessionId = taskMatch[1];
    const task = coordinator.getTaskContext(sessionId);
    if (!task) {
      sendError(res, "Task context not found", 404);
      return true;
    }
    sendJson(res, task as unknown as JsonValue);
    return true;
  }

  // === Pending Confirmations ===
  // GET /api/coding-agents/coordinator/pending
  if (method === "GET" && subPath === "/pending") {
    const pending = coordinator.getPendingConfirmations();
    sendJson(
      res,
      pending.map((p) => ({
        sessionId: p.sessionId,
        promptText: p.promptText,
        suggestedAction: p.llmDecision.action,
        suggestedResponse: p.llmDecision.response,
        reasoning: p.llmDecision.reasoning,
        agentType: p.taskContext.agentType,
        label: p.taskContext.label,
        createdAt: p.createdAt,
      })) as unknown as JsonValue,
    );
    return true;
  }

  // === Confirm/Reject Pending Decision ===
  // POST /api/coding-agents/coordinator/confirm/:sessionId
  const confirmMatch = subPath.match(/^\/confirm\/([^/]+)$/);
  if (method === "POST" && confirmMatch) {
    try {
      const sessionId = confirmMatch[1];
      const body = await parseBody(req);
      const approved = body.approved !== false; // default: approved
      const override = body.override as
        | { response?: string; useKeys?: boolean; keys?: string[] }
        | undefined;

      await coordinator.confirmDecision(sessionId, approved, override);
      sendJson(res, { success: true, sessionId, approved });
    } catch (error) {
      sendError(
        res,
        error instanceof Error ? error.message : "Failed to confirm decision",
        error instanceof Error && error.message.includes("No pending")
          ? 404
          : 500,
      );
    }
    return true;
  }

  // === Supervision Level ===
  // GET /api/coding-agents/coordinator/supervision
  if (method === "GET" && subPath === "/supervision") {
    sendJson(res, { level: coordinator.getSupervisionLevel() });
    return true;
  }

  // POST /api/coding-agents/coordinator/supervision
  if (method === "POST" && subPath === "/supervision") {
    try {
      const body = await parseBody(req);
      const level = body.level as string;
      if (!["autonomous", "confirm", "notify"].includes(level)) {
        sendError(
          res,
          'Invalid supervision level. Must be "autonomous", "confirm", or "notify"',
          400,
        );
        return true;
      }
      coordinator.setSupervisionLevel(
        level as "autonomous" | "confirm" | "notify",
      );
      sendJson(res, { success: true, level });
    } catch (error) {
      sendError(
        res,
        error instanceof Error
          ? error.message
          : "Failed to set supervision level",
        500,
      );
    }
    return true;
  }

  // Not a coordinator route we recognize
  return false;
}
