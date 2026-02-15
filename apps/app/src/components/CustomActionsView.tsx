import { useState, useEffect, useCallback } from "react";
import { client, type CustomActionDef } from "../api-client";
import { CustomActionEditor } from "./CustomActionEditor";

export function CustomActionsView() {
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CustomActionDef | null>(null);
  const [loading, setLoading] = useState(true);

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.listCustomActions();
      setActions(result);
    } catch (error) {
      console.error("Failed to load custom actions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleCreate = useCallback(() => {
    setEditingAction(null);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback((action: CustomActionDef) => {
    setEditingAction(action);
    setEditorOpen(true);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false);
    setEditingAction(null);
  }, []);

  const handleEditorSave = useCallback(async () => {
    setEditorOpen(false);
    setEditingAction(null);
    await loadActions();
  }, [loadActions]);

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    try {
      await client.updateCustomAction(id, { enabled });
      setActions(prev =>
        prev.map(action =>
          action.id === id ? { ...action, enabled } : action
        )
      );
    } catch (error) {
      console.error("Failed to toggle action:", error);
    }
  }, []);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await client.deleteCustomAction(id);
      setActions(prev => prev.filter(action => action.id !== id));
    } catch (error) {
      console.error("Failed to delete action:", error);
    }
  }, []);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const actionsToImport = Array.isArray(imported) ? imported : [imported];

      for (const action of actionsToImport) {
        await client.createCustomAction(action);
      }

      await loadActions();
      event.target.value = "";
    } catch (error) {
      console.error("Failed to import actions:", error);
      alert("Failed to import actions. Please check the file format.");
    }
  }, [loadActions]);

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(actions, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "custom-actions.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [actions]);

  const filteredActions = actions.filter(action => {
    const searchLower = search.toLowerCase();
    return (
      action.name.toLowerCase().includes(searchLower) ||
      action.description?.toLowerCase().includes(searchLower)
    );
  });

  const getBadgeColor = (handlerType: string) => {
    switch (handlerType) {
      case "http":
        return "bg-blue-500/20 text-blue-400";
      case "shell":
        return "bg-green-500/20 text-green-400";
      case "code":
        return "bg-purple-500/20 text-purple-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted">Loading actions...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-txt">Custom Actions</h1>
        <div className="flex items-center gap-2">
          <label className="px-3 py-1.5 text-sm border border-border bg-surface text-muted rounded cursor-pointer hover:bg-card transition-colors">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExport}
            disabled={actions.length === 0}
            className="px-3 py-1.5 text-sm border border-border bg-surface text-muted rounded hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-sm border border-accent bg-accent text-txt rounded hover:bg-accent/80 transition-colors"
          >
            Create Action
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center">
        <input
          type="text"
          placeholder="Search actions by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-border bg-surface text-txt rounded focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Actions Grid */}
      {filteredActions.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 space-y-4">
          <p className="text-muted text-center">
            {search
              ? "No actions match your search."
              : "No custom actions yet. Create one to get started."}
          </p>
          {!search && (
            <button
              onClick={handleCreate}
              className="px-4 py-2 text-sm border border-accent bg-accent text-txt rounded hover:bg-accent/80 transition-colors"
            >
              Create Action
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-auto">
          {filteredActions.map((action) => (
            <div
              key={action.id}
              onClick={(e) => {
                // Don't open editor if clicking on interactive elements
                if (
                  e.target instanceof HTMLButtonElement ||
                  e.target instanceof HTMLInputElement
                ) {
                  return;
                }
                handleEdit(action);
              }}
              className="border border-border bg-card rounded p-4 space-y-3 cursor-pointer hover:border-accent/50 transition-colors"
            >
              {/* Name and Badge */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-txt flex-1 break-words">
                  {action.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${getBadgeColor(
                    action.handler.type
                  )}`}
                >
                  {action.handler.type}
                </span>
              </div>

              {/* Description */}
              {action.description && (
                <p className="text-xs text-muted line-clamp-3">
                  {action.description}
                </p>
              )}

              {/* Parameters Count */}
              <p className="text-xs text-muted">
                {action.parameters?.length || 0} parameter
                {action.parameters?.length === 1 ? "" : "s"}
              </p>

              {/* Actions Row */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(e) =>
                      handleToggleEnabled(action.id, e.target.checked)
                    }
                    className="cursor-pointer"
                  />
                  <span className="text-xs text-muted">Enabled</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(action);
                    }}
                    className="px-2 py-1 text-xs border border-border bg-surface text-muted rounded hover:bg-card transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(action.id, action.name);
                    }}
                    className="px-2 py-1 text-xs border border-border bg-surface text-danger rounded hover:bg-card transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <CustomActionEditor
          open={editorOpen}
          action={editingAction}
          onClose={handleEditorClose}
          onSave={handleEditorSave}
        />
      )}
    </div>
  );
}
