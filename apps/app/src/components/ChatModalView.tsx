import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext.js";
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
    handleNewConversation,
    handleChatClear,
    setTab,
    uiLanguage,
  } = useApp();
  const t = createTranslator(uiLanguage);

  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  const handleBack = () => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    setTab("companion");
  };

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
                title={t("chat.modal.addParticipant")}
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
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <path d="M20 8v6" />
                  <path d="M23 11h-6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="chat-game-more-btn"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {t("chat.modal.more")}
            </button>
            {moreOpen && (
              <div className="chat-game-more-menu" role="menu">
                <button
                  type="button"
                  className="chat-game-more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleNewConversation();
                  }}
                >
                  {t("chat.modal.addParticipant")}
                </button>
                <button
                  type="button"
                  className="chat-game-more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleChatClear();
                  }}
                >
                  {t("command.clearChat")}
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
