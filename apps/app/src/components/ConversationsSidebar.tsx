/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function ConversationsSidebar({
  mobile = false,
  onClose,
}: ConversationsSidebarProps) {
  const {
    conversations,
    activeConversationId,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  const handleDoubleClick = (conv: { id: string; title: string }) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleEditSubmit = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== conversations.find((c) => c.id === id)?.title) {
      await handleRenameConversation(id, trimmed);
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleEditSubmit(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  };

  return (
    <aside
      className={`${mobile ? "w-full min-w-0 h-full" : "w-48 min-w-48 xl:w-60 xl:min-w-60 border-r"} border-border bg-bg flex flex-col overflow-y-auto text-[13px]`}
      data-testid="conversations-sidebar"
    >
      {mobile && (
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted">
            Chats
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 border border-border bg-card text-sm text-muted cursor-pointer hover:border-accent hover:text-accent transition-colors"
            onClick={onClose}
            aria-label="Close chats panel"
          >
            &times;
          </button>
        </div>
      )}
      <div className="p-3 border-b border-border">
        <button
          type="button"
          className="w-full px-3 py-1.5 border border-accent rounded-md bg-transparent text-accent text-[12px] font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-fg"
          onClick={() => {
            handleNewConversation();
            onClose?.();
          }}
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sortedConversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-muted text-xs">
            No conversations yet
          </div>
        ) : (
          sortedConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                data-testid="conv-item"
                data-active={isActive || undefined}
                className={`flex items-center px-3 py-2 gap-2 cursor-pointer transition-colors border-l-[3px] ${
                  isActive
                    ? "bg-bg-hover border-l-accent"
                    : "border-l-transparent hover:bg-bg-hover"
                } group`}
              >
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="w-full px-1.5 py-1 border border-accent rounded bg-card text-txt text-[13px] outline-none"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => void handleEditSubmit(conv.id)}
                    onKeyDown={(e) => handleEditKeyDown(e, conv.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 min-w-0 bg-transparent border-0 p-0 m-0 text-left cursor-pointer"
                      onClick={() => {
                        void handleSelectConversation(conv.id);
                        onClose?.();
                      }}
                      onDoubleClick={() => handleDoubleClick(conv)}
                    >
                      {unreadConversations.has(conv.id) && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-txt">
                          {conv.title}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {formatRelativeTime(conv.updatedAt)}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid="conv-delete"
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity border-none bg-transparent text-muted hover:text-danger hover:bg-destructive-subtle cursor-pointer text-sm px-1 py-0.5 rounded flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteConversation(conv.id);
                      }}
                      title="Delete conversation"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
