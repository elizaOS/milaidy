import { Copy, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import type { WorkflowDef } from "../../api-client";

type WorkflowListPanelProps = {
  loading: boolean;
  search: string;
  workflows: WorkflowDef[];
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (workflow: WorkflowDef) => void;
  onEdit: (workflow: WorkflowDef) => void;
  onSearchChange: (value: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onViewRuns: (workflow: WorkflowDef) => void;
};

export function WorkflowListPanel({
  loading,
  search,
  workflows,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onSearchChange,
  onToggle,
  onViewRuns,
}: WorkflowListPanelProps) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium">Workflows</h2>
          <p className="text-xs text-muted mt-0.5">
            Visual multi-step automations for your agent
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="text-xs px-3 py-1.5 rounded bg-accent/20 hover:bg-accent/30 text-accent flex items-center gap-1"
        >
          <Plus size={12} />
          New Workflow
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search workflows..."
          className="w-full px-3 py-1.5 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-8">
          <GitBranch size={32} className="mx-auto text-muted mb-2 opacity-40" />
          <p className="text-xs text-muted">
            {search ? "No workflows match your search" : "No workflows yet"}
          </p>
          {!search && (
            <button
              type="button"
              onClick={onCreate}
              className="text-xs text-accent hover:underline mt-2"
            >
              Create your first workflow
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              onToggle={onToggle}
              onViewRuns={onViewRuns}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
  onDelete,
  onDuplicate,
  onEdit,
  onToggle,
  onViewRuns,
}: {
  workflow: WorkflowDef;
  onDelete: (id: string) => void;
  onDuplicate: (workflow: WorkflowDef) => void;
  onEdit: (workflow: WorkflowDef) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onViewRuns: (workflow: WorkflowDef) => void;
}) {
  const nodeCount = workflow.nodes.length;
  const edgeCount = workflow.edges.length;
  const triggerNode = workflow.nodes.find((node) => node.type === "trigger");
  const triggerType = String(triggerNode?.config?.triggerType ?? "manual");

  return (
    <div className="border border-border rounded-lg p-3 bg-surface/30 hover:bg-surface/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-medium truncate">{workflow.name}</h3>
          {workflow.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">
              {workflow.description}
            </p>
          )}
        </div>
        <label className="relative inline-flex items-center ml-2 shrink-0">
          <input
            type="checkbox"
            checked={workflow.enabled}
            onChange={(e) => onToggle(workflow.id, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-border rounded-full peer-checked:bg-accent transition-colors cursor-pointer after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-transform peer-checked:after:translate-x-4" />
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
          {triggerType}
        </span>
        <span>{nodeCount} nodes</span>
        <span>{edgeCount} edges</span>
        <span>v{workflow.version}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(workflow)}
          className="text-xs px-2 py-1 rounded bg-accent/10 hover:bg-accent/20 text-accent"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onViewRuns(workflow)}
          className="text-xs px-2 py-1 rounded bg-surface hover:bg-surface/80 text-muted"
        >
          Runs
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(workflow)}
          className="p-1 rounded hover:bg-surface text-muted"
          title="Duplicate"
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(workflow.id)}
          className="p-1 rounded hover:bg-red-500/10 text-red-400 ml-auto"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
