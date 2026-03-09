/**
 * Workflow graph compiler.
 *
 * Converts a `WorkflowDef` (visual graph of nodes + edges) into an
 * executable sequence of steps that the workflow runtime can evaluate.
 *
 * The compiler:
 * 1. Validates the graph
 * 2. Builds an adjacency list from edges
 * 3. Topologically sorts nodes from the trigger
 * 4. Generates step functions for each node (bound to the agent runtime)
 * 5. Returns a `CompiledWorkflow` ready for execution
 *
 * @module workflows/compiler
 */

import {
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  ModelType,
} from "@elizaos/core";
import { MAX_IN_PROCESS_DELAY_MS, parseDuration } from "./duration";
import type {
  CompiledStep,
  CompiledWorkflow,
  WorkflowConditionOperator,
  WorkflowContext,
  WorkflowDef,
  WorkflowEdge,
  WorkflowNode,
} from "./types";
import { validateWorkflow } from "./validation";

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolate `{{path}}` placeholders within a string using the workflow
 * context.  Supports `{{_last}}`, `{{_last.field}}`, `{{nodeId.field}}`,
 * and `{{trigger.field}}`.
 */
export function interpolate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const trimmed = path.trim();
    const value = resolvePath(ctx, trimmed);
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  });
}

/**
 * Resolve a dot-separated path against the workflow context.
 */
function resolvePath(ctx: WorkflowContext, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = ctx;

  // Top-level shortcuts
  if (parts[0] === "_last") {
    current = ctx._last;
    parts.shift();
  } else if (parts[0] === "trigger") {
    current = ctx.trigger;
    parts.shift();
  } else if (parts[0] === "results") {
    current = ctx.results;
    parts.shift();
  } else if (ctx.results[parts[0]] !== undefined) {
    // Direct nodeId reference
    current = ctx.results[parts[0]];
    parts.shift();
  }

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a condition expression against the workflow context.
 * Parses the author-defined operands before interpolation so operator-like
 * content inside workflow data cannot change the comparison being performed.
 */
export function evaluateExpression(
  expression: string,
  ctx: WorkflowContext,
): boolean {
  return evaluateConditionConfig({ expression }, ctx);
}

type WorkflowConditionConfig = {
  expression?: string;
  leftOperand?: string;
  operator?: WorkflowConditionOperator;
  rightOperand?: string;
};

type NormalizedConditionConfig = {
  leftOperand: string;
  operator: WorkflowConditionOperator;
  rightOperand?: string;
};

const COMPARISON_OPERATORS = ["===", "!==", ">=", "<=", ">", "<"] as const;
const EXACT_PLACEHOLDER_PATTERN = /^\{\{([^}]+)\}\}$/;

export function evaluateConditionConfig(
  config: WorkflowConditionConfig,
  ctx: WorkflowContext,
): boolean {
  const normalized = normalizeConditionConfig(config);
  const left = resolveConditionOperand(normalized.leftOperand, ctx);

  if (normalized.operator === "truthy") {
    return isTruthyConditionValue(left);
  }

  const right = resolveConditionOperand(normalized.rightOperand ?? "", ctx);
  if (normalized.operator === "contains") {
    return String(left ?? "").includes(String(right ?? ""));
  }

  return compareConditionValues(left, right, normalized.operator);
}

function normalizeConditionConfig(
  config: WorkflowConditionConfig,
): NormalizedConditionConfig {
  const leftOperand =
    typeof config.leftOperand === "string" ? config.leftOperand.trim() : "";
  const operator = isConditionOperator(config.operator)
    ? config.operator
    : "truthy";
  const rightOperand =
    typeof config.rightOperand === "string" ? config.rightOperand.trim() : "";

  if (leftOperand) {
    return {
      leftOperand,
      operator,
      rightOperand: operator === "truthy" ? undefined : rightOperand,
    };
  }

  return parseConditionExpression(String(config.expression ?? ""));
}

function parseConditionExpression(
  expression: string,
): NormalizedConditionConfig {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      leftOperand: "",
      operator: "truthy",
    };
  }

  const containsMatch = trimmed.match(/^(.+?)\s+contains\s+(.+)$/i);
  if (containsMatch) {
    return {
      leftOperand: containsMatch[1].trim(),
      operator: "contains",
      rightOperand: containsMatch[2].trim(),
    };
  }

  for (const operator of COMPARISON_OPERATORS) {
    const idx = findTopLevelOperatorIndex(trimmed, operator);
    if (idx < 0) {
      continue;
    }

    return {
      leftOperand: trimmed.slice(0, idx).trim(),
      operator,
      rightOperand: trimmed.slice(idx + operator.length).trim(),
    };
  }

  if (hasTopLevelLogicalOperator(trimmed)) {
    return {
      leftOperand: "",
      operator: "truthy",
    };
  }

  return {
    leftOperand: trimmed,
    operator: "truthy",
  };
}

