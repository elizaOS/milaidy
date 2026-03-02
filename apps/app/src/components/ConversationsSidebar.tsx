/**
 * Conversations sidebar component — left sidebar with conversation list.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { getVrmPreviewUrl, useApp, VRM_COUNT } from "../AppContext";
import { client, type AgentSelfStatusSnapshot } from "../api-client";
import { createTranslator } from "../i18n";

export type ConversationsSidebarVariant = "default" | "game-modal";
export const SELF_STATUS_SYNC_EVENT = "milady:self-status-refresh";

const BROWSER_CAPABILITY_PLUGIN_IDS = new Set([
  "browser",
  "browserbase",
  "chrome-extension",
]);

const COMPUTER_CAPABILITY_PLUGIN_IDS = new Set([
  "computeruse",
  "computer-use",
]);

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
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
  if (!value) return "";

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
  return "";
}

function isNonChatModelLabel(model: string | undefined): boolean {
  const value = (model ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "text_embedding") return true;
  if (value === "text_large") return true;
  if (value === "text_small") return true;
  if (value.includes("text_embedding")) return true;
  if (value.includes("embedding")) return true;
  if (value.includes("text_large") || value.includes("text_small")) return true;
  if (/^text_[a-z0-9_]+$/.test(value)) return true;
  return false;
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
  const t = createTranslator(uiLanguage);

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
  const statusModelLabel = (agentStatus?.model ?? "").trim();

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
    const intervalId = window.setInterval(() => {
      void syncSelfStatus();
    }, 15000);
    window.addEventListener(SELF_STATUS_SYNC_EVENT, onSelfStatusRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(SELF_STATUS_SYNC_EVENT, onSelfStatusRefresh);
    };
  }, [isGameModal]);

  const selfModelLabel = (selfStatus?.model ?? "").trim();
  const observedModelLabelRaw = (chatLastUsage?.model ?? "").trim();
  const observedModelLabel = isNonChatModelLabel(observedModelLabelRaw)
    ? ""
    : observedModelLabelRaw;
  const configuredModelRaw = (selfModelLabel || statusModelLabel).trim();
  const configuredModelLabel = isNonChatModelLabel(configuredModelRaw)
    ? ""
    : configuredModelRaw;
  const modelLabel = (observedModelLabel || configuredModelLabel).trim();
  const modelProviderLabel = resolveProviderLabel(modelLabel);
  const providerLabel = modelProviderLabel
    ? modelProviderLabel
    : selfStatusLoading
      ? t("chat.modal.providerDetecting")
      : "N/A";
  const capabilityRows = useMemo(() => {
    const activePlugins = new Set(selfStatus?.plugins?.active ?? []);
    const hasBrowserPlugin = Array.from(BROWSER_CAPABILITY_PLUGIN_IDS).some((id) =>
      activePlugins.has(id),
    );
    const hasComputerPlugin = Array.from(COMPUTER_CAPABILITY_PLUGIN_IDS).some((id) =>
      activePlugins.has(id),
    );

    const tradeEnabled = Boolean(selfStatus?.capabilities?.canTrade);
    const autoTradeEnabled = Boolean(selfStatus?.capabilities?.canAutoTrade);
    const browserEnabled = Boolean(selfStatus?.capabilities?.canUseBrowser);
    const computerEnabled = Boolean(selfStatus?.capabilities?.canUseComputer);
    const terminalEnabled = Boolean(selfStatus?.capabilities?.canRunTerminal);

    const tradeHint = tradeEnabled
      ? null
      : t("chat.modal.capHintNeedsEvmWallet");
    const autoTradeHint = autoTradeEnabled
      ? null
      : !selfStatus?.wallet?.hasEvm
        ? t("chat.modal.capHintNeedsEvmWallet")
        : selfStatus.tradePermissionMode !== "agent-auto"
          ? t("chat.modal.capHintNeedsAgentTradeMode")
          : !selfStatus.wallet.localSignerAvailable
            ? t("chat.modal.capHintNeedsLocalSigner")
            : null;
    const browserHint = browserEnabled
      ? null
      : !hasBrowserPlugin
        ? t("chat.modal.capHintNeedsBrowserPlugin")
        : null;
    const computerHint = computerEnabled
      ? null
      : !hasComputerPlugin
        ? t("chat.modal.capHintNeedsComputerPlugin")
        : null;
    const terminalHint = terminalEnabled
      ? null
      : selfStatus?.automationMode !== "full"
        ? t("chat.modal.capHintNeedsFullAutomation")
        : selfStatus?.shellEnabled === false
          ? t("chat.modal.capHintEnableShell")
          : null;

    return [
      {
        key: "trade",
        label: t("chat.modal.capTrade"),
        enabled: tradeEnabled,
        hint: tradeHint,
      },
      {
        key: "autoTrade",
        label: t("chat.modal.capAutoTrade"),
        enabled: autoTradeEnabled,
        hint: autoTradeHint,
      },
      {
        key: "browser",
        label: t("chat.modal.capBrowser"),
        enabled: browserEnabled,
        hint: browserHint,
      },
      {
        key: "computer",
        label: t("chat.modal.capComputer"),
        enabled: computerEnabled,
        hint: computerHint,
      },
      {
        key: "terminal",
        label: t("chat.modal.capTerminal"),
        enabled: terminalEnabled,
        hint: terminalHint,
      },
    ] as const;
  }, [selfStatus, t]);
  const walletLabel =
    selfStatus?.wallet?.evmAddressShort ||
    selfStatus?.wallet?.solanaAddressShort ||
    t("chat.modal.walletUnknown");
  const usageTotalLabel = chatLastUsage
    ? chatLastUsage.totalTokens.toLocaleString()
    : t("chat.modal.usageAwaiting");
  const usageBreakdownLabel = chatLastUsage
    ? `${chatLastUsage.promptTokens.toLocaleString()}\u2191 / ${chatLastUsage.completionTokens.toLocaleString()}\u2193`
    : "\u2014";
  const usageCostLabel = chatLastUsage
    ? estimateTokenCost(
      chatLastUsage.promptTokens,
      chatLastUsage.completionTokens,
      observedModelLabel || modelLabel,
    )
    : "\u2014";

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

      <div className={isGameModal ? "chat-game-sidebar-head" : "p-3 border-b border-border"}>
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

      <div className={isGameModal ? "chat-game-sidebar-list" : "flex-1 overflow-y-auto py-1"}>
        {sortedConversations.length === 0 ? (
          <div className={isGameModal ? "chat-game-sidebar-empty" : "px-3 py-6 text-center text-muted text-xs"}>
            {t("conversations.none")}
          </div>
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
                      className={
                        isGameModal
                          ? "chat-game-conv-select-btn"
                          : "flex items-center gap-2 flex-1 min-w-0 bg-transparent border-0 p-0 m-0 text-left cursor-pointer"
                      }
                      onClick={() => {
                        setConfirmDeleteId(null);
                        void handleSelectConversation(conv.id);
                        onClose?.();
                      }}
                      onDoubleClick={() => handleDoubleClick(conv)}
                    >
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
                        <div className={isGameModal ? "chat-game-conv-title" : "font-medium truncate text-txt"}>
                          {conv.title}
                        </div>
                        <div className={isGameModal ? "chat-game-conv-time" : "text-[11px] text-muted mt-0.5"}>
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
                      onClick={(e) => { e.stopPropagation(); handleDoubleClick(conv); }}
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
                          void handleDeleteConversation(conv.id);
                        }}
                        title={t("conversations.delete")}
                      >
                        &times;
                      </button>
                    ) : confirmDeleteId === conv.id ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-danger">{t("conversations.deleteConfirm")}</span>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 text-[10px] border border-danger bg-danger text-white cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => void handleConfirmDelete(conv.id)}
                          disabled={deletingId === conv.id}
                        >
                          {deletingId === conv.id ? "..." : t("conversations.deleteYes")}
                        </button>
                        <button
                          type="button"
                          className="px-1.5 py-0.5 text-[10px] border border-border bg-card text-muted cursor-pointer hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setConfirmDeleteId(null)}
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
                          setConfirmDeleteId(conv.id);
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
          })
        )}
      </div>

      {/* Game-modal footer: AI provider, capabilities, token usage */}
      {isGameModal && (
        <div className="chat-game-sidebar-footer" data-testid="chat-game-provider">
          <div className="chat-game-sidebar-footer-label">{t("chat.modal.aiProvider")}</div>
          <div className="chat-game-sidebar-footer-value">{providerLabel}</div>
          <div className="chat-game-sidebar-footer-model" title={modelLabel || undefined}>
            {modelLabel || t("chat.modal.providerUnknown")}
          </div>
          <div className="chat-game-sidebar-capabilities">
            <div className="chat-game-sidebar-footer-label">{t("chat.modal.capabilities")}</div>
            <div className="chat-game-sidebar-cap-grid">
              {capabilityRows.map((row) => (
                <div className="chat-game-sidebar-cap-row" key={row.key}>
                  <div className="chat-game-sidebar-cap-main">
                    <span className="chat-game-sidebar-cap-name">{row.label}</span>
                    {row.hint && (
                      <span className="chat-game-sidebar-cap-hint">{row.hint}</span>
                    )}
                  </div>
                  <span
                    className={`chat-game-sidebar-cap-pill ${row.enabled ? "is-on" : "is-off"}`}
                  >
                    {row.enabled
                      ? t("chat.modal.capEnabled")
                      : t("chat.modal.capDisabled")}
                  </span>
                </div>
              ))}
            </div>
            {selfStatus && (
              <div className="chat-game-sidebar-cap-meta">
                <span>
                  {t("chat.modal.tradeMode")}: {selfStatus.tradePermissionMode}
                </span>
                <span>
                  {t("chat.modal.wallet")}: {walletLabel}
                </span>
              </div>
            )}
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
