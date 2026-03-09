/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { type AgentSelfStatusSnapshot, client } from "../api-client";
import { SELF_STATUS_SYNC_EVENT } from "../events";
import { createTranslator } from "../i18n";
import { ConversationListItem } from "./conversations/ConversationListItem";
import { GameModalFooter } from "./conversations/GameModalFooter";

export type ConversationsSidebarVariant = "default" | "game-modal";

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
    agentStatus,
    chatLastUsage,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    uiLanguage,
  } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selfStatus, setSelfStatus] = useState<AgentSelfStatusSnapshot | null>(
    null,
  );
  const [selfStatusLoading, setSelfStatusLoading] = useState(false);
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

  // Self-status polling for game-modal variant
  useEffect(() => {
    if (!isGameModal) return;

    let cancelled = false;
    let firstLoad = true;

    const syncSelfStatus = async () => {
      if (firstLoad) {
        setSelfStatusLoading(true);
      }
      try {
        const snapshot = await client.getAgentSelfStatus();
        if (cancelled) return;
        setSelfStatus(snapshot);
      } catch {
        if (cancelled) return;
        setSelfStatus(null);
      } finally {
        if (!cancelled && firstLoad) {
          setSelfStatusLoading(false);
        }
        firstLoad = false;
      }
    };

    void syncSelfStatus();
    const onSelfStatusRefresh = () => {
      void syncSelfStatus();
    };
    const unbindStatus = client.onWsEvent("status", () => {
      void syncSelfStatus();
    });
    const unbindWsReconnected = client.onWsEvent("ws-reconnected", () => {
      void syncSelfStatus();
    });
    window.addEventListener(SELF_STATUS_SYNC_EVENT, onSelfStatusRefresh);

    return () => {
      cancelled = true;
      unbindStatus();
      unbindWsReconnected();
      window.removeEventListener(SELF_STATUS_SYNC_EVENT, onSelfStatusRefresh);
    };
  }, [isGameModal]);

  return (
    <aside
      className={
        isGameModal
          ? "chat-game-sidebar-root"
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
            &times;
          </button>
        </div>
      )}

      <div
        className={
          isGameModal ? "chat-game-sidebar-head" : "p-3 border-b border-border"
        }
      >
        <button
          type="button"
          className={
            isGameModal
              ? "chat-game-new-chat-btn"
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
          isGameModal ? "chat-game-sidebar-list" : "flex-1 overflow-y-auto py-1"
        }
      >
        {sortedConversations.length === 0 ? (
          <div
            className={
              isGameModal
                ? "chat-game-sidebar-empty"
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

      {/* Game-modal footer: AI provider, capabilities, token usage */}
      {isGameModal && (
        <GameModalFooter
          selfStatus={selfStatus}
          selfStatusLoading={selfStatusLoading}
          agentStatusModel={agentStatus?.model}
          chatLastUsage={chatLastUsage}
          t={t}
        />
      )}
    </aside>
  );
}
