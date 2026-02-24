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

import type { Plugin } from "@elizaos/core";
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

export const codingAgentPlugin: Plugin = {
  name: "@milaidy/plugin-coding-agent",
  description:
    "Orchestrate CLI coding agents (Claude Code, Codex, Gemini, Aider, Pi, etc.) via PTY sessions, " +
    "manage git workspaces, and handle GitHub issues for autonomous coding tasks",

  // NOTE: init() is NOT reliably called by ElizaOS for workspace plugins.
  // SwarmCoordinator and auth callback wiring is done in PTYService.start()
  // which ElizaOS calls reliably via the services lifecycle.

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
  SessionEventName,
  SessionInfo,
  SpawnSessionOptions,
} from "./services/pty-service.js";
// Re-export services for direct access
export { PTYService } from "./services/pty-service.js";
export type {
  ChatMessageCallback,
  CoordinationDecision,
  PendingDecision,
  SupervisionLevel,
  SwarmEvent,
  TaskContext,
  WsBroadcastCallback,
} from "./services/swarm-coordinator.js";
export {
  SwarmCoordinator,
  wireSwarmCoordinator,
} from "./services/swarm-coordinator.js";
export type {
  CoordinationLLMResponse,
} from "./services/swarm-coordinator-prompts.js";
export type {
  AuthPromptCallback,
  CodingWorkspaceConfig,
  CommitOptions,
  ProvisionWorkspaceOptions,
  PushOptions,
  WorkspaceResult,
} from "./services/workspace-service.js";
export { CodingWorkspaceService } from "./services/workspace-service.js";
