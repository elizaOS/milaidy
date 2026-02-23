/**
 * LIST_CODING_AGENTS action - List active coding agent sessions
 *
 * Returns information about all running PTY sessions,
 * including their status, agent type, and working directory.
 *
 * @module actions/list-agents
 */

import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { PTYService } from "../services/pty-service.js";
import type { SessionInfo } from "../services/pty-types.js";

export const listAgentsAction: Action = {
  name: "LIST_CODING_AGENTS",

  similes: [
    "SHOW_CODING_AGENTS",
    "GET_ACTIVE_AGENTS",
    "LIST_SESSIONS",
    "SHOW_CODING_SESSIONS",
  ],

  description:
    "List all active coding agent sessions. " +
    "Shows session IDs, agent types, status, and working directories.",

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What coding agents are running?" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Let me check the active coding sessions.",
          action: "LIST_CODING_AGENTS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me the coding sessions" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Here are the active coding agents.",
          action: "LIST_CODING_AGENTS",
        },
      },
    ],
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    return ptyService != null;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (!ptyService) {
      if (callback) {
        await callback({
          text: "PTY Service is not available.",
        });
      }
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    const sessions = await ptyService.listSessions();

    if (sessions.length === 0) {
      if (callback) {
        await callback({
          text: "No active coding agents. Use SPAWN_CODING_AGENT to start one.",
        });
      }
      return {
        success: true,
        text: "No active coding agents",
        data: { sessions: [] },
      };
    }

    // Format session info for display
    const sessionSummaries = sessions.map((session: SessionInfo) => ({
      id: session.id,
      agentType: session.agentType,
      status: session.status,
      workdir: session.workdir,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivityAt.toISOString(),
    }));

    // Build readable text summary
    const lines = sessions.map((session: SessionInfo, index: number) => {
      const statusEmoji =
        {
          running: "▶️",
          idle: "⏸️",
          blocked: "⚠️",
          completed: "✅",
          error: "❌",
        }[session.status as string] ?? "❓";

      return `${index + 1}. ${statusEmoji} ${session.agentType} (${session.id.slice(0, 8)}...)\n   📁 ${session.workdir}\n   Status: ${session.status}`;
    });

    if (callback) {
      await callback({
        text: `Active coding agents:\n\n${lines.join("\n\n")}`,
      });
    }

    return {
      success: true,
      text: `Found ${sessions.length} active coding agents`,
      data: { sessions: sessionSummaries },
    };
  },

  parameters: [],
};
