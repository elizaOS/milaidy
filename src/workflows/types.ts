/**
 * Workflow Builder — core type definitions.
 *
 * Defines the data model for visual workflow graphs, compiled workflows,
 * and workflow run state. These types are shared across the compiler,
 * runtime, storage layer, API endpoints, and frontend components.
 *
 * @module workflows/types
 */

// ---------------------------------------------------------------------------
// Graph model (persisted in milady.json)
// ---------------------------------------------------------------------------

import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from "../contracts/config";

export type {
  WorkflowDef,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodePosition,
  WorkflowNodeType,
} from "../contracts/config";

// ---------------------------------------------------------------------------
// Compiled workflow (in-memory only)
// ---------------------------------------------------------------------------

export type CompiledStep = {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  execute: (context: WorkflowContext) => Promise<unknown>;
};

export type CompiledBranch = {
  nodeId: string;
  evaluate: (context: WorkflowContext) => string;
  branches: Record<string, CompiledStep[]>;
};

export type CompiledWorkflow = {
  workflowId: string;
  workflowName: string;
  /** Ordered steps (linear segments) or branch points. */
  entrySteps: Array<CompiledStep | CompiledBranch>;
  stepCount: number;
  hasDelays: boolean;
  hasHooks: boolean;
  hasLoops: boolean;
};

// ---------------------------------------------------------------------------
// Workflow context (passed between steps at runtime)
// ---------------------------------------------------------------------------

export type WorkflowContext = {
  /** Trigger input data. */
  trigger: Record<string, unknown>;
  /** Each node's output, keyed by node id. */
  results: Record<string, unknown>;
  /** Shorthand for the most recent node's output. */
  _last: unknown;
  /** The workflow run ID. */
  runId: string;
  /** The workflow definition ID. */
  workflowId: string;
};

// ---------------------------------------------------------------------------
// Workflow run state (persisted via task system)
// ---------------------------------------------------------------------------

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "sleeping"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowStepEvent = {
  stepId: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: WorkflowNodeType;
  status: "started" | "completed" | "failed" | "retrying" | "skipped";
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  attempt: number;
};

export type WorkflowRun = {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  input: Record<string, unknown>;
  output?: unknown;
  currentNodeId?: string;
  events: WorkflowStepEvent[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type WorkflowValidationSeverity = "error" | "warning";

export type WorkflowValidationIssue = {
  severity: WorkflowValidationSeverity;
  nodeId?: string;
  message: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};

// ---------------------------------------------------------------------------
// API request/response helpers
// ---------------------------------------------------------------------------

export type CreateWorkflowRequest = {
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  enabled?: boolean;
};

export type UpdateWorkflowRequest = {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  enabled?: boolean;
};

export type StartWorkflowRequest = {
  input?: Record<string, unknown>;
};
