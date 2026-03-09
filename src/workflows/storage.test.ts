import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowDef, WorkflowRun } from "./types";

// Mock config module
vi.mock("../config/config", () => ({
  loadMiladyConfig: vi.fn(() => ({})),
  saveMiladyConfig: vi.fn(),
}));

// Mock fs module - use vi.hoisted to ensure variables are available in mock factory
const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn(() => { throw new Error("ENOENT"); }),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  };
});

import {
  loadWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  loadWorkflowRuns,
  saveWorkflowRuns,
} from "./storage";
import { loadMiladyConfig, saveMiladyConfig } from "../config/config";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadWorkflows
// ---------------------------------------------------------------------------

describe("loadWorkflows", () => {
  it("returns empty array when no workflows configured", () => {
    const result = loadWorkflows();
    expect(result).toEqual([]);
  });

  it("returns workflows from config", () => {
    const mockWorkflows: WorkflowDef[] = [
      {
        id: "wf1",
        name: "Test",
        description: "",
        nodes: [],
        edges: [],
        enabled: true,
        version: 1,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      },
    ];
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: mockWorkflows,
    } as never);

    const result = loadWorkflows();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("wf1");
  });
});

// ---------------------------------------------------------------------------
// getWorkflow
// ---------------------------------------------------------------------------

