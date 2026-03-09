/**
 * Workflow graph validation.
 *
 * Checks structural integrity of a workflow graph before compilation:
 * - Exactly one trigger node
 * - All edges reference existing nodes
 * - No orphan nodes (unreachable from trigger)
 * - Condition nodes have edges for required handles
 * - No duplicate node IDs
 * - Required config fields present per node type
 *
 * @module workflows/validation
 */

import type {
  WorkflowDef,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from "./types";

/** Config fields required per node type. */
const REQUIRED_CONFIG: Partial<Record<WorkflowNodeType, string[]>> = {
  trigger: ["triggerType"],
  action: ["actionName"],
  llm: ["prompt"],
  condition: ["expression"],
  transform: ["code"],
  delay: [], // at least one of duration|date, checked separately
  hook: ["hookId"],
  loop: ["itemsExpression"],
  subworkflow: ["workflowId"],
  output: [],
};

/** Expected source handles for branching node types. */
const REQUIRED_HANDLES: Partial<Record<WorkflowNodeType, string[]>> = {
  condition: ["true", "false"],
};

export function validateWorkflow(def: WorkflowDef): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];

  if (!def.nodes || def.nodes.length === 0) {
    issues.push({ severity: "error", message: "Workflow has no nodes" });
    return { valid: false, issues };
  }

  // --- Duplicate node IDs ---
  const nodeIds = new Set<string>();
  for (const node of def.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }

  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of def.nodes) {
    nodeMap.set(node.id, node);
  }

  // --- Exactly one trigger ---
  const triggers = def.nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) {
    issues.push({
      severity: "error",
      message: "Workflow must have exactly one trigger node",
    });
  } else if (triggers.length > 1) {
    for (const t of triggers.slice(1)) {
      issues.push({
        severity: "error",
        nodeId: t.id,
        message: "Only one trigger node is allowed",
      });
    }
  }

  // --- Edge references ---
  for (const edge of def.edges) {
    if (!nodeMap.has(edge.source)) {
      issues.push({
        severity: "error",
        message: `Edge "${edge.id}" references non-existent source node "${edge.source}"`,
      });
    }
    if (!nodeMap.has(edge.target)) {
      issues.push({
        severity: "error",
        message: `Edge "${edge.id}" references non-existent target node "${edge.target}"`,
      });
    }
  }

  // --- No edges into trigger ---
  const edgesIntoTrigger = def.edges.filter((e) => {
    const target = nodeMap.get(e.target);
    return target?.type === "trigger";
  });
  for (const e of edgesIntoTrigger) {
    issues.push({
      severity: "error",
      message: `Edge "${e.id}" connects into trigger node — triggers cannot have incoming edges`,
    });
  }

  // --- Reachability from trigger ---
  if (triggers.length === 1) {
    const reachable = new Set<string>();
    const adjacency = buildAdjacency(def.edges);
    const queue = [triggers[0].id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      const neighbors = adjacency.get(current) ?? [];
      for (const n of neighbors) {
        if (!reachable.has(n)) queue.push(n);
      }
    }

    for (const node of def.nodes) {
      if (!reachable.has(node.id) && node.type !== "trigger") {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          message: `Node "${node.label || node.id}" is unreachable from trigger`,
        });
      }
    }
  }

  // --- Required handles for branching nodes ---
  for (const node of def.nodes) {
    const requiredHandles = REQUIRED_HANDLES[node.type];
    if (!requiredHandles) continue;

    const outEdges = def.edges.filter((e) => e.source === node.id);
    const presentHandles = new Set(outEdges.map((e) => e.sourceHandle ?? ""));

    for (const handle of requiredHandles) {
      if (!presentHandles.has(handle)) {
        issues.push({
          severity: "error",
          nodeId: node.id,
          message: `Condition node "${node.label || node.id}" is missing "${handle}" branch edge`,
        });
      }
    }
  }

  // --- Required config fields ---
  for (const node of def.nodes) {
    const required = REQUIRED_CONFIG[node.type];
    if (!required) continue;

    for (const field of required) {
      const value = node.config?.[field];
      if (value === undefined || value === null || value === "") {
        issues.push({
          severity: "error",
          nodeId: node.id,
          message: `Node "${node.label || node.id}" (${node.type}) is missing required config field "${field}"`,
        });
      }
    }

    // Delay: needs at least duration or date
    if (node.type === "delay") {
      const hasDuration =
        node.config?.duration !== undefined &&
        node.config.duration !== null &&
        node.config.duration !== "";
      const hasDate =
        node.config?.date !== undefined &&
        node.config.date !== null &&
        node.config.date !== "";
      if (!hasDuration && !hasDate) {
        issues.push({
          severity: "error",
          nodeId: node.id,
          message: `Delay node "${node.label || node.id}" needs either "duration" or "date" in config`,
        });
      }
    }
  }

  // --- Output nodes should be terminal ---
  for (const node of def.nodes) {
    if (node.type === "output") {
      const outEdges = def.edges.filter((e) => e.source === node.id);
      if (outEdges.length > 0) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          message: `Output node "${node.label || node.id}" has outgoing edges — it will be treated as terminal`,
        });
      }
    }
  }

  // --- Trigger node should have at least one outgoing edge ---
  for (const node of triggers) {
    const outEdges = def.edges.filter((e) => e.source === node.id);
    if (outEdges.length === 0) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        message: "Trigger node has no outgoing edges — workflow will do nothing",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { valid: !hasErrors, issues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAdjacency(edges: WorkflowEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }
  return adj;
}