function findTopLevelOperatorIndex(
  expression: string,
  operator: (typeof COMPARISON_OPERATORS)[number],
): number {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i <= expression.length - operator.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === quote && expression[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (expression.slice(i, i + operator.length) === operator) {
      return i;
    }
  }

  return -1;
}

function hasTopLevelLogicalOperator(expression: string): boolean {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < expression.length - 1; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === quote && expression[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    const pair = expression.slice(i, i + 2);
    if (pair === "&&" || pair === "||") {
      return true;
    }
  }

  return false;
}

function resolveConditionOperand(
  operand: string,
  ctx: WorkflowContext,
): unknown {
  const trimmed = operand.trim();
  if (!trimmed) {
    return "";
  }

  const exactPlaceholder = trimmed.match(EXACT_PLACEHOLDER_PATTERN);
  if (exactPlaceholder) {
    return resolvePath(ctx, exactPlaceholder[1].trim());
  }
  if (trimmed.includes("{{")) {
    return interpolate(trimmed, ctx);
  }

  return parseConditionLiteral(trimmed);
}

function parseConditionLiteral(value: string): unknown {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  if (lowered === "null") return null;
  if (lowered === "undefined") return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return stripQuotes(trimmed);
  }

  const numeric = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(numeric)) {
    return numeric;
  }

  return trimmed;
}

function compareConditionValues(
  left: unknown,
  right: unknown,
  op: "===" | "!==" | ">=" | "<=" | ">" | "<",
): boolean {
  const numLeft = typeof left === "number" ? left : Number(left);
  const numRight = typeof right === "number" ? right : Number(right);
  const isNumeric =
    left !== null &&
    left !== "" &&
    right !== null &&
    right !== "" &&
    !Number.isNaN(numLeft) &&
    !Number.isNaN(numRight);

  const normalizedLeft = normalizeConditionComparable(left);
  const normalizedRight = normalizeConditionComparable(right);

  switch (op) {
    case "===":
      return isNumeric
        ? numLeft === numRight
        : normalizedLeft === normalizedRight;
    case "!==":
      return isNumeric
        ? numLeft !== numRight
        : normalizedLeft !== normalizedRight;
    case ">=":
      return isNumeric
        ? numLeft >= numRight
        : normalizedLeft >= normalizedRight;
    case "<=":
      return isNumeric
        ? numLeft <= numRight
        : normalizedLeft <= normalizedRight;
    case ">":
      return isNumeric ? numLeft > numRight : normalizedLeft > normalizedRight;
    case "<":
      return isNumeric ? numLeft < numRight : normalizedLeft < normalizedRight;
  }
}

function normalizeConditionComparable(
  value: unknown,
): string | number | boolean {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isTruthyConditionValue(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return (
      trimmed !== "" &&
      trimmed !== "false" &&
      trimmed !== "0" &&
      trimmed !== "null" &&
      trimmed !== "undefined"
    );
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return Boolean(value);
}

function isConditionOperator(
  value: unknown,
): value is WorkflowConditionOperator {
  return (
    value === "truthy" ||
    value === "===" ||
    value === "!==" ||
    value === ">=" ||
    value === "<=" ||
    value === ">" ||
    value === "<" ||
    value === "contains"
  );
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function toWorkflowMessageText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createWorkflowActionMessage(ctx: WorkflowContext): Memory {
  return {
    id: ctx.runId,
    agentId: ctx.workflowId,
    entityId: ctx.workflowId,
    roomId: ctx.runId,
    createdAt: Date.now(),
    content: {
      text: toWorkflowMessageText(ctx._last),
    },
  };
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class WorkflowCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowCompilationError";
  }
}

/**
 * Compile a workflow definition into an executable form.
 *
 * @param def - The workflow definition (nodes + edges)
 * @param runtime - The elizaOS agent runtime (used to resolve actions, models)
 * @param codeRunner - Optional sandboxed code runner (for transform nodes)
 */
export function compileWorkflow(
  def: WorkflowDef,
  runtime: IAgentRuntime,
  codeRunner?: (
    code: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>,
  availableWorkflows?: WorkflowDef[],
): CompiledWorkflow {
  // 1. Validate
  const validation = validateWorkflow(def, {
    workflows: availableWorkflows,
  });
  if (!validation.valid) {
    const errors = validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    throw new WorkflowCompilationError(`Invalid workflow: ${errors}`);
  }

  // 2. Build structures
  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of def.nodes) {
    nodeMap.set(node.id, node);
  }

  const adjacency = new Map<string, WorkflowEdge[]>();
  for (const edge of def.edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge);
    adjacency.set(edge.source, list);
  }

  // 3. Find trigger
  const triggerNode = def.nodes.find((n) => n.type === "trigger");
  if (!triggerNode) {
    throw new WorkflowCompilationError("No trigger node found");
  }

  // 4. Walk graph from trigger and build steps
  const visited = new Set<string>();
  const entrySteps = walkGraph(
    triggerNode.id,
    nodeMap,
    adjacency,
    visited,
    runtime,
    codeRunner,
  );

  // 5. Compute metadata
  const allNodes = def.nodes.filter((n) => n.type !== "trigger");
  return {
    workflowId: def.id,
    workflowName: def.name,
    entrySteps,
    stepCount: allNodes.length,
    hasDelays: def.nodes.some((n) => n.type === "delay"),
    hasHooks: def.nodes.some((n) => n.type === "hook"),
    hasLoops: def.nodes.some((n) => n.type === "loop"),
  };
}

