import { useEffect, useMemo, useState } from "react";
import { client, type CustomActionDef } from "../api-client";

interface CustomActionsPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenEditor: (action?: CustomActionDef | null) => void;
}

const HANDLER_TYPE_COLORS: Record<string, string> = {
  http: "bg-blue-500/20 text-blue-400",
  shell: "bg-green-500/20 text-green-400",
  code: "bg-purple-500/20 text-purple-400",
};

const HANDLER_TYPE_NAMES: Record<string, string> = {
  http: "HTTP",
  shell: "Shell",
  code: "Code",
};

export function CustomActionsPanel({
  open,
  onClose,
  onOpenEditor,
}: CustomActionsPanelProps) {
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadActions = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await client.listCustomActions();
      setActions(result || []);
    } catch (err) {
      console.error("Failed to load custom actions:", err);
      setError("Failed to load custom actions. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadActions();
    }
  }, [open]);

  const filteredActions = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    if (!searchTerm) return actions;

    return actions.filter((action) => {
      const hasName = action.name.toLowerCase().includes(searchTerm);
      const hasDescription =
        typeof action.description === "string" &&
        action.description.toLowerCase().includes(searchTerm);
      const hasAlias =
        (action.similes ?? []).some((alias) =>
          alias.toLowerCase().includes(searchTerm),
        );
      return hasName || hasDescription || hasAlias;
    });
  }, [actions, search]);

  const enabledCount = useMemo(
    () => actions.filter((action) => action.enabled).length,
    [actions],
  );

  const handleToggleEnabled = async (action: CustomActionDef) => {
    try {
      const next = !action.enabled;
      await client.updateCustomAction(action.id, {
        enabled: next,
      });
      setActions((prev) =>
        prev.map((item) =>
          item.id === action.id
            ? {
                ...item,
                enabled: next,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to toggle action:", err);
      setError("Failed to update this action. Try again.");
    }
  };

  const handleDelete = async (action: CustomActionDef) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${action.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await client.deleteCustomAction(action.id);
      setActions((prev) => prev.filter((item) => item.id !== action.id));
    } catch (err) {
      console.error("Failed to delete action:", err);
      setError("Failed to delete action. Try again.");
    }
  };

  const handleEdit = (action: CustomActionDef) => {
    onOpenEditor(action);
  };

  const handleCreate = () => {
    onOpenEditor(null);
  };

  return (
    <div
      className={`border-l border-border bg-card flex flex-col transition-all duration-200 ${
        open ? "w-80" : "w-0 overflow-hidden"
      }`}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-txt">Custom Actions</h2>
              <p className="text-xs text-muted mt-0.5">
                {actions.length} action{actions.length === 1 ? "" : "s"} · {enabledCount} enabled
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-txt transition-colors"
              aria-label="Close panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 4L4 12M4 4l8 8" />
              </svg>
            </button>
          </div>

          <div className="space-y-3 p-3 border-b border-border">
            <button
              onClick={handleCreate}
              className="w-full bg-accent text-txt hover:bg-accent/90 transition-colors rounded px-3 py-2 text-sm font-medium"
            >
              + New Custom Action
            </button>

            <div className="relative">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, description, alias..."
                className="w-full bg-surface border border-border px-2 py-1.5 text-xs text-txt placeholder:text-muted/50 outline-none focus:border-accent"
              />
            </div>

            {error && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/30 px-2 py-1 rounded">
                {error}
              </div>
            )}
          </div>

          {/* Action List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="text-center text-muted text-xs py-8">
                Loading your actions...
              </div>
            ) : filteredActions.length === 0 ? (
              <div className="text-center text-muted text-xs py-8">
                {search
                  ? "No actions match this search."
                  : "No custom actions yet. Create one to get started."}
              </div>
            ) : (
              filteredActions.map((action) => (
                <div
                  key={action.id}
                  className="border border-border bg-surface rounded p-2 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-txt truncate">
                        {action.name}
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">
                        {action.parameters?.length || 0} parameter
                        {(action.parameters?.length || 0) === 1 ? "" : "s"}
                        {action.similes?.length ?
                          ` • ${action.similes.length} alias`
                            .concat(action.similes.length === 1 ? "" : "es") :
                          ""
                        }
                      </p>
                    </div>

                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                        HANDLER_TYPE_COLORS[action.handler.type] ||
                        "bg-surface text-muted"
                      }`}
                    >
                      {HANDLER_TYPE_NAMES[action.handler.type] ?? action.handler.type}
                    </span>
                  </div>

                  {action.description && (
                    <p className="text-xs text-muted line-clamp-2 break-words">
                      {action.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <label className="flex items-center gap-1 cursor-pointer text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={() => handleToggleEnabled(action)}
                        className="w-3 h-3 cursor-pointer accent-accent"
                      />
                      <span>Enabled</span>
                    </label>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(action)}
                        className="text-xs text-accent hover:text-accent/80 transition-colors"
                        title="Edit action"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(action)}
                        className="text-xs text-danger hover:text-danger/80 transition-colors"
                        title="Delete action"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
