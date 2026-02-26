/**
 * Provider that injects active workspace and session context into every prompt.
 *
 * Mima needs to know what workspaces exist, which agents are running, and their
 * current status — without having to call LIST_AGENTS every message. This provider
 * reads from both the workspace service and PTY service to build a live context
 * summary that's always available in the prompt.
 *
 * @module providers/active-workspace-context
 */

import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import type { PTYService } from "../services/pty-service.js";
import { getCoordinator } from "../services/pty-service.js";
import type { SessionInfo } from "../services/pty-types.js";
import type {
  CodingWorkspaceService,
  WorkspaceResult,
} from "../services/workspace-service.js";

function formatStatus(status: string): string {
  switch (status) {
    case "ready":
      return "idle";
    case "busy":
      return "working";
    case "starting":
      return "starting up";
    case "authenticating":
      return "authenticating";
    default:
      return status;
  }
}

function formatSessionLine(session: SessionInfo): string {
  const label = (session.metadata?.label as string) || session.name;
  const status = formatStatus(session.status);
  return `  - "${label}" (${session.agentType}, ${status}) [session: ${session.id}]`;
}

function formatWorkspaceLine(
  ws: WorkspaceResult,
  sessions: SessionInfo[],
): string {
  const label = ws.label || ws.id.slice(0, 8);
  const agents = sessions.filter((s) => s.workdir === ws.path);
  const agentSummary =
    agents.length > 0
      ? agents.map((a) => `${a.agentType}:${formatStatus(a.status)}`).join(", ")
      : "no agents";
  return `  - "${label}" → ${ws.repo} (branch: ${ws.branch}, ${agentSummary})`;
}

export const activeWorkspaceContextProvider: Provider = {
  name: "ACTIVE_WORKSPACE_CONTEXT",
  description: "Live status of active workspaces and coding agent sessions",
  position: 1, // Higher priority than action examples — this is live state

  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    const wsService = runtime.getService(
      "CODING_WORKSPACE_SERVICE",
    ) as unknown as CodingWorkspaceService | undefined;

    // Gather data (with fast-fail timeouts)
    let sessions: SessionInfo[] = [];
    let workspaces: WorkspaceResult[] = [];

    if (ptyService) {
      try {
        sessions = await Promise.race([
          ptyService.listSessions(),
          new Promise<SessionInfo[]>((resolve) =>
            setTimeout(() => resolve([]), 2000),
          ),
        ]);
      } catch {
        sessions = [];
      }
    }

    if (wsService) {
      workspaces = wsService.listWorkspaces();
    }

    // If nothing is active, return minimal context
    if (sessions.length === 0 && workspaces.length === 0) {
      const text = [
        "# Active Workspaces & Agents",
        "No active workspaces or coding agent sessions.",
        "Use START_CODING_TASK to launch a new coding agent.",
      ].join("\n");

      return {
        data: { activeWorkspaces: [], activeSessions: [] },
        values: { activeWorkspaceContext: text },
        text,
      };
    }

    // Build context
    const lines: string[] = ["# Active Workspaces & Agents"];

    if (workspaces.length > 0) {
      lines.push("");
      lines.push(`## Workspaces (${workspaces.length})`);
      for (const ws of workspaces) {
        lines.push(formatWorkspaceLine(ws, sessions));
      }
    }

    // Sessions not tied to a tracked workspace (scratch dirs, orphans)
    const trackedPaths = new Set(workspaces.map((ws) => ws.path));
    const untrackedSessions = sessions.filter(
      (s) => !trackedPaths.has(s.workdir),
    );

    if (untrackedSessions.length > 0) {
      lines.push("");
      lines.push(`## Standalone Sessions (${untrackedSessions.length})`);
      for (const session of untrackedSessions) {
        lines.push(formatSessionLine(session));
      }
    }

    // Add coordinator status if available
    const coordinator = getCoordinator(runtime);
    if (coordinator) {
      const pending = coordinator.getPendingConfirmations();
      const supervisionLevel = coordinator.getSupervisionLevel();

      if (pending.length > 0) {
        lines.push("");
        lines.push(
          `## Pending Confirmations (${pending.length}) — supervision: ${supervisionLevel}`,
        );
        for (const p of pending) {
          lines.push(
            `  - "${p.taskContext.label}" blocked: "${p.promptText}" → suggested: ${p.llmDecision.action}`,
          );
        }
      } else if (supervisionLevel !== "autonomous") {
        lines.push("");
        lines.push(`Swarm supervision: ${supervisionLevel} (no pending items)`);
      }
    }

    if (sessions.length > 0) {
      lines.push("");
      lines.push(
        "You can interact with agents using SEND_TO_CODING_AGENT (pass sessionId), " +
          "stop them with STOP_CODING_AGENT, or finalize their work with FINALIZE_WORKSPACE.",
      );
    }

    const text = lines.join("\n");

    return {
      data: {
        activeWorkspaces: workspaces.map((ws) => ({
          id: ws.id,
          label: ws.label,
          repo: ws.repo,
          branch: ws.branch,
          path: ws.path,
        })),
        activeSessions: sessions.map((s) => ({
          id: s.id,
          label: s.metadata?.label,
          agentType: s.agentType,
          status: s.status,
          workdir: s.workdir,
        })),
      },
      values: { activeWorkspaceContext: text },
      text,
    };
  },
};
