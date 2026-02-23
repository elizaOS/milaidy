/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useState, useRef, useEffect } from "react";
import { getVrmPreviewUrl, useApp, VRM_COUNT } from "../AppContext.js";
import { client } from "../api-client.js";
import { createTranslator } from "../i18n";

export type ConversationsSidebarVariant = "default" | "game-modal";

interface ConversationsSidebarProps {
  variant?: ConversationsSidebarVariant;
}

function formatRelativeTime(
  dateString: string,
  t: (key: string, vars?: Record<string, string | number | boolean | null | undefined>) => string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("conversations.justNow");
  if (diffMins < 60) return t("conversations.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("conversations.hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("conversations.daysAgo", { count: diffDays });

  return date.toLocaleDateString();
}

function avatarIndexFromConversationId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) % VRM_COUNT;
  return normalized + 1;
}

function resolveProviderLabel(model: string | undefined): string {
  const value = (model ?? "").trim();
  if (!value) return "N/A";

  const lower = value.toLowerCase();
  const knownProviders: Array<{ match: string; label: string }> = [
    { match: "elizacloud", label: "Eliza Cloud" },
    { match: "openrouter", label: "OpenRouter" },
    { match: "openai", label: "OpenAI" },
    { match: "anthropic", label: "Anthropic" },
    { match: "gemini", label: "Google" },
    { match: "google", label: "Google" },
    { match: "grok", label: "xAI" },
    { match: "xai", label: "xAI" },
    { match: "groq", label: "Groq" },
    { match: "ollama", label: "Ollama" },
    { match: "deepseek", label: "DeepSeek" },
    { match: "mistral", label: "Mistral" },
    { match: "together", label: "Together AI" },
    { match: "zai", label: "z.ai" },
    { match: "cohere", label: "Cohere" },
    { match: "pi-ai", label: "Pi AI" },
  ];
  for (const provider of knownProviders) {
    if (lower.includes(provider.match)) return provider.label;
  }

  if (lower.startsWith("gpt")) return "OpenAI";
  if (lower.startsWith("claude")) return "Anthropic";
  if (lower.startsWith("gemini")) return "Google";

  const splitToken = value.split(/[/:|]/)[0]?.trim();
  if (splitToken) return splitToken.toUpperCase();
  return "N/A";
}

function estimateTokenCost(
  promptTokens: number,
  completionTokens: number,
  model: string | undefined,
): string {
  const normalizedModel = (model ?? "").toLowerCase();
  const pricingByMillion: Record<string, [number, number]> = {
    "gpt-5": [1.25, 10.0],
    "gpt-4.1": [2.0, 8.0],
    "gpt-4o": [2.5, 10.0],
    "gpt-4": [30.0, 60.0],
    "claude-4": [15.0, 75.0],
    "claude-3.7": [3.0, 15.0],
    "claude-3.5": [3.0, 15.0],
    "gemini-2.5-pro": [1.25, 10.0],
    "gemini-2.0-flash": [0.1, 0.4],
    "deepseek": [0.55, 2.19],
    "qwen": [0.35, 1.4],
    "kimi": [0.2, 0.8],
    "moonshot": [0.2, 0.8],
  };

  let inputCostPerMillion = 1.0;
  let outputCostPerMillion = 3.0;
  for (const [key, [inCost, outCost]] of Object.entries(pricingByMillion)) {
    if (normalizedModel.includes(key)) {
      inputCostPerMillion = inCost;
      outputCostPerMillion = outCost;
      break;
    }
  }

  const estimated =
    (promptTokens / 1_000_000) * inputCostPerMillion +
    (completionTokens / 1_000_000) * outputCostPerMillion;
  if (estimated <= 0) return "$0.0000";
  if (estimated < 0.0001) return "<$0.0001";
  if (estimated < 0.01) return `~$${estimated.toFixed(4)}`;
  return `~$${estimated.toFixed(3)}`;
}

