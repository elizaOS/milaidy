import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext.js";
import {
  client,
  type AgentAutomationMode,
  type TradePermissionMode,
} from "../api-client.js";
import { createTranslator } from "../i18n";
import { ChatView } from "./ChatView.js";
import { ConversationsSidebar } from "./ConversationsSidebar.js";

const CHAT_MODAL_NARROW_BREAKPOINT = 768;

function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth <= CHAT_MODAL_NARROW_BREAKPOINT
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(
      `(max-width: ${CHAT_MODAL_NARROW_BREAKPOINT}px)`,
    );
    const sync = () => {
      setIsNarrow(mediaQuery.matches);
    };
    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  return isNarrow;
}

export type ChatModalLayoutVariant = "full-overlay" | "companion-dock";

interface ChatModalViewProps {
  variant?: ChatModalLayoutVariant;
  onRequestClose?: () => void;
}

export function ChatModalView({
  variant = "full-overlay",
  onRequestClose,
}: ChatModalViewProps) {
  const {
    conversations,
    activeConversationId,
    chatMode,
    handleChatClear,
    setActionNotice,
    setState,
    setTab,
    uiLanguage,
  } = useApp();
  const t = createTranslator(uiLanguage);

  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [automationMode, setAutomationMode] = useState<AgentAutomationMode | null>(null);
  const [tradeMode, setTradeMode] = useState<TradePermissionMode | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [tradeSaving, setTradeSaving] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const isNarrow = useIsNarrowViewport();
  const isCompanionDock = variant === "companion-dock";

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      null,
    [activeConversationId, conversations],
  );

  useEffect(() => {
    if (!isNarrow) {
      setMobileSidebarOpen(false);
    }
  }, [isNarrow]);

  useEffect(() => {
    if (activeConversationId) {
      setMobileSidebarOpen(false);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (!moreOpen) return;
    if (
      typeof document === "undefined" ||
      typeof document.addEventListener !== "function"
    ) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current) return;
      const target = event.target as Node | null;
      if (target && !moreMenuRef.current.contains(target)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    let cancelled = false;
    setModeLoading(true);
    void Promise.all([
      client.getAgentAutomationMode(),
      client.getTradePermissionMode(),
    ])
      .then(([automationResult, tradeResult]) => {
        if (cancelled) return;
        setAutomationMode(automationResult.mode);
        setTradeMode(tradeResult.mode);
      })
      .catch(() => {
        if (cancelled) return;
        setAutomationMode(null);
        setTradeMode(null);
      })
      .finally(() => {
        if (!cancelled) setModeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moreOpen]);

  const handleBack = () => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    setTab("companion");
  };

  const automationModeLabel =
    automationMode === "full"
      ? t("permissions.mode.full")
      : automationMode === "connectors-only"
        ? t("permissions.mode.semi")
        : t("chat.modal.modeUnknown");

  const tradeModeLabel =
    tradeMode === "agent-auto"
      ? t("permissions.trade.agent")
      : tradeMode === "manual-local-key"
        ? t("permissions.trade.manual")
        : tradeMode === "user-sign-only"
          ? t("permissions.trade.userSign")
          : t("chat.modal.modeUnknown");

  const chatModeLabel =
    chatMode === "power"
      ? t("chat.modal.responseModePower")
      : t("chat.modal.responseModeSimple");

  const handleAutomationModeChange = useCallback(
    async (mode: AgentAutomationMode) => {
      if (modeLoading || automationSaving || mode === automationMode) return;
      setAutomationSaving(true);
      try {
        const result = await client.setAgentAutomationMode(mode);
        setAutomationMode(result.mode);
        if (result.mode === "full" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(t("chat.modal.responseModeAutoPower"), "info", 2400);
        }
        setActionNotice?.(
          result.mode === "full"
            ? t("permissions.automationModeSetFull")
            : t("permissions.automationModeSetConnectors"),
          "success",
          2200,
        );
      } catch (err) {
        setActionNotice?.(
          err instanceof Error ? err.message : t("permissions.updateAutomationFailed"),
          "error",
          3600,
        );
      } finally {
        setAutomationSaving(false);
      }
    },
    [automationMode, automationSaving, chatMode, modeLoading, setActionNotice, setState, t],
  );

  const handleTradeModeChange = useCallback(
    async (mode: TradePermissionMode) => {
      if (modeLoading || tradeSaving || mode === tradeMode) return;
      setTradeSaving(true);
      try {
        const result = await client.setTradePermissionMode(mode);
        setTradeMode(result.mode);
        if (result.mode === "agent-auto" && chatMode !== "power") {
          setState("chatMode", "power");
          setActionNotice?.(t("chat.modal.responseModeAutoPower"), "info", 2400);
        }
        const notice =
          result.mode === "agent-auto"
            ? t("permissions.tradeModeSetAgent")
            : result.mode === "manual-local-key"
              ? t("permissions.tradeModeSetManual")
              : t("permissions.tradeModeSetUser");
        setActionNotice?.(notice, "success", 2200);
      } catch (err) {
        setActionNotice?.(
          err instanceof Error ? err.message : t("permissions.updateTradeFailed"),
          "error",
          3600,
        );
      } finally {
        setTradeSaving(false);
      }
    },
    [chatMode, modeLoading, setActionNotice, setState, t, tradeMode, tradeSaving],
  );

  return (
    <div
      className={isCompanionDock ? "chat-game-dock" : "chat-game-overlay"}
      data-chat-game-overlay={!isCompanionDock || undefined}
      data-chat-game-dock={isCompanionDock || undefined}
    >
      <div
        className={`chat-game-shell anime-theme-scope ${isCompanionDock ? "chat-game-shell-docked" : ""}`}
        data-chat-game-shell
      >
        <header className="chat-game-header">
          <button
            type="button"
            className="chat-game-back-btn"
            onClick={handleBack}
            title={t("chat.modal.back")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <div className="chat-game-header-meta">
            <div className="chat-game-title">
              {activeConversation?.title ?? t("chat.modal.emptyConversation")}
            </div>
            <div className="chat-game-subtitle">
              {t("chat.modal.participants", { count: conversations.length })}
            </div>
          </div>

          <div className="chat-game-header-actions" ref={moreMenuRef}>
            {isNarrow && (
              <button
                type="button"
                className="chat-game-mobile-sidebar-btn"
                onClick={() => setMobileSidebarOpen((open) => !open)}
                title={t("chat.modal.participants", { count: conversations.length })}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="4" cy="6" r="1.5" />
                  <circle cx="4" cy="12" r="1.5" />
                  <circle cx="4" cy="18" r="1.5" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="chat-game-more-btn"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {t("chat.modal.agentMode")}
            </button>
            {moreOpen && (
              <div className="chat-game-more-menu" role="menu">
                <div className="chat-game-mode-group" data-testid="chat-game-agent-mode-controls">
                  <span className="chat-game-more-item-title">{t("chat.modal.agentMode")}</span>
                  <span className="chat-game-more-item-sub">
                    {modeLoading
                      ? t("chat.modal.providerDetecting")
                      : `${automationModeLabel} • ${tradeModeLabel} • ${chatModeLabel}`}
                  </span>
                  <div className="chat-game-mode-row">
                    <span className="chat-game-mode-label">{t("chat.modal.responseMode")}</span>
                    <div className="chat-game-mode-switch">
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${chatMode === "simple" ? "is-active" : ""}`}
                        onClick={() => setState("chatMode", "simple")}
                        data-testid="chat-game-response-simple"
                      >
                        {t("chat.modal.responseModeSimple")}
                      </button>
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${chatMode === "power" ? "is-active" : ""}`}
                        onClick={() => setState("chatMode", "power")}
                        data-testid="chat-game-response-power"
                      >
                        {t("chat.modal.responseModePower")}
                      </button>
                    </div>
                  </div>
                  <span className="chat-game-more-item-sub">
                    {chatMode === "power"
                      ? t("chat.modal.responseModeHintPower")
                      : t("chat.modal.responseModeHintSimple")}
                  </span>
                  <div className="chat-game-mode-row">
                    <span className="chat-game-mode-label">{t("permissions.automationMode")}</span>
                    <div className="chat-game-mode-switch">
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${automationMode === "connectors-only" ? "is-active" : ""}`}
                        disabled={modeLoading || automationSaving}
                        onClick={() => {
                          void handleAutomationModeChange("connectors-only");
                        }}
                        data-testid="chat-game-automation-connectors"
                      >
                        {t("permissions.mode.semi")}
                      </button>
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${automationMode === "full" ? "is-active" : ""}`}
                        disabled={modeLoading || automationSaving}
                        onClick={() => {
                          void handleAutomationModeChange("full");
                        }}
                        data-testid="chat-game-automation-full"
                      >
                        {t("permissions.mode.full")}
                      </button>
                    </div>
                  </div>
                  <div className="chat-game-mode-row">
                    <span className="chat-game-mode-label">{t("permissions.tradeMode")}</span>
                    <div className="chat-game-mode-switch">
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${tradeMode === "user-sign-only" ? "is-active" : ""}`}
                        disabled={modeLoading || tradeSaving}
                        onClick={() => {
                          void handleTradeModeChange("user-sign-only");
                        }}
                        data-testid="chat-game-trade-user-sign"
                      >
                        {t("permissions.trade.userSign")}
                      </button>
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${tradeMode === "manual-local-key" ? "is-active" : ""}`}
                        disabled={modeLoading || tradeSaving}
                        onClick={() => {
                          void handleTradeModeChange("manual-local-key");
                        }}
                        data-testid="chat-game-trade-manual"
                      >
                        {t("permissions.trade.manual")}
                      </button>
                      <button
                        type="button"
                        className={`chat-game-mode-chip ${tradeMode === "agent-auto" ? "is-active" : ""}`}
                        disabled={modeLoading || tradeSaving}
                        onClick={() => {
                          void handleTradeModeChange("agent-auto");
                        }}
                        data-testid="chat-game-trade-agent"
                      >
                        {t("permissions.trade.agent")}
                      </button>
                    </div>
                  </div>
                  <span className="chat-game-more-item-sub">
                    {t("chat.modal.tradeModeHint")}
                  </span>
                </div>
                <button
                  type="button"
                  className="chat-game-more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleChatClear();
                  }}
                >
                  <span className="chat-game-more-item-title">{t("command.clearChat")}</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="chat-game-body">
          <aside
            className={`chat-game-sidebar ${mobileSidebarOpen ? "is-open" : ""}`}
            data-chat-game-sidebar
          >
            <ConversationsSidebar variant="game-modal" />
          </aside>
          <section className="chat-game-thread" data-chat-game-thread>
            <ChatView variant="game-modal" />
          </section>
        </div>
      </div>
    </div>
  );
}
