/**
 * Handler logic for the START_CODING_TASK action.
 *
 * - handleMultiAgent()  -- Multi-agent mode (pipe-delimited `agents` param)
 * - handleSingleAgent() -- Single-agent mode (standard handler path)
 *
 * @module actions/coding-task-handlers
 */

import type {
  ActionResult,
  HandlerCallback,
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
import {
  createScratchDir,
  generateLabel,
  registerSessionEvents,
} from "./coding-task-helpers.js";

/** Maximum number of agents that can be spawned in a single multi-agent call */
const MAX_CONCURRENT_AGENTS = 8;

/** Shared context passed to both multi-agent and single-agent handlers */
export interface CodingTaskContext {
  runtime: IAgentRuntime;
  ptyService: PTYService;
  wsService: CodingWorkspaceService | undefined;
  credentials: AgentCredentials;
  customCredentials: Record<string, string> | undefined;
  callback: HandlerCallback | undefined;
  message: Memory;
  state: State | undefined;
  repo: string | undefined;
  defaultAgentType: CodingAgentType;
  rawAgentType: string;
  memoryContent: string | undefined;
  approvalPreset: string | undefined;
  explicitLabel: string | undefined;
}

/**
 * Multi-agent mode handler.
 *
 * Parses pipe-delimited agent specs and spawns each agent in its own
 * workspace clone (or scratch directory).
 */
export async function handleMultiAgent(
  ctx: CodingTaskContext,
  agentsParam: string,
): Promise<ActionResult | undefined> {
  const {
    runtime,
    ptyService,
    wsService,
    credentials,
    customCredentials,
    callback,
    message,
    state,
    repo,
    defaultAgentType,
    rawAgentType,
    memoryContent,
    approvalPreset,
    explicitLabel,
  } = ctx;

  // Parse pipe-delimited agent specs: "task1 | task2 | agentType:task3"
  const agentSpecs = agentsParam
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  if (agentSpecs.length === 0) {
    if (callback) {
      await callback({
        text: "No agent tasks provided in agents parameter.",
      });
    }
    return { success: false, error: "EMPTY_AGENTS_PARAM" };
  }

  // Cap multi-agent count to the concurrency limit
  if (agentSpecs.length > MAX_CONCURRENT_AGENTS) {
    if (callback) {
      await callback({
        text: `Too many agents requested (${agentSpecs.length}). Maximum is ${MAX_CONCURRENT_AGENTS}.`,
      });
    }
    return { success: false, error: "TOO_MANY_AGENTS" };
  }

  if (repo && !wsService) {
    if (callback) {
      await callback({
        text: "Workspace Service is not available. Cannot clone repository.",
      });
    }
    return { success: false, error: "WORKSPACE_SERVICE_UNAVAILABLE" };
  }

  if (callback) {
    await callback({
      text: `Launching ${agentSpecs.length} agents${repo ? ` on ${repo}` : ""}...`,
    });
  }

  const results: Array<{
    sessionId: string;
    agentType: string;
    workdir: string;
    workspaceId?: string;
    branch?: string;
    label: string;
    status: string;
    error?: string;
  }> = [];

  for (const [i, spec] of agentSpecs.entries()) {
    // Parse optional "agentType:task" prefix
    let specAgentType = defaultAgentType;
    let specPiRequested = isPiAgentType(rawAgentType);
    let specRequestedType = rawAgentType;
    let specTask = spec;
    const colonIdx = spec.indexOf(":");
    if (colonIdx > 0 && colonIdx < 20) {
      const prefix = spec.slice(0, colonIdx).trim().toLowerCase();
      const knownTypes = [
        "claude",
        "claude-code",
        "claudecode",
        "codex",
        "openai",
        "gemini",
        "google",
        "aider",
        "pi",
        "pi-ai",
        "piai",
        "pi-coding-agent",
        "picodingagent",
        "shell",
        "bash",
      ];
      if (knownTypes.includes(prefix)) {
        specRequestedType = prefix;
        specPiRequested = isPiAgentType(prefix);
        specAgentType = normalizeAgentType(prefix);
        specTask = spec.slice(colonIdx + 1).trim();
      }
    }

    // Generate label for this specific agent
    const specLabel = explicitLabel
      ? `${explicitLabel}-${i + 1}`
      : generateLabel(repo, specTask);

    try {
      // Provision workspace (each agent gets its own clone or scratch dir)
      let workdir: string;
      let workspaceId: string | undefined;
      let branch: string | undefined;

      if (repo && wsService) {
        const workspace = await wsService.provisionWorkspace({ repo });
        workdir = workspace.path;
        workspaceId = workspace.id;
        branch = workspace.branch;
        wsService.setLabel(workspace.id, specLabel);
      } else {
        workdir = createScratchDir();
      }

      // Preflight check
      if (specAgentType !== "shell" && specAgentType !== "pi") {
        const [preflight] = await ptyService.checkAvailableAgents([
          specAgentType as Exclude<CodingAgentType, "shell" | "pi">,
        ]);
        if (preflight && !preflight.installed) {
          results.push({
            sessionId: "",
            agentType: specAgentType,
            workdir,
            label: specLabel,
            status: "failed",
            error: `${preflight.adapter} CLI is not installed`,
          });
          continue;
        }
      }

      // Check if coordinator is active — route blocking prompts through it
      const coordinator = (
        runtime as unknown as Record<string, unknown>
      ).__swarmCoordinator as SwarmCoordinator | undefined;

      // Spawn the agent
      const initialTask = specPiRequested ? toPiCommand(specTask) : specTask;
      const displayType = specPiRequested ? "pi" : specAgentType;
      const session: SessionInfo = await ptyService.spawnSession({
        name: `coding-${Date.now()}-${i}`,
        agentType: specAgentType,
        workdir,
        initialTask,
        memoryContent,
        credentials,
        approvalPreset: (approvalPreset as ApprovalPreset | undefined) ?? ptyService.defaultApprovalPreset,
        customCredentials,
        ...(coordinator ? { skipAdapterAutoResponse: true } : {}),
        metadata: {
          requestedType: specRequestedType,
          messageId: message.id,
          userId: (message as unknown as Record<string, unknown>).userId,
          workspaceId,
          label: specLabel,
          multiAgentIndex: i,
        },
      });

      // Register event handler
      const isScratch = !repo;
      const scratchDir = isScratch ? workdir : null;
      registerSessionEvents(
        ptyService,
        runtime,
        session.id,
        specLabel,
        scratchDir,
        callback,
        !!coordinator,
      );
      if (coordinator && specTask) {
        coordinator.registerTask(session.id, {
          agentType: specAgentType,
          label: specLabel,
          originalTask: specTask,
          workdir,
        });
      }

      results.push({
        sessionId: session.id,
        agentType: displayType,
        workdir,
        workspaceId,
        branch,
        label: specLabel,
        status: session.status,
      });

      if (callback) {
        await callback({
          text: `[${i + 1}/${agentSpecs.length}] Spawned ${displayType} agent as "${specLabel}"`,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[START_CODING_TASK] Failed to spawn agent ${i + 1}:`,
        errorMessage,
      );
      results.push({
        sessionId: "",
        agentType: specAgentType,
        workdir: "",
        label: specLabel,
        status: "failed",
        error: errorMessage,
      });
    }
  }

  // Store all sessions in state
  if (state) {
    state.codingSessions = results.filter((r) => r.sessionId);
  }

  const succeeded = results.filter((r) => r.sessionId);
  const failed = results.filter((r) => !r.sessionId);
  const summary = [
    `Launched ${succeeded.length}/${agentSpecs.length} agents${repo ? ` on ${repo}` : ""}:`,
    ...succeeded.map(
      (r) => `  - "${r.label}" (${r.agentType}) [session: ${r.sessionId}]`,
    ),
    ...(failed.length > 0
      ? [`Failed: ${failed.map((r) => `"${r.label}": ${r.error}`).join(", ")}`]
      : []),
  ].join("\n");

  if (callback) {
    await callback({ text: summary });
  }

  return {
    success: failed.length === 0,
    text: summary,
    data: { agents: results },
  };
}

/**
 * Single-agent mode handler.
 *
 * Provisions a workspace (clone or scratch) and spawns a single coding agent.
 */
export async function handleSingleAgent(
  ctx: CodingTaskContext,
  task: string | undefined,
): Promise<ActionResult | undefined> {
  const {
    runtime,
    ptyService,
    wsService,
    credentials,
    customCredentials,
    callback,
    message,
    state,
    repo,
    defaultAgentType: agentType,
    rawAgentType,
    memoryContent,
    approvalPreset,
    explicitLabel,
  } = ctx;

  // Generate or use explicit label
  const label = explicitLabel || generateLabel(repo, task);

  // --- Step 1: Resolve workspace directory ---
  let workdir: string;
  let workspaceId: string | undefined;
  let branch: string | undefined;

  if (repo) {
    if (!wsService) {
      if (callback) {
        await callback({
          text: "Workspace Service is not available. Cannot clone repository.",
        });
      }
      return { success: false, error: "WORKSPACE_SERVICE_UNAVAILABLE" };
    }

    try {
      if (callback) {
        await callback({ text: `Cloning ${repo}...` });
      }

      const workspace = await wsService.provisionWorkspace({ repo });
      workdir = workspace.path;
      workspaceId = workspace.id;
      branch = workspace.branch;

      wsService.setLabel(workspace.id, label);

      if (state) {
        state.codingWorkspace = {
          id: workspace.id,
          path: workspace.path,
          branch: workspace.branch,
          isWorktree: workspace.isWorktree,
          label,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (callback) {
        await callback({
          text: `Failed to clone repository: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  } else {
    workdir = createScratchDir();
  }

  // --- Step 2: Spawn the agent ---
  try {
    if (agentType !== "shell" && agentType !== "pi") {
      const [preflight] = await ptyService.checkAvailableAgents([
        agentType as Exclude<CodingAgentType, "shell" | "pi">,
      ]);
      if (preflight && !preflight.installed) {
        if (callback) {
          await callback({
            text: `${preflight.adapter} CLI is not installed.\nInstall with: ${preflight.installCommand}\nDocs: ${preflight.docsUrl}`,
          });
        }
        return { success: false, error: "AGENT_NOT_INSTALLED" };
      }
    }

    const piRequested = isPiAgentType(rawAgentType);
    const initialTask = piRequested ? toPiCommand(task) : task;
    const displayType = piRequested ? "pi" : agentType;

    // Check if coordinator is active — route blocking prompts through it
    const coordinator = (
      runtime as unknown as Record<string, unknown>
    ).__swarmCoordinator as SwarmCoordinator | undefined;

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
        workspaceId,
        label,
      },
    });

    // Register event handler
    const isScratchWorkspace = !repo;
    const scratchDir = isScratchWorkspace ? workdir : null;
    registerSessionEvents(
      ptyService,
      runtime,
      session.id,
      label,
      scratchDir,
      callback,
      !!coordinator,
    );
    if (coordinator && task) {
      coordinator.registerTask(session.id, {
        agentType,
        label,
        originalTask: task,
        workdir,
      });
    }

    if (state) {
      state.codingSession = {
        id: session.id,
        agentType: session.agentType,
        workdir: session.workdir,
        status: session.status,
      };
    }

    const summary = repo
      ? `Cloned ${repo} and started ${displayType} agent as "${label}"${task ? ` with task: "${task}"` : ""}`
      : `Started ${displayType} agent as "${label}" in scratch workspace${task ? ` with task: "${task}"` : ""}`;

    if (callback) {
      await callback({ text: `${summary}\nSession ID: ${session.id}` });
    }

    return {
      success: true,
      text: summary,
      data: {
        sessionId: session.id,
        agentType: displayType,
        workdir: session.workdir,
        workspaceId,
        branch,
        label,
        status: session.status,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[START_CODING_TASK] Failed to spawn agent:", errorMessage);

    if (callback) {
      await callback({
        text: `Failed to start coding agent: ${errorMessage}`,
      });
    }
    return { success: false, error: errorMessage };
  }
}
