import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock storage module
vi.mock("./storage", () => ({
  loadWorkflows: vi.fn(() => []),
  loadWorkflowRuns: vi.fn(() => []),
  saveWorkflowRuns: vi.fn(),
}));

// Mock compiler module
vi.mock("./compiler", () => ({
  compileWorkflow: vi.fn(),
}));

import {
  setWorkflowRuntime,
  getWorkflowRuntime,
  getWorkflowRun,
  listWorkflowRuns,
  cancelWorkflowRun,
  resolveHook,
  listPendingHooks,
  hydrateRuns,
  startWorkflow,
} from "./runtime";
import { loadWorkflows, loadWorkflowRuns } from "./storage";
import { compileWorkflow } from "./compiler";
import type { WorkflowRun } from "./types";

const mockRuntime = {
  actions: [],
  useModel: vi.fn(),
} as never;

function makeSimpleDef(id: string, name: string, enabled = true) {
  return {
    id,
    name,
    description: "",
    nodes: [
      {
        id: "t1",
        type: "trigger" as const,
        label: "T",
        position: { x: 0, y: 0 },
        config: { triggerType: "manual" },
      },
    ],
    edges: [],
    enabled,
    version: 1,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  };
}

function mockEmptyCompilation(workflowId: string, workflowName: string) {
  vi.mocked(compileWorkflow).mockReturnValue({
    workflowId,
    workflowName,
    entrySteps: [],
    stepCount: 0,
    hasDelays: false,
    hasHooks: false,
    hasLoops: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setWorkflowRuntime(mockRuntime);
});

// ---------------------------------------------------------------------------
// setWorkflowRuntime / getWorkflowRuntime
// ---------------------------------------------------------------------------

describe("setWorkflowRuntime / getWorkflowRuntime", () => {
  it("stores and retrieves the runtime reference", () => {
    const rt = { custom: true } as never;
    setWorkflowRuntime(rt);
    expect(getWorkflowRuntime()).toBe(rt);
    // Restore for other tests
    setWorkflowRuntime(mockRuntime);
  });
});

// ---------------------------------------------------------------------------
// startWorkflow
// ---------------------------------------------------------------------------

describe("startWorkflow", () => {
  it("throws when workflow not found", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([]);
    await expect(startWorkflow("nonexistent")).rejects.toThrow(
      'Workflow "nonexistent" not found',
    );
  });

  it("throws when workflow is disabled", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf1", "Disabled WF", false),
    ]);

    await expect(startWorkflow("wf1")).rejects.toThrow("disabled");
  });

  it("returns a workflow run with correct fields", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf1", "Test WF"),
    ]);
    mockEmptyCompilation("wf1", "Test WF");

    const run = await startWorkflow("wf1", { key: "value" });
    expect(run.workflowId).toBe("wf1");
    expect(run.workflowName).toBe("Test WF");
    expect(run.input).toEqual({ key: "value" });
    expect(run.runId).toBeDefined();
    expect(run.startedAt).toBeDefined();
  });

  it("defaults input to empty object", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf1", "Test"),
    ]);
    mockEmptyCompilation("wf1", "Test");

    const run = await startWorkflow("wf1");
    expect(run.input).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getWorkflowRun
// ---------------------------------------------------------------------------

describe("getWorkflowRun", () => {
  it("returns null for unknown run", () => {
    expect(getWorkflowRun("unknown-id-that-never-existed")).toBeNull();
  });

  it("returns run after it was created via startWorkflow", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf1", "Test"),
    ]);
    mockEmptyCompilation("wf1", "Test");

    const run = await startWorkflow("wf1");
    const fetched = getWorkflowRun(run.runId);
    expect(fetched).not.toBeNull();
    expect(fetched!.runId).toBe(run.runId);
  });
});

// ---------------------------------------------------------------------------
// listWorkflowRuns
// ---------------------------------------------------------------------------