export function ConversationsSidebar({ variant = "default" }: ConversationsSidebarProps) {
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
  const t = createTranslator(uiLanguage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [runtimeModel, setRuntimeModel] = useState("");
  const [runtimeModelLoading, setRuntimeModelLoading] = useState(false);
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

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleEditSubmit(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleEditCancel();
    }
  };

  const isGameModal = variant === "game-modal";
  const statusModelLabel = (agentStatus?.model ?? "").trim();

  useEffect(() => {
    if (!isGameModal) return;
    if (statusModelLabel) {
      setRuntimeModel("");
      setRuntimeModelLoading(false);
      return;
    }

    let cancelled = false;
    setRuntimeModelLoading(true);
    void client
      .getRuntimeSnapshot({ depth: 1, maxArrayLength: 0, maxObjectEntries: 0, maxStringLength: 240 })
      .then((snapshot) => {
        if (cancelled) return;
        const runtimeModelValue = (snapshot.meta.model ?? "").trim();
        setRuntimeModel(runtimeModelValue);
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeModel("");
      })
      .finally(() => {
        if (!cancelled) setRuntimeModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isGameModal, statusModelLabel]);

  const modelLabel = (statusModelLabel || runtimeModel).trim();
  const providerLabel = modelLabel
    ? resolveProviderLabel(modelLabel)
    : runtimeModelLoading
      ? t("chat.modal.providerDetecting")
      : "N/A";
  const usageTotalLabel = chatLastUsage
    ? chatLastUsage.totalTokens.toLocaleString()
    : t("chat.modal.usageAwaiting");
  const usageBreakdownLabel = chatLastUsage
    ? `${chatLastUsage.promptTokens.toLocaleString()}↑ / ${chatLastUsage.completionTokens.toLocaleString()}↓`
    : "—";
  const usageCostLabel = chatLastUsage
    ? estimateTokenCost(
      chatLastUsage.promptTokens,
      chatLastUsage.completionTokens,
      chatLastUsage.model || modelLabel,
    )
    : "—";

  return (
    <aside
      className={
        isGameModal
          ? "chat-game-sidebar-root"
          : "w-60 min-w-60 border-r border-border bg-bg flex flex-col overflow-y-auto text-[13px]"
      }
      data-testid="conversations-sidebar"
      data-variant={variant}
    >
      <div className={isGameModal ? "chat-game-sidebar-head" : "p-3 border-b border-border"}>
        <button
          className={
            isGameModal
              ? "chat-game-new-chat-btn"
              : "w-full px-3 py-2 border border-border rounded-md bg-accent text-accent-fg text-[13px] font-medium cursor-pointer transition-opacity hover:opacity-90"
          }
          onClick={handleNewConversation}
        >
          {t("conversations.newChat")}
        </button>
      </div>

      <div className={isGameModal ? "chat-game-sidebar-list" : "flex-1 overflow-y-auto py-1"}>
        {sortedConversations.length === 0 ? (
          <div className={isGameModal ? "chat-game-sidebar-empty" : "px-3 py-6 text-center text-muted text-xs"}>{t("conversations.none")}</div>
        ) : (
          sortedConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;
            const avatarSrc = getVrmPreviewUrl(
              avatarIndexFromConversationId(conv.id),
            );
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
                onClick={() => {
                  if (!isEditing) {
                    void handleSelectConversation(conv.id);
                  }
                }}
                onDoubleClick={() => handleDoubleClick(conv)}
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
                    {unreadConversations.has(conv.id) && (
                      <span className={isGameModal ? "chat-game-conv-unread" : "w-2 h-2 rounded-full bg-accent shrink-0"} />
                    )}
                    {isGameModal && (
                      <div className="chat-game-conv-avatar">
                        <img
                          src={avatarSrc}
                          alt={conv.title}
                          className="chat-game-conv-avatar-img"
                        />
                        <span className="chat-game-conv-avatar-initial">{fallbackInitial}</span>
                      </div>
                    )}
                    <div className={isGameModal ? "chat-game-conv-body" : "flex-1 min-w-0"}>
                      <div className={isGameModal ? "chat-game-conv-title" : "font-medium truncate text-txt"}>{conv.title}</div>
                      <div className={isGameModal ? "chat-game-conv-time" : "text-[11px] text-muted mt-0.5"}>{formatRelativeTime(conv.updatedAt, t)}</div>
                    </div>
                    <button
                      className={
                        isGameModal
                          ? "chat-game-conv-action"
                          : "opacity-0 group-hover:opacity-100 transition-opacity border-none bg-transparent text-muted hover:text-accent cursor-pointer text-sm px-1 py-0.5 rounded flex-shrink-0"
                      }
                      onClick={(e) => { e.stopPropagation(); handleDoubleClick(conv); }}
                      title={t("conversations.rename")}
                    >✎</button>
                    <button
                      data-testid="conv-delete"
                      className={
                        isGameModal
                          ? "chat-game-conv-action chat-game-conv-action-danger"
                          : "opacity-30 group-hover:opacity-100 transition-opacity border-none bg-transparent text-muted hover:text-danger hover:bg-destructive-subtle cursor-pointer text-sm px-1 py-0.5 rounded flex-shrink-0"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteConversation(conv.id);
                      }}
                      title={t("conversations.delete")}
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

      {isGameModal && (
        <div className="chat-game-sidebar-footer" data-testid="chat-game-provider">
          <div className="chat-game-sidebar-footer-label">{t("chat.modal.aiProvider")}</div>
          <div className="chat-game-sidebar-footer-value">{providerLabel}</div>
          <div className="chat-game-sidebar-footer-model" title={modelLabel || undefined}>
            {modelLabel || t("chat.modal.providerUnknown")}
          </div>
          <div className="chat-game-sidebar-usage">
            <div className="chat-game-sidebar-footer-label">{t("chat.modal.tokenUsage")}</div>
            <div className="chat-game-sidebar-usage-total">{usageTotalLabel}</div>
            <div className="chat-game-sidebar-usage-breakdown">{usageBreakdownLabel}</div>
            <div className="chat-game-sidebar-usage-cost">
              {t("chat.modal.estimatedCost")}: {usageCostLabel}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