/**
 * Recursively walk the graph from a starting node and produce an ordered
 * list of compiled steps.  Condition nodes produce branch points.
 */
function walkGraph(
  startNodeId: string,
  nodeMap: Map<string, WorkflowNode>,
  adjacency: Map<string, WorkflowEdge[]>,
  visited: Set<string>,
  runtime: IAgentRuntime,
  codeRunner?: (
    code: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>,
): CompiledStep[] {
  const steps: CompiledStep[] = [];
  let currentId: string | null = startNodeId;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) break;

    // Skip the trigger node itself (it's the entry point, not a step)
    if (node.type !== "trigger") {
      const step = compileNode(
        node,
        nodeMap,
        adjacency,
        visited,
        runtime,
        codeRunner,
      );
      steps.push(step);
    }

    // Find the next node(s)
    const outEdges: WorkflowEdge[] = adjacency.get(currentId) ?? [];

    if (node.type === "condition") {
      // Condition nodes are handled inside compileNode — stop linear walk
      break;
    }

    if (node.type === "output") {
      // Terminal node
      break;
    }

    if (outEdges.length === 0) {
      break;
    }

    // Follow the single outgoing edge (non-branching)
    // For nodes with multiple outgoing edges that aren't conditions,
    // just follow the first one (parallel branching is Phase 4)
    currentId = outEdges[0].target;
  }

  return steps;
}

/**
 * Compile a single node into an executable step.
 */
