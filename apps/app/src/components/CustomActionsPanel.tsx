import { useEffect, useState } from "react";
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

export function CustomActionsPanel({
  open,
  onClose,
  onOpenEditor,
}: CustomActionsPanelProps) {
  const [actions, setActions] = useState<CustomActionDef[]>([]);
  const [loading, setLoading] = useState(false);

  const loadActions = async () => {
    try {
      setLoading(true);
      const result = await client.listCustomActions();
      setActions(result || []);
    } catch (error) {
      console.error("Failed to load custom actions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadActions();
    }
  }, [open]);

  const handleToggleEnabled = async (action: CustomActionDef) => {
    try {
      await client.updateCustomAction(action.id, {
        enabled: !action.enabled,
      });
      await loadActions();
    } catch (error) {
      console.error("Failed to toggle action:", error);
    }
  };

  const handleDelete = async (action: CustomActionDef) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${action.name}"?`
    );
    if (!confirmed) return;

    try {
      await client.deleteCustomAction(action.id);
      await loadActions();
    } catch (error) {
      console.error("Failed to delete action:", error);
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
        open ? "w-72" : "w-0 overflow-hidden"
      }`}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-txt">Custom Actions</h2>
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

          {/* Action List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="text-center text-muted text-xs py-8">
                Loading...
              </div>
            ) : actions.length === 0 ? (
              <div className="text-center text-muted text-xs py-8">
                No custom actions yet
              </div>
            ) : (
              actions.map((action) => (
                <div
                  key={action.id}
                  className="border border-border bg-surface rounded p-2 space-y-2"
                >
                  {/* Action Name */}
                  <div className="font-semibold text-xs text-txt truncate">
                    {action.name}
                  </div>

                  {/* Description */}
                  {action.description && (
                    <div className="text-xs text-muted line-clamp-2">
                      {action.description}
                    </div>
                  )}

                  {/* Bottom Row: Badge, Toggle, Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Handler Type Badge */}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        HANDLER_TYPE_COLORS[action.handler.type] ||
                        "bg-surface text-muted"
                      }`}
                    >
                      {action.handler.type}
                    </span>

                    <div className="flex-1" />

                    {/* Enabled Toggle */}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={() => handleToggleEnabled(action)}
                        className="w-3 h-3 cursor-pointer accent-accent"
                      />
                      <span className="text-xs text-muted">on</span>
                    </label>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(action)}
                      className="text-xs text-accent hover:text-accent/80 transition-colors"
                      title="Edit action"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" />
                      </svg>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(action)}
                      className="text-xs text-danger hover:text-danger/80 transition-colors"
                      title="Delete action"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 9h6l1-9" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border">
            <button
              onClick={handleCreate}
              className="w-full bg-accent text-txt hover:bg-accent/90 transition-colors rounded px-3 py-2 text-sm font-medium"
            >
              Create Action
            </button>
          </div>
        </>
      )}
    </div>
  );
}
