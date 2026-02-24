/**
 * Coding Agent Plugin for Milaidy
 *
 * Provides orchestration capabilities for CLI-based coding agents:
 * - PTY session management (spawn, control, monitor coding agents)
 * - Git workspace provisioning (clone, branch, PR creation)
 * - GitHub issue management (create, list, update, close)
 * - Integration with Claude Code, Codex, Gemini CLI, Aider, Pi, etc.
 *
 * @module @milaidy/plugin-coding-agent
 */

import type { IAgentRuntime, Plugin } from "@elizaos/core";
import { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";
import { listAgentsAction } from "./actions/list-agents.js";
// Actions - Issue management
import { manageIssuesAction } from "./actions/manage-issues.js";
// Actions - Workspace management
import { provisionWorkspaceAction } from "./actions/provision-workspace.js";
import { sendToAgentAction } from "./actions/send-to-agent.js";
// Actions - PTY management
import { spawnAgentAction } from "./actions/spawn-agent.js";
// Actions - Unified task launcher
import { startCodingTaskAction } from "./actions/start-coding-task.js";
import { stopAgentAction } from "./actions/stop-agent.js";
// Providers
import { codingAgentExamplesProvider } from "./providers/action-examples.js";
import { activeWorkspaceContextProvider } from "./providers/active-workspace-context.js";
// Services
import { PTYService } from "./services/pty-service.js";
import { CodingWorkspaceService } from "./services/workspace-service.js";

/**
 * Wire the auth prompt callback so the workspace service can surface
 * OAuth device flow prompts to the user through Milady's event system.
 */
function wireAuthPromptCallback(runtime: IAgentRuntime): void {
  const workspaceService = runtime.getService(
    "CODING_WORKSPACE_SERVICE",
  ) as unknown as CodingWorkspaceService | undefined;
  if (!workspaceService) return;

  workspaceService.setAuthPromptCallback((prompt) => {
    // Log prominently so it shows up in server output
    console.log(
      `\n` +
        `╔══════════════════════════════════════════════════════════╗\n` +
        `║  GitHub Authorization Required                          ║\n` +
        `║                                                         ║\n` +
        `║  Go to: ${prompt.verificationUri.padEnd(46)}║\n` +
        `║  Enter code: ${prompt.userCode.padEnd(41)}║\n` +
        `║                                                         ║\n` +
        `║  Code expires in ${Math.floor(prompt.expiresIn / 60)} minutes${" ".repeat(33)}║\n` +
        `╚══════════════════════════════════════════════════════════╝\n`,
    );

    // Also emit as a runtime event so chat clients can pick it up
    try {
      runtime.emitEvent(
        "CODING_AGENT_AUTH_REQUIRED" as never,
        {
          verificationUri: prompt.verificationUri,
          userCode: prompt.userCode,
          expiresIn: prompt.expiresIn,
        } as never,
      );
    } catch {
      // emitEvent may not support custom events - that's fine, console log is the primary channel
    }
  });
}

export const codingAgentPlugin: Plugin = {
  name: "@milaidy/plugin-coding-agent",
  description:
    "Orchestrate CLI coding agents (Claude Code, Codex, Gemini, Aider, Pi, etc.) via PTY sessions, " +
    "manage git workspaces, and handle GitHub issues for autonomous coding tasks",

  // Plugin init - wire up deciders and callbacks after services are ready
  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    wireAuthPromptCallback(runtime);
  },

  // Services manage PTY sessions and git workspaces
  // biome-ignore lint/suspicious/noExplicitAny: ElizaOS Plugin type expects Service[] but our classes don't extend their base Service
  services: [PTYService as any, CodingWorkspaceService as any],

  // Actions expose capabilities to the agent
  actions: [
    // Unified task launcher (provision + spawn in one step)
    startCodingTaskAction,
    // PTY session management (for direct control)
    spawnAgentAction,
    sendToAgentAction,
    stopAgentAction,
    listAgentsAction,
    // Workspace management
    provisionWorkspaceAction,
    finalizeWorkspaceAction,
    // Issue management
    manageIssuesAction,
  ],

  // No evaluators needed for now
  evaluators: [],

  // Providers inject context into the prompt
  providers: [
    activeWorkspaceContextProvider, // Live workspace/session state
    codingAgentExamplesProvider, // Structured action call examples
  ],
};

export default codingAgentPlugin;

// Re-export coding agent adapter types
export type {
  AdapterType,
  AgentCredentials,
  AgentFileDescriptor,
  ApprovalConfig,
  ApprovalPreset,
  PreflightResult,
  PresetDefinition,
  RiskLevel,
  ToolCategory,
  WriteMemoryOptions,
} from "coding-agent-adapters";
export { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";
export { listAgentsAction } from "./actions/list-agents.js";
export { manageIssuesAction } from "./actions/manage-issues.js";
export { provisionWorkspaceAction } from "./actions/provision-workspace.js";
export { sendToAgentAction } from "./actions/send-to-agent.js";
export { spawnAgentAction } from "./actions/spawn-agent.js";
// Re-export actions
export { startCodingTaskAction } from "./actions/start-coding-task.js";
export { stopAgentAction } from "./actions/stop-agent.js";
// Re-export API routes for server integration
export {
  createCodingAgentRouteHandler,
  handleCodingAgentRoutes,
} from "./api/routes.js";
// Re-export service types
export type {
  CodingAgentType,
  PTYServiceConfig,
  SessionInfo,
  SpawnSessionOptions,
} from "./services/pty-service.js";
// Re-export services for direct access
export { PTYService } from "./services/pty-service.js";
export type {
  AuthPromptCallback,
  CodingWorkspaceConfig,
  CommitOptions,
  ProvisionWorkspaceOptions,
  PushOptions,
  WorkspaceResult,
} from "./services/workspace-service.js";
export { CodingWorkspaceService } from "./services/workspace-service.js";
