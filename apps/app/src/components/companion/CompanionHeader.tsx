import { useState } from "react";
import type { AgentState } from "../../api-client";
import type { UiLanguage } from "../../i18n/messages";
import type { Tab } from "../../navigation";
import type { TranslatorFn } from "./walletUtils";

function MiladyDropdown({
  name,
  agentState,
  lifecycleBusy,
  restartBusy,
  handleRestart,
  t,
}: {
  name: string;
  agentState: AgentState | string;
  lifecycleBusy: boolean;
  restartBusy: boolean;
  handleRestart: () => Promise<void>;
  t: TranslatorFn;
}) {
  const [open, setOpen] = useState(false);
  const isRestarting = restartBusy || (agentState as string) === "restarting";

  return (
    <div className="relative">
      <button
        type="button"
        className="anime-status-pill cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <div className="anime-logo-circle">M</div>
        <span className="text-sm font-black mr-1 text-[var(--ac-text-primary)]">
          {name}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] overflow-hidden rounded-lg border border-white/18 bg-[rgba(8,10,16,0.97)] shadow-xl backdrop-blur-xl">
            <div className="px-3 py-2 border-b border-white/10 text-[10px] text-white/40 uppercase tracking-widest font-mono">
              {name}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void handleRestart();
              }}
              disabled={
                lifecycleBusy || (agentState as string) === "restarting"
              }
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRestarting ? (
                <svg
                  className="animate-spin w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
              {isRestarting ? t("header.restarting") : t("header.restart")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export interface CompanionHeaderProps {
  // Chat toggle
  chatDockOpen: boolean;
  setChatDockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Character roster toggle
  characterRosterOpen: boolean;
  setCharacterRosterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Agent identity & state
  name: string;
  agentState: AgentState | string;
  stateColor: string;
  // Lifecycle
  lifecycleBusy: boolean;
  restartBusy: boolean;
  pauseResumeBusy: boolean;
  pauseResumeDisabled: boolean;
  handlePauseResume: () => Promise<void>;
  handleRestart: () => Promise<void>;
  // Cloud
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number | null;
  creditColor: string;
  cloudTopUpUrl: string;
  // Wallets (display only — full trading panel in separate PR)
  evmShort: string | null;
  solShort: string | null;
  // Character / UI
  setTab: (tab: Tab) => void;
  handleSwitchToNativeShell: () => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  // Translator
  t: TranslatorFn;
}

export function CompanionHeader(props: CompanionHeaderProps) {
  const {
    chatDockOpen,
    setChatDockOpen,
    characterRosterOpen,
    setCharacterRosterOpen,
    name,
    agentState,
    stateColor,
    lifecycleBusy,
    restartBusy,
    pauseResumeBusy,
    pauseResumeDisabled,
    handlePauseResume,
    handleRestart,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    creditColor,
    cloudTopUpUrl,
    evmShort,
    solShort,
    setTab,
    handleSwitchToNativeShell,
    uiLanguage,
    setUiLanguage,
    t,
  } = props;

  return (
    <header className="anime-comp-header">
      <div className="anime-comp-header-left">
        <button
          type="button"
          className={`anime-btn-ghost anime-chat-toggle-btn ${chatDockOpen ? "is-open" : ""}`}
          onClick={() => setChatDockOpen((open) => !open)}
          title={chatDockOpen ? t("chat.modal.back") : t("nav.chat")}
          data-testid="companion-chat-toggle"
        >
          {chatDockOpen ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </button>

        <MiladyDropdown
          name={name}
          agentState={agentState}
          lifecycleBusy={lifecycleBusy}
          restartBusy={restartBusy}
          handleRestart={handleRestart}
          t={t}
        />

        {/* Hub Header Elements */}
        <div className="anime-header-extensions">
          {/* Agent Status */}
          <div className="anime-header-pill">
            <span
              className={`anime-header-pill-text ${stateColor}`}
              data-testid="status-pill"
            >
              {agentState}
            </span>
            {(agentState as string) === "restarting" ||
            (agentState as string) === "starting" ||
            (agentState as string) === "not_started" ||
            (agentState as string) === "stopped" ? (
              <span className="anime-header-pill-icon opacity-60">
                <svg
                  className="animate-spin"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handlePauseResume();
                  }}
                  title={
                    agentState === "paused"
                      ? t("header.resumeAutonomy")
                      : t("header.pauseAutonomy")
                  }
                  className={`anime-header-action-btn ${pauseResumeDisabled ? "is-disabled" : ""}`}
                  disabled={pauseResumeDisabled}
                >
                  {pauseResumeBusy ? (
                    <svg
                      className="animate-spin"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : agentState === "paused" ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRestart();
                  }}
                  title={t("header.restartAgent")}
                  className={`anime-header-action-btn ${lifecycleBusy || (agentState as string) === "restarting" ? "is-disabled" : ""}`}
                  disabled={
                    lifecycleBusy || (agentState as string) === "restarting"
                  }
                >
                  {restartBusy || (agentState as string) === "restarting" ? (
                    <svg
                      className="animate-spin"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Cloud Balance */}
          {(cloudEnabled || cloudConnected) &&
            (cloudConnected ? (
              <a
                href={cloudTopUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`anime-header-pill is-clickable no-underline hover:no-underline ${cloudCredits === null ? "text-white/60" : creditColor}`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                  <path d="M12 18V6" />
                </svg>
                <span className="anime-header-pill-text">
                  {cloudCredits === null
                    ? t("header.cloudConnected")
                    : `$${cloudCredits.toFixed(2)}`}
                </span>
              </a>
            ) : (
              <span className="anime-header-pill is-danger">
                <span className="anime-header-pill-text">
                  {t("header.cloudDisconnected")}
                </span>
              </span>
            ))}

          {/* Wallet addresses (trading panel in separate PR) */}
          {(evmShort || solShort) && (
            <span
              className="anime-header-pill"
              data-testid="wallet-address-pill"
            >
              <span className="anime-header-pill-text">
                {evmShort || solShort}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="anime-comp-header-right">
        <div
          className={`anime-character-header-control ${characterRosterOpen ? "is-open" : ""}`}
        >
          <button
            type="button"
            className="anime-character-header-toggle"
            onClick={() => setCharacterRosterOpen((prev) => !prev)}
            aria-expanded={characterRosterOpen}
            aria-controls="anime-character-roster"
            data-testid="character-roster-toggle"
          >
            <span className="anime-character-header-label">
              {t("nav.character")}
            </span>
            <svg
              className={`anime-character-header-caret ${characterRosterOpen ? "is-open" : ""}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setTab("character")}
            className="anime-roster-config-btn"
            title={t("companion.characterSettings")}
            data-testid="character-roster-settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleSwitchToNativeShell}
            className="anime-roster-config-btn"
            title={t("companion.switchToNativeUi")}
            data-testid="ui-shell-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <line x1="8" y1="20" x2="16" y2="20" />
              <line x1="12" y1="18" x2="12" y2="20" />
            </svg>
          </button>

          <fieldset
            className="anime-lang-toggle"
            aria-label={t("settings.language")}
            data-testid="companion-language-toggle"
          >
            <button
              type="button"
              className={`anime-lang-toggle-btn ${uiLanguage === "en" ? "is-active" : ""}`}
              onClick={() => setUiLanguage("en")}
              aria-pressed={uiLanguage === "en"}
              data-testid="companion-language-en"
            >
              EN
            </button>
            <button
              type="button"
              className={`anime-lang-toggle-btn ${uiLanguage === "zh-CN" ? "is-active" : ""}`}
              onClick={() => setUiLanguage("zh-CN")}
              aria-pressed={uiLanguage === "zh-CN"}
              data-testid="companion-language-zh"
            >
              {t("settings.languageChineseSimplified")}
            </button>
          </fieldset>
        </div>
      </div>
    </header>
  );
}
