/**
 * A single conversation row in the sidebar list.
 */

import type React from "react";
import { getVrmPreviewUrl } from "../../AppContext";
import {
  avatarIndexFromConversationId,
  formatRelativeTime,
} from "./conversation-utils";

interface ConversationListItemProps {
  conv: { id: string; title: string; updatedAt: string };
  isActive: boolean;
  isEditing: boolean;
  isUnread: boolean;
  isGameModal: boolean;
  editingTitle: string;
  confirmDeleteId: string | null;
  deletingId: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  t: (
    key: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ) => string;
  onSelect: (id: string) => void;
  onDoubleClick: (conv: { id: string; title: string }) => void;
  onEditingTitleChange: (value: string) => void;
  onEditSubmit: (id: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, id: string) => void;
  onDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onSetConfirmDelete: (id: string) => void;
}

export function ConversationListItem({
  conv,
  isActive,
  isEditing,
  isUnread,
  isGameModal,
  editingTitle,
  confirmDeleteId,
  deletingId,
  inputRef,
  t,
  onSelect,
  onDoubleClick,
  onEditingTitleChange,
  onEditSubmit,
  onEditKeyDown,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onSetConfirmDelete,
}: ConversationListItemProps) {
  const avatarSrc = getVrmPreviewUrl(avatarIndexFromConversationId(conv.id));
  const fallbackInitial = conv.title.trim().charAt(0).toUpperCase() || "#";

  return (
    <div
      key={conv.id}
      data-testid="conv-item"
      data-active={isActive || undefined}
      className={`${
        isGameModal
          ? "chat-game-conv-item"
          : "flex items-center px-3 py-2 gap-2 cursor-pointer transition-colors border-l-[3px]"
      } ${
        isActive
          ? isGameModal
            ? "is-active"
            : "bg-bg-hover border-l-accent"
          : isGameModal
            ? ""
            : "border-l-transparent hover:bg-bg-hover"
      } group`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="w-full px-1.5 py-1 border border-accent rounded bg-card text-txt text-[13px] outline-none"
          value={editingTitle}
          onChange={(e) => onEditingTitleChange(e.target.value)}
          onBlur={() => void onEditSubmit(conv.id)}
          onKeyDown={(e) => onEditKeyDown(e, conv.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <button
            type="button"
            className={
              isGameModal
                ? "chat-game-conv-select-btn"
                : "flex items-center gap-2 flex-1 min-w-0 bg-transparent border-0 p-0 m-0 text-left cursor-pointer"
            }
            onClick={() => onSelect(conv.id)}
            onDoubleClick={() => onDoubleClick(conv)}
          >
            {isUnread && (
              <span
                className={
                  isGameModal
                    ? "chat-game-conv-unread"
                    : "w-2 h-2 rounded-full bg-accent shrink-0"
                }
              />
            )}
            {isGameModal && (
              <div className="chat-game-conv-avatar">
                <img
                  src={avatarSrc}
                  alt={conv.title}
                  className="chat-game-conv-avatar-img"
                />
                <span className="chat-game-conv-avatar-initial">
                  {fallbackInitial}
                </span>
              </div>
            )}
            <div
              className={isGameModal ? "chat-game-conv-body" : "flex-1 min-w-0"}
            >
              <div
                className={
                  isGameModal
                    ? "chat-game-conv-title"
                    : "font-medium truncate text-txt"
                }
              >
                {conv.title}
              </div>
              <div
                className={
                  isGameModal
                    ? "chat-game-conv-time"
                    : "text-[11px] text-muted mt-0.5"
                }
              >
                {formatRelativeTime(conv.updatedAt, t)}
              </div>
            </div>
          </button>

          {/* Rename button (game-modal always visible, default on hover) */}
          <button
            type="button"
            className={
              isGameModal
                ? "chat-game-conv-action"
                : "opacity-0 group-hover:opacity-100 transition-opacity border-none bg-transparent text-muted hover:text-accent cursor-pointer text-sm px-1 py-0.5 rounded flex-shrink-0"
            }
            onClick={(e) => {
              e.stopPropagation();
              onDoubleClick(conv);
            }}
            title={t("conversations.rename")}
          >
            &#x270E;
          </button>

          {/* Delete with confirm (default variant) or direct delete (game-modal) */}
          {isGameModal ? (
            <button
              type="button"
              data-testid="conv-delete"
              className="chat-game-conv-action chat-game-conv-action-danger"
              onClick={(e) => {
                e.stopPropagation();
                void onDelete(conv.id);
              }}
              title={t("conversations.delete")}
            >
              &times;
            </button>
          ) : confirmDeleteId === conv.id ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-danger">
                {t("conversations.deleteConfirm")}
              </span>
              <button
                type="button"
                className="px-1.5 py-0.5 text-[10px] border border-danger bg-danger text-white cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void onConfirmDelete(conv.id)}
                disabled={deletingId === conv.id}
              >
                {deletingId === conv.id ? "..." : t("conversations.deleteYes")}
              </button>
              <button
                type="button"
                className="px-1.5 py-0.5 text-[10px] border border-border bg-card text-muted cursor-pointer hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onCancelDelete()}
                disabled={deletingId === conv.id}
              >
                {t("conversations.deleteNo")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="conv-delete"
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity border-none bg-transparent text-muted hover:text-danger hover:bg-destructive-subtle cursor-pointer text-sm px-1 py-0.5 rounded flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onSetConfirmDelete(conv.id);
              }}
              title={t("conversations.delete")}
            >
              &times;
            </button>
          )}
        </>
      )}
    </div>
  );
}
