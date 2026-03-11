/**
 * A single conversation row in the sidebar list.
 */

import type React from "react";
import {
  formatRelativeTime,
  getLocalizedConversationTitle,
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

import { Button, Input } from "@milady/ui";
import { Edit2, Trash2 } from "lucide-react";

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
  return (
    <div
      key={conv.id}
      data-testid="conv-item"
      data-active={isActive || undefined}
      className={`${
        isGameModal
          ? "group relative flex items-center gap-3 w-full p-2.5 rounded-xl cursor-pointer transition-all border border-transparent"
          : "flex items-center px-3 py-2 gap-2 cursor-pointer transition-colors border-l-[3px]"
      } ${
        isActive
          ? isGameModal
            ? "bg-accent/15 border-accent/30 shadow-[0_0_15px_rgba(240,178,50,0.1)]"
            : "bg-bg-hover border-l-accent"
          : isGameModal
            ? "hover:bg-white/5 hover:border-white/10"
            : "border-l-transparent hover:bg-bg-hover"
      }`}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          className="w-full h-8 px-1.5 border-accent bg-card text-txt text-[13px] shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
          value={editingTitle}
          onChange={(e) => onEditingTitleChange(e.target.value)}
          onBlur={() => void onEditSubmit(conv.id)}
          onKeyDown={(e) => onEditKeyDown(e, conv.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className={
              isGameModal
                ? "flex flex-col flex-1 min-w-0 text-left cursor-pointer h-auto p-0 rounded-none bg-transparent border-none"
                : "flex items-center gap-2 flex-1 min-w-0 bg-transparent border-0 p-0 m-0 text-left h-auto cursor-pointer rounded-none"
            }
            onClick={() => onSelect(conv.id)}
            onDoubleClick={() => onDoubleClick(conv)}
          >
            {isUnread && (
              <span
                className={
                  isGameModal
                    ? "absolute top-3 left-3 w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(240,178,50,0.8)]"
                    : "w-2 h-2 rounded-full bg-accent shrink-0"
                }
              />
            )}

            <div
              className={
                isGameModal
                  ? "flex-1 min-w-0 flex flex-col gap-1 w-full"
                  : "flex-1 min-w-0"
              }
            >
              <span
                className={
                  isGameModal
                    ? `text-[13px] font-medium truncate leading-tight transition-colors ${isActive ? "text-accent text-shadow-glow" : "text-white/90 group-hover:text-white"}`
                    : "font-medium truncate text-txt"
                }
              >
                {getLocalizedConversationTitle(conv.title, t)}
              </span>
              <span
                className={
                  isGameModal
                    ? "text-[11px] text-white/40 truncate"
                    : "text-[11px] text-muted mt-0.5"
                }
              >
                {formatRelativeTime(conv.updatedAt, t)}
              </span>
            </div>
          </Button>

          {/* Rename button (game-modal always visible, default on hover) */}
          <Button
            variant="ghost"
            size="icon"
            className={
              isGameModal
                ? `flex items-center justify-center w-7 h-7 rounded-lg bg-transparent text-white/40 opacity-0 group-hover:opacity-100 transition-all cursor-pointer hover:bg-white/10 hover:text-white`
                : "opacity-0 group-hover:opacity-100 h-7 w-7 text-muted hover:text-accent"
            }
            onClick={(e) => {
              e.stopPropagation();
              onDoubleClick(conv);
            }}
            title={t("conversations.rename")}
          >
            {isGameModal ? <Edit2 className="w-3.5 h-3.5" /> : "\u270E"}
          </Button>

          {/* Delete with confirm (default variant) or direct delete (game-modal) */}
          {isGameModal ? (
            <Button
              variant="ghost"
              size="icon"
              data-testid="conv-delete"
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-transparent text-white/40 opacity-0 group-hover:opacity-100 transition-all hover:bg-danger/20 hover:text-danger"
              onClick={(e) => {
                e.stopPropagation();
                void onDelete(conv.id);
              }}
              title={t("conversations.delete")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : confirmDeleteId === conv.id ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-danger">
                {t("conversations.deleteConfirm")}
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-1.5 py-0.5 text-[10px] text-white shadow-sm disabled:opacity-50"
                onClick={() => void onConfirmDelete(conv.id)}
                disabled={deletingId === conv.id}
              >
                {deletingId === conv.id ? "..." : t("conversations.deleteYes")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 py-0.5 text-[10px] text-muted shadow-sm hover:border-accent hover:text-accent disabled:opacity-50"
                onClick={() => onCancelDelete()}
                disabled={deletingId === conv.id}
              >
                {t("conversations.deleteNo")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              data-testid="conv-delete"
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 h-7 w-7 text-muted hover:text-danger hover:bg-destructive-subtle"
              onClick={(e) => {
                e.stopPropagation();
                onSetConfirmDelete(conv.id);
              }}
              title={t("conversations.delete")}
            >
              {t("conversationlistitem.Times")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
