/**
 * Coding Agent Plugin for Milaidy
 *
 * Provides orchestration capabilities for CLI-based coding agents:
 * - PTY session management (spawn, control, monitor coding agents)
 * - Git workspace provisioning (clone, branch, PR creation)
 * - GitHub issue management (create, list, update, close)
 * - Integration with Claude Code, Codex, Gemini CLI, Aider, etc.
 *
 * @module @milaidy/plugin-coding-agent
 */

import type { Plugin, IAgentRuntime } from "@elizaos/core";

// Services
import { PTYService } from "./services/pty-service.js";
import { CodingWorkspaceService } from "./services/workspace-service.js";

// Actions - PTY management
import { spawnAgentAction } from "./actions/spawn-agent.js";
import { sendToAgentAction } from "./actions/send-to-agent.js";
import { stopAgentAction } from "./actions/stop-agent.js";
import { listAgentsAction } from "./actions/list-agents.js";

// Actions - Workspace management
import { provisionWorkspaceAction } from "./actions/provision-workspace.js";
import { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";

// Actions - Issue management
import { manageIssuesAction } from "./actions/manage-issues.js";

/**
 * Wire the auth prompt callback so the workspace service can surface
 * OAuth device flow prompts to the user through Milady's event system.
 */
function wireAuthPromptCallback(runtime: IAgentRuntime): void {
  const workspaceService = runtime.getService("CODING_WORKSPACE_SERVICE") as unknown as CodingWorkspaceService | undefined;
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
      `╚══════════════════════════════════════════════════════════╝\n`
    );

    // Also emit as a runtime event so chat clients can pick it up
    try {
      runtime.emitEvent("CODING_AGENT_AUTH_REQUIRED" as never, {
        verificationUri: prompt.verificationUri,
        userCode: prompt.userCode,
        expiresIn: prompt.expiresIn,
      } as never);
    } catch {
      // emitEvent may not support custom events - that's fine, console log is the primary channel
    }
  });
}

export const codingAgentPlugin: Plugin = {
  name: "@milaidy/plugin-coding-agent",
  description:
    "Orchestrate CLI coding agents (Claude Code, Codex, etc.) via PTY sessions, " +
    "manage git workspaces, and handle GitHub issues for autonomous coding tasks",

  // Plugin init - wire up deciders and callbacks after services are ready
  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    wireAuthPromptCallback(runtime);
  },

  // Services manage PTY sessions and git workspaces
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: [PTYService as any, CodingWorkspaceService as any],

  // Actions expose capabilities to the agent
  actions: [
    // PTY session management
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

  // No providers needed for now
  providers: [],
};

export default codingAgentPlugin;

// Re-export services for direct access
export { PTYService } from "./services/pty-service.js";
export { CodingWorkspaceService } from "./services/workspace-service.js";

// Re-export service types
export type {
  PTYServiceConfig,
  SpawnSessionOptions,
  SessionInfo,
  CodingAgentType,
} from "./services/pty-service.js";

// Re-export coding agent adapter types
export type {
  AdapterType,
  AgentCredentials,
  AgentFileDescriptor,
  WriteMemoryOptions,
  PreflightResult,
  ApprovalPreset,
  ApprovalConfig,
  ToolCategory,
  RiskLevel,
  PresetDefinition,
} from "coding-agent-adapters";

export type {
  CodingWorkspaceConfig,
  ProvisionWorkspaceOptions,
  WorkspaceResult,
  CommitOptions,
  PushOptions,
  AuthPromptCallback,
} from "./services/workspace-service.js";

// Re-export actions
export { spawnAgentAction } from "./actions/spawn-agent.js";
export { sendToAgentAction } from "./actions/send-to-agent.js";
export { stopAgentAction } from "./actions/stop-agent.js";
export { listAgentsAction } from "./actions/list-agents.js";
export { provisionWorkspaceAction } from "./actions/provision-workspace.js";
export { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";
export { manageIssuesAction } from "./actions/manage-issues.js";

// Re-export API routes for server integration
export { handleCodingAgentRoutes, createCodingAgentRouteHandler } from "./api/routes.js";
