/**
 * WorkflowBuilderView — Visual workflow builder and management page.
 *
 * Provides:
 * - List of all workflow definitions with enable/disable toggles
 * - Visual node-graph editor for building workflows
 * - Run history and monitoring
 * - Workflow validation and execution
 */

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Play,
  Save,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  client,
  type WorkflowDef,
  type WorkflowRunSummary,
} from "../api-client";
import { getDefaultWorkflowNodeConfig } from "./workflow/default-node-config";
import { NodeConfigPanel } from "./workflow/NodeConfigPanel";
import { NodePalette } from "./workflow/NodePalette";
import { WorkflowCanvas } from "./workflow/WorkflowCanvas";
import { WorkflowListPanel } from "./workflow/WorkflowListPanel";
import { WorkflowRunsPanel } from "./workflow/WorkflowRunsPanel";

type ViewMode = "list" | "editor" | "runs";

// ---------------------------------------------------------------------------
// Node type metadata for display
// ---------------------------------------------------------------------------

const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: "#f59e0b",
  action: "#3b82f6",
  llm: "#8b5cf6",
  condition: "#ef4444",
  transform: "#10b981",
  delay: "#6366f1",
  hook: "#f97316",
  loop: "#14b8a6",
  subworkflow: "#ec4899",
  output: "#6b7280",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowBuilderView() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDef | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    issues: Array<{ severity: string; nodeId?: string; message: string }>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────

  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.listWorkflows();
      setWorkflows(result);
    } catch {
      setErrorMessage("Failed to load workflows. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const loadRuns = useCallback(async (workflowId: string) => {
    try {
      const result = await client.listWorkflowRuns(workflowId);
      setRuns(result);
    } catch {
      setErrorMessage("Failed to load workflow runs.");
    }
  }, []);

  // ── List view handlers ────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    try {
      const workflow = await client.createWorkflow({
        name: "New Workflow",
        description: "",
        nodes: [
          {
            id: "trigger-1",
            type: "trigger",
            label: "Manual Trigger",
            position: { x: 250, y: 50 },
            config: { triggerType: "manual" },
          },
        ],
        edges: [],
        enabled: false,
      });
      setEditingWorkflow(workflow);
      setViewMode("editor");
    } catch {
      setErrorMessage("Failed to create workflow.");
    }
  }, []);

  const handleEdit = useCallback((workflow: WorkflowDef) => {
    setEditingWorkflow(workflow);
    setSelectedNodeId(null);
    setValidationResult(null);
    setViewMode("editor");
  }, []);

  const handleViewRuns = useCallback(
    (workflow: WorkflowDef) => {
      setEditingWorkflow(workflow);
      loadRuns(workflow.id);
      setViewMode("runs");
    },
    [loadRuns],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const workflow = workflows.find((w) => w.id === id);
      const name = workflow?.name ?? "this workflow";
      if (
        !window.confirm(
          `Are you sure you want to delete "${name}"? This cannot be undone.`,
        )
      ) {
        return;
      }
      try {
        await client.deleteWorkflow(id);
        await loadWorkflows();
      } catch {
        setErrorMessage("Failed to delete workflow.");
      }
    },
    [loadWorkflows, workflows],
  );

  const handleToggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await client.updateWorkflow(id, { enabled });
        setWorkflows((prev) =>
          prev.map((w) => (w.id === id ? { ...w, enabled } : w)),
        );
      } catch {
        setErrorMessage("Failed to toggle workflow.");
      }
    },
    [],
  );

  const handleDuplicate = useCallback(
    async (workflow: WorkflowDef) => {
      try {
        await client.createWorkflow({
          name: `${workflow.name} (copy)`,
          description: workflow.description,
          nodes: workflow.nodes,
          edges: workflow.edges,
          enabled: false,
        });
        await loadWorkflows();
      } catch {
        setErrorMessage("Failed to duplicate workflow.");
      }
    },
    [loadWorkflows],
  );

  // ── Editor handlers ───────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editingWorkflow) return;
    setSaving(true);
    try {
      const updated = await client.updateWorkflow(editingWorkflow.id, {
        name: editingWorkflow.name,
        description: editingWorkflow.description,
        nodes: editingWorkflow.nodes,
        edges: editingWorkflow.edges,
        enabled: editingWorkflow.enabled,
      });
      setEditingWorkflow(updated);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === updated.id ? updated : w)),
      );
    } catch {
      setErrorMessage("Failed to save workflow.");
    } finally {
      setSaving(false);
    }
  }, [editingWorkflow]);

  const handleValidate = useCallback(async () => {
    if (!editingWorkflow) return;
    // Save first
    await handleSave();
    try {
      const result = await client.validateWorkflow(editingWorkflow.id);
      setValidationResult(result);
    } catch {
      setErrorMessage("Failed to validate workflow.");
    }
  }, [editingWorkflow, handleSave]);

  const handleRun = useCallback(async () => {
    if (!editingWorkflow) return;
    await handleSave();
    try {
      const run = await client.startWorkflow(editingWorkflow.id, {});
      setRuns((prev) => [run, ...prev]);
    } catch {
      setErrorMessage("Failed to start workflow.");
    }
  }, [editingWorkflow, handleSave]);

  const handleBack = useCallback(() => {
    setViewMode("list");
    setEditingWorkflow(null);
    setSelectedNodeId(null);
    setValidationResult(null);
    loadWorkflows();
  }, [loadWorkflows]);

  const handleUpdateWorkflow = useCallback(
    (updates: Partial<WorkflowDef>) => {
      if (!editingWorkflow) return;
      setEditingWorkflow({ ...editingWorkflow, ...updates });
    },
    [editingWorkflow],
  );

  const selectedNode = useMemo(() => {
    if (!editingWorkflow || !selectedNodeId) return null;
    return editingWorkflow.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [editingWorkflow, selectedNodeId]);

  // ── Filtered workflows ────────────────────────────────────────────────

  const filteredWorkflows = useMemo(() => {
    if (!search.trim()) return workflows;
    const q = search.toLowerCase();
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q),
    );
  }, [workflows, search]);

  // ── Error banner helper ──────────────────────────────────────────────

  const errorBanner = errorMessage ? (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded mx-4 mt-2">
      <AlertCircle size={14} />
      <span className="flex-1">{errorMessage}</span>
      <button
        type="button"
        onClick={() => setErrorMessage(null)}
        className="text-red-400 hover:text-red-300"
      >
        <XCircle size={14} />
      </button>
    </div>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────

  if (viewMode === "editor" && editingWorkflow) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {errorBanner}
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="p-1 hover:bg-surface rounded"
            title="Back to list"
          >
            <ChevronLeft size={18} />
          </button>

          <input
            type="text"
            value={editingWorkflow.name}
            onChange={(e) => handleUpdateWorkflow({ name: e.target.value })}
            className="text-sm font-medium bg-transparent border-none outline-none flex-1 min-w-0"
            placeholder="Workflow name"
          />

          <div className="flex items-center gap-2">
            {validationResult && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  validationResult.valid ? "text-green-400" : "text-red-400"
                }`}
              >
                {validationResult.valid ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
                {validationResult.valid
                  ? "Valid"
                  : `${validationResult.issues.filter((i) => i.severity === "error").length} errors`}
              </span>
            )}

            <button
              type="button"
              onClick={handleValidate}
              className="text-xs px-3 py-1.5 rounded bg-surface hover:bg-surface/80 text-muted"
            >
              Validate
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded bg-surface hover:bg-surface/80 flex items-center gap-1"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Save
            </button>

            <button
              type="button"
              onClick={handleRun}
              className="text-xs px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent flex items-center gap-1"
            >
              <Play size={12} />
              Run
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex flex-1 min-h-0">
          {/* Node palette (left) */}
          <NodePalette
            onAddNode={(type, label) => {
              const id = `${type}-${Date.now()}`;
              const newNode = {
                id,
                type: type as WorkflowDef["nodes"][0]["type"],
                label,
                position: {
                  x: 250,
                  y: 100 + editingWorkflow.nodes.length * 80,
                },
                config: getDefaultWorkflowNodeConfig(type),
              };
              handleUpdateWorkflow({
                nodes: [...editingWorkflow.nodes, newNode],
              });
              setSelectedNodeId(id);
            }}
          />

          {/* Canvas (center) */}
          <div className="flex-1 min-w-0 relative">
            <WorkflowCanvas
              nodes={editingWorkflow.nodes}
              edges={editingWorkflow.edges}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onUpdateNodes={(nodes) => handleUpdateWorkflow({ nodes })}
              onUpdateEdges={(edges) => handleUpdateWorkflow({ edges })}
              nodeTypeColors={NODE_TYPE_COLORS}
            />

            {/* Validation issues overlay */}
            {validationResult && !validationResult.valid && (
              <div className="absolute bottom-4 left-4 right-4 max-h-32 overflow-y-auto bg-surface/95 border border-border rounded-lg p-3 text-xs">
                {validationResult.issues.map((issue, i) => (
                  <div
                    key={`${issue.message}-${i}`}
                    className={`flex items-start gap-2 mb-1 ${
                      issue.severity === "error"
                        ? "text-red-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {issue.severity === "error" ? (
                      <XCircle size={12} className="mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    )}
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Config panel (right) */}
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={(config) => {
                handleUpdateWorkflow({
                  nodes: editingWorkflow.nodes.map((n) =>
                    n.id === selectedNode.id ? { ...n, ...config } : n,
                  ),
                });
              }}
              onDelete={() => {
                handleUpdateWorkflow({
                  nodes: editingWorkflow.nodes.filter(
                    (n) => n.id !== selectedNode.id,
                  ),
                  edges: editingWorkflow.edges.filter(
                    (e) =>
                      e.source !== selectedNode.id &&
                      e.target !== selectedNode.id,
                  ),
                });
                setSelectedNodeId(null);
              }}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      </div>
    );
  }

  if (viewMode === "runs" && editingWorkflow) {
    return (
      <div>
        {errorBanner}
        <WorkflowRunsPanel
          runs={runs}
          workflow={editingWorkflow}
          onBack={handleBack}
          onRefresh={() => loadRuns(editingWorkflow.id)}
        />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────

  return (
    <div>
      {errorBanner}
      <WorkflowListPanel
        loading={loading}
        search={search}
        workflows={filteredWorkflows}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onEdit={handleEdit}
        onSearchChange={setSearch}
        onToggle={handleToggleEnabled}
        onViewRuns={handleViewRuns}
      />
    </div>
  );
}