describe("getWorkflow", () => {
  it("returns null when workflow not found", () => {
    const result = getWorkflow("nonexistent");
    expect(result).toBeNull();
  });

  it("returns matching workflow by id", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [
        {
          id: "wf1",
          name: "First",
          description: "",
          nodes: [],
          edges: [],
          enabled: true,
          version: 1,
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
        },
        {
          id: "wf2",
          name: "Second",
          description: "",
          nodes: [],
          edges: [],
          enabled: true,
          version: 1,
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
        },
      ],
    } as never);

    const result = getWorkflow("wf2");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Second");
  });
});

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe("createWorkflow", () => {
  it("creates a workflow with defaults", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({} as never);

    const req: CreateWorkflowRequest = {
      name: "New Workflow",
    };

    const result = createWorkflow(req);
    expect(result.name).toBe("New Workflow");
    expect(result.description).toBe("");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.enabled).toBe(false);
    expect(result.version).toBe(1);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(saveMiladyConfig).toHaveBeenCalled();
  });

  it("creates a workflow with provided values", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({} as never);

    const req: CreateWorkflowRequest = {
      name: "Custom Workflow",
      description: "A test workflow",
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
      ],
      edges: [],
      enabled: true,
    };

    const result = createWorkflow(req);
    expect(result.name).toBe("Custom Workflow");
    expect(result.description).toBe("A test workflow");
    expect(result.nodes).toHaveLength(1);
    expect(result.enabled).toBe(true);
  });

  it("appends to existing workflows list", () => {
    const existing: WorkflowDef = {
      id: "existing-1",
      name: "Existing",
      description: "",
      nodes: [],
      edges: [],
      enabled: true,
      version: 1,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [existing],
    } as never);

    const result = createWorkflow({ name: "Second" });
    expect(result.id).not.toBe("existing-1");
    // saveMiladyConfig should have been called with both workflows
    const savedConfig = vi.mocked(saveMiladyConfig).mock.calls[0][0] as Record<string, unknown>;
    expect((savedConfig.workflows as WorkflowDef[]).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// updateWorkflow
// ---------------------------------------------------------------------------

describe("updateWorkflow", () => {
  it("returns null when workflow not found", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({ workflows: [] } as never);

    const result = updateWorkflow("nonexistent", { name: "Updated" });
    expect(result).toBeNull();
  });

  it("updates workflow fields and increments version", () => {
    const existing: WorkflowDef = {
      id: "wf1",
      name: "Original",
      description: "old",
      nodes: [],
      edges: [],
      enabled: false,
      version: 3,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [existing],
    } as never);

    const req: UpdateWorkflowRequest = {
      name: "Updated",
      description: "new desc",
      enabled: true,
    };

    const result = updateWorkflow("wf1", req);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Updated");
    expect(result!.description).toBe("new desc");
    expect(result!.enabled).toBe(true);
    expect(result!.version).toBe(4);
    expect(result!.updatedAt).not.toBe("2025-01-01");
    expect(saveMiladyConfig).toHaveBeenCalled();
  });

  it("preserves unchanged fields", () => {
    const existing: WorkflowDef = {
      id: "wf1",
      name: "Keep",
      description: "keep-this",
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "T",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
      ],
      edges: [],
      enabled: true,
      version: 1,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [existing],
    } as never);

    const result = updateWorkflow("wf1", { description: "updated" });
    expect(result!.name).toBe("Keep");
    expect(result!.description).toBe("updated");
    expect(result!.nodes).toHaveLength(1);
    expect(result!.enabled).toBe(true);
  });

  it("updates nodes and edges", () => {
    const existing: WorkflowDef = {
      id: "wf1",
      name: "Test",
      description: "",
      nodes: [],
      edges: [],
      enabled: true,
      version: 1,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [existing],
    } as never);

    const newNodes = [
      {
        id: "t1",
        type: "trigger" as const,
        label: "Start",
        position: { x: 0, y: 0 },
        config: { triggerType: "manual" },
      },
      {
        id: "a1",
        type: "action" as const,
        label: "Action",
        position: { x: 0, y: 100 },
        config: { actionName: "TEST" },
      },
    ];
    const newEdges = [{ id: "e1", source: "t1", target: "a1" }];

    const result = updateWorkflow("wf1", { nodes: newNodes, edges: newEdges });
    expect(result!.nodes).toHaveLength(2);
    expect(result!.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deleteWorkflow
// ---------------------------------------------------------------------------

describe("deleteWorkflow", () => {
  it("returns false when workflow not found", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({ workflows: [] } as never);

    expect(deleteWorkflow("nonexistent")).toBe(false);
  });

  it("deletes existing workflow and saves", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({
      workflows: [
        {
          id: "wf1",
          name: "ToDelete",
          description: "",
          nodes: [],
          edges: [],
          enabled: true,
          version: 1,
          createdAt: "2025-01-01",
          updatedAt: "2025-01-01",
        },
      ],
    } as never);

    expect(deleteWorkflow("wf1")).toBe(true);
    expect(saveMiladyConfig).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadWorkflowRuns
// ---------------------------------------------------------------------------

describe("loadWorkflowRuns", () => {
  it("returns empty array when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadWorkflowRuns();
    expect(result).toEqual([]);
  });

  it("returns runs from file", () => {
    const runs: WorkflowRun[] = [
      {
        runId: "run-1",
        workflowId: "wf1",
        workflowName: "Test",
        status: "completed",
        input: {},
        events: [],
        startedAt: "2025-01-01",
        finishedAt: "2025-01-01",
      },
    ];

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(runs));

    const result = loadWorkflowRuns();
    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe("run-1");
  });

  it("returns empty array on parse error", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("invalid json{{{");

    const result = loadWorkflowRuns();
    expect(result).toEqual([]);
  });

  it("returns empty array when file contains non-array JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{"not": "an array"}');

    const result = loadWorkflowRuns();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveWorkflowRuns
// ---------------------------------------------------------------------------

describe("saveWorkflowRuns", () => {
  it("writes runs to file", () => {
    // existsSync needs to return true for the dir check
    mockExistsSync.mockReturnValue(true);

    const runs: WorkflowRun[] = [
      {
        runId: "run-1",
        workflowId: "wf1",
        workflowName: "Test",
        status: "completed",
        input: {},
        events: [],
        startedAt: "2025-01-01",
      },
    ];

    saveWorkflowRuns(runs);
    expect(mockWriteFileSync).toHaveBeenCalled();

    const writtenData = mockWriteFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenData);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].runId).toBe("run-1");
  });

  it("writes empty array", () => {
    mockExistsSync.mockReturnValue(true);

    saveWorkflowRuns([]);
    expect(mockWriteFileSync).toHaveBeenCalled();

    const writtenData = mockWriteFileSync.mock.calls[0][1] as string;
    expect(JSON.parse(writtenData)).toEqual([]);
  });
});
