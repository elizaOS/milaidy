import { describe, expect, it } from "vitest";
import type { WorkflowDef } from "./types";
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

describe("validateWorkflow", () => {
  it("rejects empty workflows", () => {
    const result = validateWorkflow(makeDef());
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("no nodes");
  });

  it("requires exactly one trigger node", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "a1",
            type: "action",
            label: "Action",
            position: { x: 0, y: 0 },
            config: { actionName: "TEST" },
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("trigger"))).toBe(
      true,
    );
  });

  it("rejects duplicate node IDs", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "dup",
            type: "trigger",
            label: "T",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
          {
            id: "dup",
            type: "action",
            label: "A",
            position: { x: 0, y: 100 },
            config: { actionName: "TEST" },
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Duplicate"))).toBe(
      true,
    );
  });

  it("validates a simple valid workflow", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "Trigger",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
          {
            id: "a1",
            type: "action",
            label: "Action",
            position: { x: 0, y: 100 },
            config: { actionName: "SEND_MESSAGE" },
          },
          {
            id: "o1",
            type: "output",
            label: "Done",
            position: { x: 0, y: 200 },
            config: {},
          },
        ],
        edges: [
          { id: "e1", source: "t1", target: "a1" },
          { id: "e2", source: "a1", target: "o1" },
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("warns about unreachable nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "Trigger",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
          {
            id: "a1",
            type: "action",
            label: "Orphan",
            position: { x: 200, y: 0 },
            config: { actionName: "TEST" },
          },
        ],
      }),
    );
    // The workflow is valid (only warnings) but has an unreachable node
    expect(result.issues.some((i) => i.message.includes("unreachable"))).toBe(
      true,
    );
  });

  it("requires condition nodes to have true/false edges", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "T",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
          {
            id: "c1",
            type: "condition",
            label: "Check",
            position: { x: 0, y: 100 },
            config: { expression: "true" },
          },
        ],
        edges: [{ id: "e1", source: "t1", target: "c1" }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes('"true" branch')),
    ).toBe(true);
  });

  it("rejects edges referencing non-existent nodes", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "T",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
        ],
        edges: [{ id: "e1", source: "t1", target: "ghost" }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("non-existent")),
    ).toBe(true);
  });

  it("requires delay nodes to have duration or date", () => {
    const result = validateWorkflow(
      makeDef({
        nodes: [
          {
            id: "t1",
            type: "trigger",
            label: "T",
            position: { x: 0, y: 0 },
            config: { triggerType: "manual" },
          },
          {
            id: "d1",
            type: "delay",
            label: "Wait",
            position: { x: 0, y: 100 },
            config: {},
          },
        ],
        edges: [{ id: "e1", source: "t1", target: "d1" }],
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
});
