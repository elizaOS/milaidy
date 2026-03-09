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

export type WorkflowNodeType =
  | "trigger"
  | "action"
  | "llm"
  | "condition"
  | "transform"
  | "delay"
  | "hook"
  | "loop"
  | "subworkflow"
  | "output";

export type WorkflowNodePosition = { x: number; y: number };

/**
 * A single node in the workflow graph.
 *
 * `config` is an untyped bag whose schema depends on `type`:
 *
 * - **trigger**: `{ triggerType: "manual"|"cron"|"webhook"|"event", cronExpression?, webhookPath?, eventName? }`
 * - **action**: `{ actionName: string, parameters: Record<string,string> }`
 * - **llm**: `{ prompt: string, model?: string, temperature?: number, maxTokens?: number }`
 * - **condition**: `{ expression: string }` — evaluates to truthy/falsy
 * - **transform**: `{ code: string }` — sandboxed JS, receives `params` object
 * - **delay**: `{ duration?: string, date?: string }` — human-readable or ISO date
 * - **hook**: `{ hookId: string, webhookEnabled?: boolean, description?: string }`
 * - **loop**: `{ itemsExpression: string, variableName?: string }`
 * - **subworkflow**: `{ workflowId: string }`
 * - **output**: `{ outputExpression?: string }`
 */
export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: WorkflowNodePosition;
  config: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  /** For condition nodes: "true" | "false". For loop: "body" | "done". */
  sourceHandle?: string;
  label?: string;
};

export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Compiled workflow (in-memory only)
// ---------------------------------------------------------------------------

export type CompiledStep = {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  execute: (
    context: WorkflowContext,
  ) => Promise<unknown>;
};

export type CompiledWorkflow = {
  workflowId: string;
  workflowName: string;
  /** Ordered executable steps. */
  entrySteps: CompiledStep[];
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