describe("listWorkflowRuns", () => {
  it("filters runs by workflowId", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-unique-filter", "Filtered"),
    ]);
    mockEmptyCompilation("wf-unique-filter", "Filtered");

    await startWorkflow("wf-unique-filter");
    const filtered = listWorkflowRuns("wf-unique-filter");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((r) => r.workflowId === "wf-unique-filter")).toBe(true);
  });

  it("returns runs for all workflows when no filter", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-all-1", "WF1"),
    ]);
    mockEmptyCompilation("wf-all-1", "WF1");

    await startWorkflow("wf-all-1");
    const all = listWorkflowRuns();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-existent workflowId", () => {
    const filtered = listWorkflowRuns("wf-does-not-exist-at-all");
    expect(filtered).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cancelWorkflowRun
// ---------------------------------------------------------------------------

describe("cancelWorkflowRun", () => {
  it("returns false for unknown run", () => {
    expect(cancelWorkflowRun("unknown-cancel-id")).toBe(false);
  });

  it("cancels a pending/running workflow", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-cancel", "Cancel Test"),
    ]);
    // Use a step that takes some time so we can cancel
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-cancel",
      workflowName: "Cancel Test",
      entrySteps: [
        {
          nodeId: "slow",
          nodeType: "delay",
          label: "Slow Step",
          execute: async () => {
            await new Promise((r) => setTimeout(r, 5000));
            return {};
          },
        },
      ],
      stepCount: 1,
      hasDelays: true,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-cancel");
    // Give async execution a tick to start
    await new Promise((r) => setTimeout(r, 10));

    const result = cancelWorkflowRun(run.runId);
    expect(result).toBe(true);

    const cancelled = getWorkflowRun(run.runId);
    expect(cancelled!.status).toBe("cancelled");
    expect(cancelled!.finishedAt).toBeDefined();
  });

  it("returns false for already completed run", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-done", "Done Test"),
    ]);
    mockEmptyCompilation("wf-done", "Done Test");

    const run = await startWorkflow("wf-done");
    // Wait for completion
    await new Promise((r) => setTimeout(r, 100));

    const fetched = getWorkflowRun(run.runId);
    if (fetched?.status === "completed") {
      expect(cancelWorkflowRun(run.runId)).toBe(false);
    }
  });

  it("returns false for already cancelled run", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-c2", "C2"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-c2",
      workflowName: "C2",
      entrySteps: [
        {
          nodeId: "slow",
          nodeType: "delay",
          label: "Slow",
          execute: async () => {
            await new Promise((r) => setTimeout(r, 5000));
            return {};
          },
        },
      ],
      stepCount: 1,
      hasDelays: true,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-c2");
    await new Promise((r) => setTimeout(r, 10));

    cancelWorkflowRun(run.runId);
    // Second cancel should return false
    expect(cancelWorkflowRun(run.runId)).toBe(false);
  });

  it("keeps cancelled run status when in-flight step resolves", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-cancel-final", "Cancel Final"),
    ]);

    let releaseStep: (() => void) | null = null;
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-cancel-final",
      workflowName: "Cancel Final",
      entrySteps: [
        {
          nodeId: "slow",
          nodeType: "delay",
          label: "Slow",
          execute: async () =>
            await new Promise((resolve) => {
              releaseStep = () => resolve({ done: true });
            }),
        },
      ],
      stepCount: 1,
      hasDelays: true,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-cancel-final");
    await new Promise((r) => setTimeout(r, 10));

    expect(cancelWorkflowRun(run.runId)).toBe(true);
    releaseStep?.();
    await new Promise((r) => setTimeout(r, 20));

    const cancelled = getWorkflowRun(run.runId);
    expect(cancelled!.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// resolveHook / listPendingHooks
// ---------------------------------------------------------------------------

describe("resolveHook", () => {
  it("returns false for unknown hook", () => {
    expect(resolveHook("unknown-hook-id")).toBe(false);
  });
});

describe("listPendingHooks", () => {
  it("returns array (may have hooks from other tests)", () => {
    const hooks = listPendingHooks();
    expect(Array.isArray(hooks)).toBe(true);
  });

  it("tracks pending hooks for concurrent runs with same hookId", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-shared-hook", "Shared Hook"),
    ]);

    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-shared-hook",
      workflowName: "Shared Hook",
      entrySteps: [
        {
          nodeId: "wait",
          nodeType: "hook",
          label: "Wait",
          execute: async () => ({ __hook: true, hookId: "shared" }),
        },
      ],
      stepCount: 1,
      hasDelays: false,
      hasHooks: true,
      hasLoops: false,
    });

    const runA = await startWorkflow("wf-shared-hook");
    const runB = await startWorkflow("wf-shared-hook");
    await new Promise((r) => setTimeout(r, 20));

    const hooks = listPendingHooks().filter((hook) => hook.hookId === "shared");
    expect(hooks).toHaveLength(2);
    expect(hooks.map((hook) => hook.runId).sort()).toEqual(
      [runA.runId, runB.runId].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// hydrateRuns
// ---------------------------------------------------------------------------

describe("hydrateRuns", () => {
  it("marks previously running runs as failed", () => {
    const staleRuns: WorkflowRun[] = [
      {
        runId: "hydrate-running",
        workflowId: "wf1",
        workflowName: "Test",
        status: "running",
        input: {},
        events: [],
        startedAt: "2025-01-01",
      },
      {
        runId: "hydrate-paused",
        workflowId: "wf1",
        workflowName: "Test",
        status: "paused",
        input: {},
        events: [],
        startedAt: "2025-01-01",
      },
      {
        runId: "hydrate-pending",
        workflowId: "wf1",
        workflowName: "Test",
        status: "pending",
        input: {},
        events: [],
        startedAt: "2025-01-01",
      },
      {
        runId: "hydrate-sleeping",
        workflowId: "wf1",
        workflowName: "Test",
        status: "sleeping",
        input: {},
        events: [],
        startedAt: "2025-01-01",
      },
    ];
    vi.mocked(loadWorkflowRuns).mockReturnValue(staleRuns);

    hydrateRuns();

    for (const staleRun of staleRuns) {
      const run = getWorkflowRun(staleRun.runId);
      expect(run).not.toBeNull();
      expect(run!.status).toBe("failed");
      expect(run!.error).toContain("Process restarted");
      expect(run!.finishedAt).toBeDefined();
    }
  });

  it("preserves completed runs as-is", () => {
    const completedRuns: WorkflowRun[] = [
      {
        runId: "hydrate-completed",
        workflowId: "wf1",
        workflowName: "Test",
        status: "completed",
        input: {},
        events: [],
        startedAt: "2025-01-01",
        finishedAt: "2025-01-02",
        output: { result: "ok" },
      },
    ];
    vi.mocked(loadWorkflowRuns).mockReturnValue(completedRuns);

    hydrateRuns();

    const completed = getWorkflowRun("hydrate-completed");
    expect(completed!.status).toBe("completed");
    expect(completed!.output).toEqual({ result: "ok" });
  });

  it("preserves failed runs as-is", () => {
    vi.mocked(loadWorkflowRuns).mockReturnValue([
      {
        runId: "hydrate-failed",
        workflowId: "wf1",
        workflowName: "Test",
        status: "failed",
        input: {},
        events: [],
        startedAt: "2025-01-01",
        finishedAt: "2025-01-02",
        error: "original error",
      },
    ]);

    hydrateRuns();

    const failed = getWorkflowRun("hydrate-failed");
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("original error");
  });

  it("preserves cancelled runs as-is", () => {
    vi.mocked(loadWorkflowRuns).mockReturnValue([
      {
        runId: "hydrate-cancelled",
        workflowId: "wf1",
        workflowName: "Test",
        status: "cancelled",
        input: {},
        events: [],
        startedAt: "2025-01-01",
        finishedAt: "2025-01-02",
      },
    ]);

    hydrateRuns();

    const cancelled = getWorkflowRun("hydrate-cancelled");
    expect(cancelled!.status).toBe("cancelled");
  });

  it("handles storage errors gracefully", () => {
    vi.mocked(loadWorkflowRuns).mockImplementation(() => {
      throw new Error("Storage error");
    });
    expect(() => hydrateRuns()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Workflow execution with steps
// ---------------------------------------------------------------------------

describe("workflow execution", () => {
  it("executes steps and completes the run", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-exec", "Exec Test"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-exec",
      workflowName: "Exec Test",
      entrySteps: [
        {
          nodeId: "step1",
          nodeType: "action",
          label: "Step 1",
          execute: async () => ({ value: 42 }),
        },
      ],
      stepCount: 1,
      hasDelays: false,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-exec");
    // Wait for async execution
    await new Promise((r) => setTimeout(r, 100));

    const finished = getWorkflowRun(run.runId);
    expect(finished!.status).toBe("completed");
    expect(finished!.output).toEqual({ value: 42 });
    expect(finished!.finishedAt).toBeDefined();
    expect(finished!.events).toHaveLength(1);
    expect(finished!.events[0].nodeId).toBe("step1");
    expect(finished!.events[0].status).toBe("completed");
  });

  it("marks run as failed when step throws", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-fail", "Fail Test"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-fail",
      workflowName: "Fail Test",
      entrySteps: [
        {
          nodeId: "bad-step",
          nodeType: "action",
          label: "Bad Step",
          execute: async () => {
            throw new Error("Step exploded");
          },
        },
      ],
      stepCount: 1,
      hasDelays: false,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-fail");
    await new Promise((r) => setTimeout(r, 100));

    const finished = getWorkflowRun(run.runId);
    expect(finished!.status).toBe("failed");
    expect(finished!.error).toContain("Step exploded");
  });

  it("tracks step events for each executed step", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-events", "Events Test"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-events",
      workflowName: "Events Test",
      entrySteps: [
        {
          nodeId: "s1",
          nodeType: "action",
          label: "First",
          execute: async () => "one",
        },
        {
          nodeId: "s2",
          nodeType: "action",
          label: "Second",
          execute: async () => "two",
        },
      ],
      stepCount: 2,
      hasDelays: false,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-events");
    await new Promise((r) => setTimeout(r, 100));

    const finished = getWorkflowRun(run.runId);
    expect(finished!.events).toHaveLength(2);
    expect(finished!.events[0].nodeId).toBe("s1");
    expect(finished!.events[0].nodeLabel).toBe("First");
    expect(finished!.events[1].nodeId).toBe("s2");
    expect(finished!.events[1].nodeLabel).toBe("Second");
  });

  it("respects cancellation during step execution", async () => {
    let stepCount = 0;
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-cancel-exec", "Cancel Exec"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-cancel-exec",
      workflowName: "Cancel Exec",
      entrySteps: [
        {
          nodeId: "s1",
          nodeType: "action",
          label: "Step 1",
          execute: async () => {
            stepCount++;
            // Simulate slow step
            await new Promise((r) => setTimeout(r, 200));
            return "done";
          },
        },
        {
          nodeId: "s2",
          nodeType: "action",
          label: "Step 2",
          execute: async () => {
            stepCount++;
            return "should not run";
          },
        },
      ],
      stepCount: 2,
      hasDelays: false,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-cancel-exec");
    // Cancel while step 1 is executing
    await new Promise((r) => setTimeout(r, 50));
    cancelWorkflowRun(run.runId);

    // Wait for async to settle
    await new Promise((r) => setTimeout(r, 300));

    const finished = getWorkflowRun(run.runId);
    expect(finished!.status).toBe("cancelled");
    // Step 2 should not have executed (cancel checked between steps)
    // Note: step 1 may have already started, but step 2 should be skipped
    expect(stepCount).toBeLessThanOrEqual(1);
  });

  it("does not overwrite cancelled status with completed", async () => {
    vi.mocked(loadWorkflows).mockReturnValue([
      makeSimpleDef("wf-no-overwrite", "No Overwrite"),
    ]);
    vi.mocked(compileWorkflow).mockReturnValue({
      workflowId: "wf-no-overwrite",
      workflowName: "No Overwrite",
      entrySteps: [
        {
          nodeId: "slow",
          nodeType: "delay",
          label: "Slow",
          execute: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return { delayed: true };
          },
        },
      ],
      stepCount: 1,
      hasDelays: true,
      hasHooks: false,
      hasLoops: false,
    });

    const run = await startWorkflow("wf-no-overwrite");
    // Cancel immediately
    await new Promise((r) => setTimeout(r, 10));
    cancelWorkflowRun(run.runId);

    // Wait for async to settle
    await new Promise((r) => setTimeout(r, 200));

    const finished = getWorkflowRun(run.runId);
    // Status should remain cancelled, not get overwritten to completed
    expect(finished!.status).toBe("cancelled");
  });
});
