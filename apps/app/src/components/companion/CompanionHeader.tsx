import type { AgentState } from "@milady/app-core/api";
import { LanguageDropdown } from "@milady/app-core/components";
import type { UiLanguage } from "../../i18n/messages";
import { AgentModeDropdown } from "../shared/AgentModeDropdown";

import type { TranslatorFn } from "./walletUtils";

/** Map raw backend agent-state strings to i18n keys */
const STATE_I18N: Record<string, string> = {
  running: "header.statusRunning",
  paused: "header.statusPaused",
  error: "header.statusError",
  restarting: "header.statusRestarting",
  starting: "header.statusStarting",
  not_started: "header.statusNotStarted",
  stopped: "header.statusStopped",
};

function translateAgentState(state: string, t: TranslatorFn): string {
  const key = STATE_I18N[state];
  return key ? t(key) : state;
}

export interface CompanionHeaderProps {
  // Camera toggle
  cameraZoomed?: boolean;
  setCameraZoomed?: React.Dispatch<React.SetStateAction<boolean>>;
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
  miladyCloudEnabled: boolean;
  miladyCloudConnected: boolean;
  miladyCloudCredits: number | null;
  creditColor: string;
  miladyCloudTopUpUrl: string;
  // Wallets (display only — full trading panel in separate PR)
  evmShort: string | null;
  solShort: string | null;
  // Character / UI
  conversationsOpen: boolean;
  autonomyOpen: boolean;
  toggleConversations: () => void;
  toggleAutonomy: () => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  // Translator
  t: TranslatorFn;
}

export function CompanionHeader(props: CompanionHeaderProps) {
  const {
    cameraZoomed,
    setCameraZoomed,
    agentState,
    stateColor,
    lifecycleBusy,
    restartBusy,
    pauseResumeBusy,
    pauseResumeDisabled,
    handlePauseResume,
    handleRestart,
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    creditColor,
    miladyCloudTopUpUrl,
    evmShort,
    solShort,
    conversationsOpen,
    autonomyOpen,
    toggleConversations,
    toggleAutonomy,
    uiLanguage,
    setUiLanguage,
    t,
  } = props;

  return (
    <header className="relative flex justify-center items-center mb-6 w-full z-10">
      {/* Hub Header Elements — centered */}
      <div className="flex items-center gap-3 relative">
        {/* Agent Status */}
        <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all shadow-inner relative overflow-hidden group">
          <span
            className={`uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md ${stateColor}`}
            data-testid="status-pill"
          >
            {translateAgentState(agentState as string, t)}
          </span>
          {(agentState as string) === "restarting" ||
          (agentState as string) === "starting" ||
          (agentState as string) === "not_started" ||
          (agentState as string) === "stopped" ? (
            <span className="flex items-center justify-center opacity-60 ml-1.5">
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
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${pauseResumeDisabled || lifecycleBusy || agentState === "restarting" ? "opacity-30 cursor-not-allowed bg-transparent" : "bg-white/5 hover:bg-white/20 hover:scale-110 border border-transparent hover:border-white/30 cursor-pointer"}`}
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
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${pauseResumeDisabled || lifecycleBusy || agentState === "restarting" ? "opacity-30 cursor-not-allowed bg-transparent" : "bg-white/5 hover:bg-white/20 hover:scale-110 border border-transparent hover:border-white/30 cursor-pointer"}`}
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
        {(miladyCloudEnabled || miladyCloudConnected) &&
          (miladyCloudConnected ? (
            <a
              href={miladyCloudTopUpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] font-medium text-sm tracking-wide transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 cursor-pointer ${miladyCloudCredits === null ? "text-white/60" : creditColor}`}
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
              <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
                {miladyCloudCredits === null
                  ? t("header.miladyCloudConnected")
                  : `$${miladyCloudCredits.toFixed(2)}`}
              </span>
            </a>
          ) : (
            <span className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-red-950/40 backdrop-blur-xl border border-red-500/30 text-red-400 font-medium text-sm tracking-wide shadow-[0_8px_32px_rgba(220,38,38,0.15)]">
              <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
                {t("header.cloudDisconnected")}
              </span>
            </span>
          ))}

        {/* Wallet addresses (trading panel in separate PR) */}
        {(evmShort || solShort) && (
          <span
            className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-white/90 font-medium text-sm tracking-wide transition-all"
            data-testid="wallet-address-pill"
          >
            <span className="uppercase font-bold tracking-widest text-[10px] sm:text-xs drop-shadow-md">
              {evmShort || solShort}
            </span>
          </span>
        )}
      </div>

      <div className="absolute right-0 flex items-center gap-2.5">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-1.5 py-1.5 backdrop-blur-xl shadow-xl hover:border-white/20 transition-all">
          <button
            type="button"
            onClick={toggleConversations}
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all ${
              conversationsOpen
                ? "bg-white/20 text-white border-white/30"
                : "bg-white/5 text-white/80 border-transparent hover:text-white hover:bg-white/20 hover:border-white/30"
            }`}
            title={t("conversations.chats")}
            aria-label={t("conversations.chats")}
            data-testid="companion-conversations-toggle"
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleAutonomy}
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all ${
              autonomyOpen
                ? "bg-white/20 text-white border-white/30"
                : "bg-white/5 text-white/80 border-transparent hover:text-white hover:bg-white/20 hover:border-white/30"
            }`}
            title={t("autonomouspanel.Current")}
            aria-label={t("autonomouspanel.Current")}
            data-testid="companion-autonomy-toggle"
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
              <path d="M3 3v18h18" />
              <path d="m7 14 4-4 3 3 5-6" />
            </svg>
          </button>

          {setCameraZoomed && (
            <button
              type="button"
              onClick={() => setCameraZoomed((z) => !z)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all"
              title={
                cameraZoomed ? t("companion.zoomOut") : t("companion.zoomIn")
              }
              data-testid="ui-zoom-toggle"
            >
              {cameraZoomed ? (
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              ) : (
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              )}
            </button>
          )}

          <AgentModeDropdown variant="companion" />

          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant="companion"
          />
        </div>
      </div>
    </header>
  );
}
