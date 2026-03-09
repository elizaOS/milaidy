import { describe, expect, it } from "vitest";
import type { WorkflowDef, WorkflowNode, WorkflowEdge } from "./types";
import { validateWorkflow } from "./validation";

function makeDef(
  overrides: Partial<WorkflowDef> = {},
): WorkflowDef {
  return {
    id: "test-wf",
    name: "Test",
    description: "",
    nodes: [],
    edges: [],
    enabled: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function triggerNode(id = "t1"): WorkflowNode {
  return {
    id,
    type: "trigger",
    label: "Trigger",
    position: { x: 0, y: 0 },
    config: { triggerType: "manual" },
  };
}

function actionNode(id = "a1", actionName = "TEST"): WorkflowNode {
  return {
    id,
    type: "action",
    label: "Action",
    position: { x: 0, y: 100 },
    config: { actionName },
  };
}

function outputNode(id = "o1"): WorkflowNode {
  return {
    id,
    type: "output",
    label: "Done",
    position: { x: 0, y: 200 },
    config: {},
  };
}

function edge(
  source: string,
  target: string,
  id?: string,
  sourceHandle?: string,
): WorkflowEdge {
  return {
    id: id ?? `${source}-${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

describe("validateWorkflow", () => {
  // --- Empty / no nodes ---

  it("rejects empty workflows", () => {
    const result = validateWorkflow(makeDef());
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("no nodes");
  });

  // --- Trigger node requirements ---

  it("requires exactly one trigger node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [actionNode()],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("trigger"))).toBe(
      true,
    );
  });

  it("rejects multiple trigger nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode("t1"), triggerNode("t2")],
        edges: [],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("Only one trigger")),
    ).toBe(true);
  });

  it("warns when trigger has no outgoing edges", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode()],
        edges: [],
      }),
    );
    // Should be valid (only warnings)
    expect(result.valid).toBe(true);
    expect(
      result.issues.some((i) => i.message.includes("no outgoing edges")),
    ).toBe(true);
  });

  // --- Duplicate node IDs ---

  it("rejects duplicate node IDs", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode("dup"),
          { ...actionNode("dup"), position: { x: 0, y: 100 } },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Duplicate"))).toBe(
      true,
    );
  });

  // --- Valid workflow ---

  it("validates a simple valid workflow", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode(), actionNode(), outputNode()],
        edges: [edge("t1", "a1"), edge("a1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  // --- Unreachable nodes ---

  it("warns about unreachable nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "orphan",
            type: "action",
            label: "Orphan",
            position: { x: 200, y: 0 },
            config: { actionName: "TEST" },
          },
        ],
      }),
    );
    expect(result.issues.some((i) => i.message.includes("unreachable"))).toBe(
      true,
    );
  });

  // --- Edge references ---

  it("rejects edges referencing non-existent source nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode()],
        edges: [edge("ghost", "t1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.message.includes("non-existent") &&
          i.message.includes("source"),
      ),
    ).toBe(true);
  });

  it("rejects edges referencing non-existent target nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode()],
        edges: [edge("t1", "ghost")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.message.includes("non-existent") &&
          i.message.includes("target"),
      ),
    ).toBe(true);
  });

  // --- Edges into trigger ---

  it("rejects edges into trigger node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode(), actionNode()],
        edges: [edge("t1", "a1"), edge("a1", "t1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.message.includes("trigger") &&
          i.message.includes("incoming"),
      ),
    ).toBe(true);
  });

  // --- Condition nodes ---

  it("requires condition nodes to have true/false edges", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "c1",
            type: "condition",
            label: "Check",
            position: { x: 0, y: 100 },
            config: { expression: "true" },
          },
        ],
        edges: [edge("t1", "c1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes('"true" branch')),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.message.includes('"false" branch')),
    ).toBe(true);
  });

  it("validates condition node with both true/false branches", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "c1",
            type: "condition",
            label: "Check",
            position: { x: 0, y: 100 },
            config: { expression: "{{_last}} === true" },
          },
          actionNode("a1"),
          actionNode("a2"),
        ],
        edges: [
          edge("t1", "c1"),
          { id: "e-true", source: "c1", target: "a1", sourceHandle: "true" },
          { id: "e-false", source: "c1", target: "a2", sourceHandle: "false" },
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("rejects condition node missing only true branch", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "c1",
            type: "condition",
            label: "Check",
            position: { x: 0, y: 100 },
            config: { expression: "true" },
          },
          actionNode("a1"),
        ],
        edges: [
          edge("t1", "c1"),
          { id: "e-false", source: "c1", target: "a1", sourceHandle: "false" },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes('"true" branch')),
    ).toBe(true);
  });

  // --- Required config fields ---

  it("rejects action node missing actionName", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "a1",
            type: "action",
            label: "No action name",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "a1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("actionName")),
    ).toBe(true);
  });

  it("rejects llm node missing prompt", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "l1",
            type: "llm",
            label: "LLM",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "l1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("prompt"))).toBe(true);
  });

  it("rejects condition node missing expression", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "c1",
            type: "condition",
            label: "Condition",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "c1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("expression"))).toBe(
      true,
    );
  });

  it("rejects transform node missing code", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "tr1",
            type: "transform",
            label: "Transform",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "tr1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("code"))).toBe(true);
  });

  it("rejects hook node missing hookId", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "h1",
            type: "hook",
            label: "Hook",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "h1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("hookId"))).toBe(true);
  });

  it("rejects loop node missing itemsExpression", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "l1",
            type: "loop",
            label: "Loop",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "l1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("itemsExpression")),
    ).toBe(true);
  });

  it("rejects subworkflow node missing workflowId", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "sw1",
            type: "subworkflow",
            label: "Sub",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "sw1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("workflowId")),
    ).toBe(true);
  });

  it("rejects trigger node missing triggerType", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "T",
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("triggerType")),
    ).toBe(true);
  });

  // --- Delay node ---

  it("requires delay nodes to have duration or date", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "d1",
            type: "delay",
            label: "Wait",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [edge("t1", "d1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.message.includes("duration") || i.message.includes("date"),
      ),
    ).toBe(true);
  });

  it("accepts delay node with duration", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "d1",
            type: "delay",
            label: "Wait",
            position: { x: 0, y: 100 },
            config: { duration: "5m" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "d1"), edge("d1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts delay node with date", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "d1",
            type: "delay",
            label: "Wait",
            position: { x: 0, y: 100 },
            config: { date: "2025-12-31T00:00:00Z" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "d1"), edge("d1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  // --- Output node ---

  it("warns about output nodes with outgoing edges", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode(), outputNode(), actionNode()],
        edges: [edge("t1", "o1"), edge("o1", "a1")],
      }),
    );
    expect(
      result.issues.some(
        (i) =>
          i.severity === "warning" && i.message.includes("outgoing edges"),
      ),
    ).toBe(true);
  });

  // --- Complex workflow ---

  it("validates a complex multi-step workflow", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          actionNode("a1", "FETCH_DATA"),
          {
            id: "c1",
            type: "condition",
            label: "Check Status",
            position: { x: 0, y: 200 },
            config: { expression: "{{a1.status}} === 200" },
          },
          {
            id: "l1",
            type: "llm",
            label: "Process",
            position: { x: -100, y: 300 },
            config: { prompt: "Process: {{a1.data}}" },
          },
          actionNode("a2", "LOG_ERROR"),
          outputNode(),
        ],
        edges: [
          edge("t1", "a1"),
          edge("a1", "c1"),
          {
            id: "c1-true",
            source: "c1",
            target: "l1",
            sourceHandle: "true",
          },
          {
            id: "c1-false",
            source: "c1",
            target: "a2",
            sourceHandle: "false",
          },
          edge("l1", "o1"),
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  // --- Multiple errors ---

  it("reports multiple errors at once", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "a1",
            type: "action",
            label: "No config",
            position: { x: 0, y: 0 },
            config: {},
          },
          {
            id: "a1",
            type: "action",
            label: "Dup",
            position: { x: 100, y: 0 },
            config: {},
          },
        ],
        edges: [edge("ghost1", "ghost2")],
      }),
    );
    expect(result.valid).toBe(false);
    // Should have: no trigger, duplicate IDs, non-existent edge refs, missing config
    expect(result.issues.filter((i) => i.severity === "error").length).toBeGreaterThanOrEqual(3);
  });

  // --- Config fields with empty string ---

  it("treats empty string config values as missing", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "a1",
            type: "action",
            label: "Empty",
            position: { x: 0, y: 100 },
            config: { actionName: "" },
          },
        ],
        edges: [edge("t1", "a1")],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("actionName")),
    ).toBe(true);
  });

  it("treats null config values as missing", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "a1",
            type: "action",
            label: "Null",
            position: { x: 0, y: 100 },
            config: { actionName: null },
          },
        ],
        edges: [edge("t1", "a1")],
      }),
    );
    expect(result.valid).toBe(false);
  });

  // --- Output node valid ---

  it("accepts output node with no required config", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [triggerNode(), outputNode()],
        edges: [edge("t1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  // --- Valid nodes with all required config ---

  it("accepts valid llm node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "l1",
            type: "llm",
            label: "LLM",
            position: { x: 0, y: 100 },
            config: { prompt: "Hello {{trigger.name}}" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "l1"), edge("l1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts valid transform node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "tr1",
            type: "transform",
            label: "Transform",
            position: { x: 0, y: 100 },
            config: { code: "return params._last" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "tr1"), edge("tr1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts valid hook node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "h1",
            type: "hook",
            label: "Hook",
            position: { x: 0, y: 100 },
            config: { hookId: "my-hook" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "h1"), edge("h1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts valid loop node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "l1",
            type: "loop",
            label: "Loop",
            position: { x: 0, y: 100 },
            config: { itemsExpression: "{{trigger.items}}" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "l1"), edge("l1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts valid subworkflow node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          triggerNode(),
          {
            id: "sw1",
            type: "subworkflow",
            label: "Sub",
            position: { x: 0, y: 100 },
            config: { workflowId: "other-wf" },
          },
          outputNode(),
        ],
        edges: [edge("t1", "sw1"), edge("sw1", "o1")],
      }),
    );
    expect(result.valid).toBe(true);
  });
});
