/**
 * SPAWN_CODING_AGENT action - Spawns a CLI coding agent
 *
 * Creates a new PTY session for a coding agent (Claude Code, Codex, etc.)
 * and returns a session ID for subsequent interactions.
 *
 * @module actions/spawn-agent
 */

import * as os from "node:os";
import * as path from "node:path";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AgentCredentials, ApprovalPreset } from "coding-agent-adapters";
import type { PTYService } from "../services/pty-service.js";
import {
  type CodingAgentType,
  isPiAgentType,
  normalizeAgentType,
  type SessionInfo,
  toPiCommand,
} from "../services/pty-types.js";
import type { SwarmCoordinator } from "../services/swarm-coordinator.js";
import type { CodingWorkspaceService } from "../services/workspace-service.js";

export const spawnAgentAction: Action = {
  name: "SPAWN_CODING_AGENT",

  similes: [
    "START_CODING_AGENT",
    "LAUNCH_CODING_AGENT",
    "CREATE_CODING_AGENT",
    "SPAWN_CODER",
    "RUN_CODING_AGENT",
  ],

  description:
    "Spawn a CLI coding agent (Claude Code, Codex, Gemini, Aider, Pi) to work on a coding task. " +
    "The agent runs in a PTY session and can execute code, run tests, and make changes. " +
    "Returns a session ID that can be used to interact with the agent.",

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Spawn Claude Code to fix the bug in auth.ts" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll spawn Claude Code to work on that. Let me set up the coding session.",
          action: "SPAWN_CODING_AGENT",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Start a coding agent to implement the new feature" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll create a coding session for that task.",
          action: "SPAWN_CODING_AGENT",
        },
      },
    ],
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    // Check if PTYService is available
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (!ptyService) {
      console.warn("[SPAWN_CODING_AGENT] PTYService not available");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (!ptyService) {
      if (callback) {
        await callback({
          text: "PTY Service is not available. Cannot spawn coding agent.",
        });
      }
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    // Extract parameters from options or message content
    const params = options?.parameters;
    const content = message.content as Record<string, unknown>;

    const rawAgentType =
      (params?.agentType as string) ??
      (content.agentType as string) ??
      "claude";
    const agentType = normalizeAgentType(rawAgentType);
    const task = (params?.task as string) ?? (content.task as string);
    const piRequested = isPiAgentType(rawAgentType);
    const initialTask = piRequested ? toPiCommand(task) : task;

    // Resolve workdir: explicit param > state from PROVISION_WORKSPACE > most recent workspace > cwd
    let workdir = (params?.workdir as string) ?? (content.workdir as string);
    if (!workdir && state?.codingWorkspace) {
      workdir = (state.codingWorkspace as { path: string }).path;
    }
    if (!workdir) {
      // Check workspace service for most recently provisioned workspace
      const wsService = runtime.getService(
        "CODING_WORKSPACE_SERVICE",
      ) as unknown as CodingWorkspaceService | undefined;
      if (wsService) {
        const workspaces = wsService.listWorkspaces();
        if (workspaces.length > 0) {
          workdir = workspaces[workspaces.length - 1].path;
        }
      }
    }
    if (!workdir) {
      if (callback) {
        await callback({
          text: "No workspace found. Please provision a workspace first using PROVISION_WORKSPACE or provide a workdir.",
        });
      }
      return { success: false, error: "NO_WORKSPACE" };
    }

    // Validate workdir is within allowed directories
    const resolvedWorkdir = path.resolve(workdir);
    const workspaceBaseDir = path.join(os.homedir(), ".milaidy", "workspaces");
    const allowedPrefixes = [
      path.resolve(workspaceBaseDir),
      path.resolve(process.cwd()),
    ];
    const isAllowed = allowedPrefixes.some(
      (prefix) =>
        resolvedWorkdir.startsWith(prefix + path.sep) ||
        resolvedWorkdir === prefix,
    );
    if (!isAllowed) {
      if (callback) {
        await callback({
          text: "The specified workdir is outside of allowed directories. Please use a workspace directory.",
        });
      }
      return { success: false, error: "WORKDIR_OUTSIDE_ALLOWED" };
    }
    workdir = resolvedWorkdir;

    const memoryContent =
      (params?.memoryContent as string) ?? (content.memoryContent as string);
    const approvalPreset =
      (params?.approvalPreset as string) ?? (content.approvalPreset as string);

    // Custom credentials for MCP servers and other integrations
    const customCredentialKeys = runtime.getSetting("CUSTOM_CREDENTIAL_KEYS") as
      | string
      | undefined;
    let customCredentials: Record<string, string> | undefined;
    if (customCredentialKeys) {
      customCredentials = {};
      for (const key of customCredentialKeys.split(",").map((k) => k.trim())) {
        const val = runtime.getSetting(key) as string | undefined;
        if (val) customCredentials[key] = val;
      }
    }

    // Build credentials from runtime settings
    const credentials: AgentCredentials = {
      anthropicKey: runtime.getSetting("ANTHROPIC_API_KEY") as
        | string
        | undefined,
      openaiKey: runtime.getSetting("OPENAI_API_KEY") as string | undefined,
      googleKey: runtime.getSetting("GOOGLE_GENERATIVE_AI_API_KEY") as
        | string
        | undefined,
      githubToken: runtime.getSetting("GITHUB_TOKEN") as string | undefined,
    };

    try {
      // Check if the agent CLI is installed (for non-shell agents)
      if (agentType !== "shell" && agentType !== "pi") {
        const [preflight] = await ptyService.checkAvailableAgents([
          agentType as Exclude<CodingAgentType, "shell" | "pi">,
        ]);
        if (preflight && !preflight.installed) {
          if (callback) {
            await callback({
              text:
                `${preflight.adapter} CLI is not installed.\n` +
                `Install with: ${preflight.installCommand}\n` +
                `Docs: ${preflight.docsUrl}`,
            });
          }
          return { success: false, error: "AGENT_NOT_INSTALLED" };
        }
      }

      // Check if coordinator is active — route blocking prompts through it
      const coordinator = (
        runtime as unknown as Record<string, unknown>
      ).__swarmCoordinator as SwarmCoordinator | undefined;

      // Spawn the PTY session
      const session: SessionInfo = await ptyService.spawnSession({
        name: `coding-${Date.now()}`,
        agentType,
        workdir,
        initialTask,
        memoryContent,
        credentials,
        approvalPreset: (approvalPreset as ApprovalPreset | undefined) ?? ptyService.defaultApprovalPreset,
        customCredentials,
        ...(coordinator ? { skipAdapterAutoResponse: true } : {}),
        metadata: {
          requestedType: rawAgentType,
          messageId: message.id,
          userId: (message as unknown as Record<string, unknown>).userId,
        },
      });

      // Register event handler for this session
      ptyService.onSessionEvent((sessionId, event, data) => {
        if (sessionId !== session.id) return;

        // Log session events for debugging
        console.log(`[Session ${sessionId}] ${event}:`, data);

        // When coordinator is active it owns chat messaging for these events
        if (!coordinator) {
          // Handle blocked state - agent is waiting for input
          if (event === "blocked" && callback) {
            callback({
              text: `Coding agent is waiting for input: ${(data as { prompt?: string }).prompt ?? "unknown prompt"}`,
            });
          }

          // Handle completion
          if (event === "completed" && callback) {
            callback({
              text: "Coding agent completed the task.",
            });
          }

          // Handle errors
          if (event === "error" && callback) {
            callback({
              text: `Coding agent encountered an error: ${(data as { message?: string }).message ?? "unknown error"}`,
            });
          }
        }
      });
      if (coordinator && task) {
        coordinator.registerTask(session.id, {
          agentType,
          label: `agent-${session.id.slice(-8)}`,
          originalTask: task,
          workdir,
        });
      }

      // Store session info in state for subsequent actions
      if (state) {
        state.codingSession = {
          id: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          status: session.status,
        };
      }

      if (callback) {
        await callback({
          text: `Started ${piRequested ? "pi" : agentType} coding agent in ${workdir}${task ? ` with task: "${task}"` : ""}. Session ID: ${session.id}`,
        });
      }

      return {
        success: true,
        text: `Started ${piRequested ? "pi" : agentType} coding agent`,
        data: {
          sessionId: session.id,
          agentType: piRequested ? "pi" : session.agentType,
          workdir: session.workdir,
          status: session.status,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[SPAWN_CODING_AGENT] Failed to spawn agent:",
        errorMessage,
      );

      if (callback) {
        await callback({
          text: `Failed to spawn coding agent: ${errorMessage}`,
        });
      }

      return { success: false, error: errorMessage };
    }
  },

  parameters: [
    {
      name: "agentType",
      description:
        "Type of coding agent to spawn. Options: claude (Claude Code), codex (OpenAI Codex), gemini (Google Gemini), aider, pi, shell (generic shell)",
      required: false,
      schema: { type: "string" as const, default: "claude" },
    },
    {
      name: "workdir",
      description:
        "Working directory for the agent. Defaults to current directory.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "task",
      description: "Initial task or prompt to send to the agent once spawned.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "memoryContent",
      description:
        "Instructions/context to write to the agent's memory file (e.g. CLAUDE.md) before spawning.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "approvalPreset",
      description:
        "Permission level: readonly (safe audit), standard (reads+web auto, writes prompt), permissive (file ops auto, shell prompts), autonomous (all auto, use with sandbox)",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["readonly", "standard", "permissive", "autonomous"],
      },
    },
  ],
};
