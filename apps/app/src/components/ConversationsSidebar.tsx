/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { ConversationListItem } from "./conversations/ConversationListItem";

type ConversationsSidebarVariant = "default" | "game-modal";

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  variant?: ConversationsSidebarVariant;
}

export function ConversationsSidebar({
  mobile = false,
  onClose,
  variant = "default",
}: ConversationsSidebarProps) {
  const {
    conversations,
    activeConversationId,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    t,
  } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const handleConfirmDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await handleDeleteConversation(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId((current) => (current === id ? null : current));
    }
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

  const isGameModal = variant === "game-modal";

  return (
    <aside
      className={
        isGameModal
          ? "flex flex-col h-full bg-black/20 backdrop-blur-md"
          : `${mobile ? "w-full min-w-0 h-full" : "w-48 min-w-48 xl:w-60 xl:min-w-60 border-r"} border-border bg-bg flex flex-col overflow-y-auto text-[13px]`
      }
      data-testid="conversations-sidebar"
      data-variant={variant}
    >
      {/* Mobile header with close button */}
      {!isGameModal && mobile && (
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted">
            {t("conversations.chats")}
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 border border-border bg-card text-sm text-muted cursor-pointer hover:border-accent hover:text-accent transition-colors"
            onClick={onClose}
            aria-label={t("conversations.closePanel")}
          >
            {t("conversationssidebar.Times")}
          </button>
        </div>
      )}

      <div
        className={
          isGameModal
            ? "p-3 border-b border-white/10 shrink-0"
            : "p-3 border-b border-border"
        }
      >
        <button
          type="button"
          className={
            isGameModal
              ? "w-full py-2 px-3 rounded-lg border border-accent/60 bg-accent/10 text-accent font-medium text-sm transition-all hover:bg-accent/20 hover:border-accent hover:shadow-[0_0_15px_rgba(240,178,50,0.15)] active:scale-[0.98]"
              : "w-full px-3 py-1.5 border border-accent rounded-md bg-transparent text-accent text-[12px] font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-fg"
          }
          onClick={() => {
            handleNewConversation();
            onClose?.();
          }}
        >
          {t("conversations.newChat")}
        </button>
      </div>

      <div
        className={
          isGameModal
            ? "flex-1 overflow-y-auto p-2 space-y-1 min-h-0 custom-scrollbar"
            : "flex-1 overflow-y-auto py-1"
        }
      >
        {sortedConversations.length === 0 ? (
          <div
            className={
              isGameModal
                ? "py-8 text-center text-white/40 text-sm font-medium italic"
                : "px-3 py-6 text-center text-muted text-xs"
            }
          >
            {t("conversations.none")}
          </div>
        ) : (
          sortedConversations.map((conv) => (
            <ConversationListItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConversationId}
              isEditing={editingId === conv.id}
              isUnread={unreadConversations.has(conv.id)}
              isGameModal={isGameModal}
              editingTitle={editingTitle}
              confirmDeleteId={confirmDeleteId}
              deletingId={deletingId}
              inputRef={inputRef}
              t={t}
              onSelect={(id) => {
                setConfirmDeleteId(null);
                void handleSelectConversation(id);
                onClose?.();
              }}
              onDoubleClick={handleDoubleClick}
              onEditingTitleChange={setEditingTitle}
              onEditSubmit={(id) => void handleEditSubmit(id)}
              onEditKeyDown={handleEditKeyDown}
              onDelete={(id) => void handleDeleteConversation(id)}
              onConfirmDelete={(id) => void handleConfirmDelete(id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onSetConfirmDelete={setConfirmDeleteId}
            />
          ))
        )}
      </div>
    </aside>
  );
}