function compileNode(
  node: WorkflowNode,
  nodeMap: Map<string, WorkflowNode>,
  adjacency: Map<string, WorkflowEdge[]>,
  visited: Set<string>,
  runtime: IAgentRuntime,
  codeRunner?: (
    code: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>,
): CompiledStep {
  const { id: nodeId, type: nodeType, label, config } = node;

  switch (nodeType) {
    case "action":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          const actionName = interpolate(String(config.actionName ?? ""), ctx);
          const rawParams = (config.parameters as Record<string, string>) ?? {};
          const resolvedParams: Record<string, string> = {};
          for (const [key, val] of Object.entries(rawParams)) {
            resolvedParams[key] = interpolate(String(val), ctx);
          }

          // Find the action in the runtime
          const actions = runtime.actions ?? [];
          const action = actions.find(
            (a) => a.name === actionName || a.similes?.includes(actionName),
          );
          if (!action) {
            throw new Error(`Action "${actionName}" not found in runtime`);
          }

          const message = createWorkflowActionMessage(ctx);
          const options: HandlerOptions = {
            parameters: resolvedParams,
          };
          const result = await action.handler(
            runtime,
            message,
            undefined,
            options,
          );
          return result;
        },
      };

    case "llm":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          const prompt = interpolate(String(config.prompt ?? ""), ctx);
          const temperature =
            typeof config.temperature === "number" ? config.temperature : 0.7;
          const maxTokens =
            typeof config.maxTokens === "number" ? config.maxTokens : 2000;

          const result = await runtime.useModel(ModelType.TEXT_LARGE, {
            prompt,
            temperature,
            maxTokens,
          });
          return { text: result };
        },
      };

    case "condition":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          const result = evaluateConditionConfig(config, ctx);
          const branch = result ? "true" : "false";

          // Find the edges for each branch and execute the matching one
          const outEdges = adjacency.get(nodeId) ?? [];
          const matchingEdge = outEdges.find((e) => e.sourceHandle === branch);
          if (!matchingEdge) {
            return { branch, executed: false };
          }

          // Walk the branch subgraph
          const branchSteps = walkGraph(
            matchingEdge.target,
            nodeMap,
            adjacency,
            new Set(visited), // new visited set for branch exploration
            runtime,
            codeRunner,
          );

          // Execute branch steps sequentially
          let branchResult: unknown;
          for (const step of branchSteps) {
            branchResult = await step.execute(ctx);
            ctx.results[step.nodeId] = branchResult;
            ctx._last = branchResult;
          }

          return { branch, result: branchResult };
        },
      };

    case "transform":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          const code = String(config.code ?? "");
          if (!codeRunner) {
            throw new Error("Transform nodes require a sandboxed code runner");
          }
          // Pass the full context as params to the sandbox
          const params: Record<string, unknown> = {
            ...ctx.results,
            _last: ctx._last,
            trigger: ctx.trigger,
          };
          return codeRunner(code, params);
        },
      };

    case "delay":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (_ctx) => {
          // In real Workflow DevKit integration, this becomes
          // `await sleep(duration)`. For now we parse duration and wait.
          const duration = config.duration
            ? parseDuration(String(config.duration))
            : 0;
          const date = config.date ? new Date(String(config.date)) : null;

          const delayMs = date
            ? Math.max(0, date.getTime() - Date.now())
            : duration;

          if (delayMs > MAX_IN_PROCESS_DELAY_MS) {
            throw new Error(
              `Delay node "${label || nodeId}" exceeds the in-process maximum of 60 seconds and requires durable workflow execution`,
            );
          }

          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

          return {
            delayed: true,
            durationMs: delayMs,
            resumedAt: new Date().toISOString(),
          };
        },
      };

    case "hook":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (_ctx) => {
          // Hooks pause execution and wait for external resolution.
          // The runtime layer handles actual pause/resume mechanics.
          // Here we just return the hook metadata so the runtime knows
          // to pause.
          return {
            __hook: true,
            hookId: String(config.hookId ?? nodeId),
            description: String(config.description ?? label),
            webhookEnabled: config.webhookEnabled === true,
          };
        },
      };

    case "loop":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          const itemsExpr = String(config.itemsExpression ?? "[]");
          const variableName = String(config.variableName ?? "item");

          // Resolve the items array
          const rawItems = resolvePath(
            ctx,
            itemsExpr.replace(/^\{\{|\}\}$/g, ""),
          );
          const items = Array.isArray(rawItems) ? rawItems : [];

          // Find the "body" branch edge
          const outEdges = adjacency.get(nodeId) ?? [];
          const bodyEdge = outEdges.find(
            (e) => e.sourceHandle === "body" || !e.sourceHandle,
          );

          const results: unknown[] = [];
          if (bodyEdge) {
            for (const item of items) {
              // Create a scoped context for each iteration
              const iterCtx: WorkflowContext = {
                ...ctx,
                results: {
                  ...ctx.results,
                  [variableName]: item,
                },
                _last: item,
              };

              const bodySteps = walkGraph(
                bodyEdge.target,
                nodeMap,
                adjacency,
                new Set(), // fresh visited for each iteration
                runtime,
                codeRunner,
              );

              let iterResult: unknown;
              for (const step of bodySteps) {
                iterResult = await step.execute(iterCtx);
                iterCtx.results[step.nodeId] = iterResult;
                iterCtx._last = iterResult;
              }
              results.push(iterResult);
            }
          }

          return { items: results, count: items.length };
        },
      };

    case "subworkflow":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (_ctx) => {
          // Subworkflow execution is handled by the runtime layer
          // which loads and compiles the referenced workflow.
          return {
            __subworkflow: true,
            workflowId: String(config.workflowId ?? ""),
          };
        },
      };

    case "output":
      return {
        nodeId,
        nodeType,
        label,
        execute: async (ctx) => {
          if (config.outputExpression) {
            const expr = String(config.outputExpression);
            return interpolate(expr, ctx);
          }
          return ctx._last;
        },
      };

    default:
      return {
        nodeId,
        nodeType,
        label,
        execute: async () => ({
          error: `Unknown node type: ${nodeType}`,
        }),
      };
  }
}

export { MAX_IN_PROCESS_DELAY_MS, parseDuration } from "./duration";
