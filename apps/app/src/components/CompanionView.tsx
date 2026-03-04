import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVrmBackgroundUrl,
  getVrmNeedsFlip,
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  useApp,
  VRM_COUNT,
} from "../AppContext";
import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../api-client";
import { client } from "../api-client";
import { resolveApiUrl } from "../asset-url";
import { createTranslator } from "../i18n";
import { ChatModalView } from "./ChatModalView";
import { CompanionCharacterRoster } from "./companion/CompanionCharacterRoster";
import { CompanionHubNav } from "./companion/CompanionHubNav";
import { CompanionWalletPanel } from "./companion/CompanionWalletPanel";
import { VrmStage } from "./companion/VrmStage";
import { WalletTradingProfileModal } from "./companion/WalletTradingProfileModal";
import { isBscChainName } from "./companion/walletUtils";

export function CompanionView() {
  const {
    setState,
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    copyToClipboard,
    uiLanguage,
    setUiLanguage,
    setTab,
    setUiShellMode,
    // Header properties
    agentStatus,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    cloudTopUpUrl,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    walletError,
    loadBalances,
    loadNfts,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    loadWalletTradingProfile,
    executeBscTrade,
    executeBscTransfer,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    setActionNotice,
  } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor =
    agentState === "running"
      ? "text-ok border-ok"
      : agentState === "paused" ||
          agentState === "restarting" ||
          agentState === "starting"
        ? "text-warn border-warn"
        : agentState === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || agentState === "restarting" || agentState === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger"
    : cloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;

  const [characterRosterOpen, setCharacterRosterOpen] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  );
  const vrmFileInputRef = useRef<HTMLInputElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  // Trading profile state (kept in parent because trigger is in header-right)
  const [walletProfileOpen, setWalletProfileOpen] = useState(false);
  const [walletProfileLoading, setWalletProfileLoading] = useState(false);
  const [walletProfileError, setWalletProfileError] = useState<string | null>(
    null,
  );
  const [walletProfileWindow, setWalletProfileWindow] =
    useState<WalletTradingProfileWindow>("30d");
  const [walletProfileSource, setWalletProfileSource] =
    useState<WalletTradingProfileSourceFilter>("all");
  const [walletProfileData, setWalletProfileData] =
    useState<WalletTradingProfileResponse | null>(null);

  const walletBnbUsdEstimate = useMemo(() => {
    const bscNative = walletBalances?.evm?.chains.find((chain) =>
      isBscChainName(chain.chain),
    );
    if (!bscNative) return null;
    const nativeBalance = Number.parseFloat(bscNative.nativeBalance);
    const nativeValueUsd = Number.parseFloat(bscNative.nativeValueUsd);
    if (!Number.isFinite(nativeBalance) || nativeBalance <= 0) return null;
    if (!Number.isFinite(nativeValueUsd) || nativeValueUsd <= 0) return null;
    const estimate = nativeValueUsd / nativeBalance;
    return Number.isFinite(estimate) && estimate > 0 ? estimate : null;
  }, [walletBalances]);

  const refreshWalletTradingProfile = useCallback(async () => {
    setWalletProfileLoading(true);
    setWalletProfileError(null);
    try {
      const profile = await loadWalletTradingProfile(
        walletProfileWindow,
        walletProfileSource,
      );
      setWalletProfileData(profile);
    } catch (err) {
      setWalletProfileError(
        err instanceof Error ? err.message : t("wallet.profile.loadFailed"),
      );
    } finally {
      setWalletProfileLoading(false);
    }
  }, [loadWalletTradingProfile, t, walletProfileSource, walletProfileWindow]);

  useEffect(() => {
    if (!walletProfileOpen) return;
    void refreshWalletTradingProfile();
  }, [walletProfileOpen, refreshWalletTradingProfile]);

  const handleRosterVrmUpload = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".vrm")) return;
      void (async () => {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 32));
        const text = new TextDecoder().decode(bytes);
        if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
          alert("This .vrm is a Git LFS pointer, not the real model file.");
          return;
        }
        if (
          bytes.length < 4 ||
          bytes[0] !== 0x67 ||
          bytes[1] !== 0x6c ||
          bytes[2] !== 0x54 ||
          bytes[3] !== 0x46
        ) {
          alert("Invalid VRM file. Please select a valid .vrm binary.");
          return;
        }
        const previousIndex = selectedVrmIndex;
        const url = URL.createObjectURL(file);
        setState("customVrmUrl", url);
        setState("selectedVrmIndex", 0);
        client
          .uploadCustomVrm(file)
          .then(() => {
            setState(
              "customVrmUrl",
              resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
            );
            requestAnimationFrame(() => URL.revokeObjectURL(url));
          })
          .catch(() => {
            setState("selectedVrmIndex", previousIndex);
            URL.revokeObjectURL(url);
          });
      })();
    },
    [selectedVrmIndex, setState],
  );

  const handleBgUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setState("customBackgroundUrl", url);
      if (selectedVrmIndex !== 0) setState("selectedVrmIndex", 0);
      client
        .uploadCustomBackground(file)
        .then(() => {
          setState(
            "customBackgroundUrl",
            resolveApiUrl(`/api/avatar/background?t=${Date.now()}`),
          );
          requestAnimationFrame(() => URL.revokeObjectURL(url));
        })
        .catch(() => {
          setState("customBackgroundUrl", "");
          URL.revokeObjectURL(url);
        });
    },
    [selectedVrmIndex, setState],
  );

  const handleSwitchToNativeShell = useCallback(() => {
    setUiShellMode("native");
    setTab("chat");
  }, [setTab, setUiShellMode]);

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const vrmBackgroundUrl =
    selectedVrmIndex === 0 && customVrmUrl
      ? customBackgroundUrl || getVrmBackgroundUrl(1)
      : getVrmBackgroundUrl(safeSelectedVrmIndex);
  const needsFlip =
    selectedVrmIndex > 0 && getVrmNeedsFlip(safeSelectedVrmIndex);

  const rosterItems = useMemo(
    () =>
      Array.from({ length: VRM_COUNT }, (_, i) => {
        const index = i + 1;
        return {
          index,
          previewUrl: getVrmPreviewUrl(index),
          title: getVrmTitle(index),
        };
      }),
    [],
  );

  return (
    <div
      className="anime-comp-screen font-display"
      style={{
        backgroundImage: `url("${vrmBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="anime-comp-bg-graphic" />

      {/* Model Layer */}
      <VrmStage
        vrmPath={vrmPath}
        fallbackPreviewUrl={fallbackPreviewUrl}
        needsFlip={needsFlip}
        chatDockOpen={chatDockOpen}
        t={t}
      />

      {/* UI Overlay */}
      <div className="anime-comp-ui-layer">
        {/* Top Header */}
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

            <div className="anime-status-pill">
              <div className="anime-logo-circle">M</div>
              <span className="text-sm font-black mr-2 text-[var(--ac-text-primary)]">
                {name}
              </span>
            </div>

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
                      {restartBusy ||
                      (agentState as string) === "restarting" ? (
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

              {/* Wallets */}
              {(evmShort || solShort) && (
                <CompanionWalletPanel
                  copyToClipboard={copyToClipboard}
                  setActionNotice={setActionNotice}
                  walletAddresses={walletAddresses}
                  walletBalances={walletBalances}
                  walletNfts={walletNfts}
                  walletLoading={walletLoading}
                  walletNftsLoading={walletNftsLoading}
                  walletError={walletError}
                  loadBalances={loadBalances}
                  loadNfts={loadNfts}
                  getBscTradePreflight={getBscTradePreflight}
                  getBscTradeQuote={getBscTradeQuote}
                  getBscTradeTxStatus={getBscTradeTxStatus}
                  loadWalletTradingProfile={loadWalletTradingProfile}
                  executeBscTrade={executeBscTrade}
                  executeBscTransfer={executeBscTransfer}
                  t={t}
                />
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

            <button
              type="button"
              className={`anime-character-profile-trigger ${walletProfileOpen ? "is-open" : ""}`}
              onClick={() => setWalletProfileOpen(true)}
              title={t("wallet.profile.title")}
              aria-label={t("wallet.profile.title")}
              data-testid="wallet-profile-trigger"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 21h8" />
                <path d="M12 17v4" />
                <path d="M7 4h10v2a5 5 0 0 1-10 0z" />
                <path d="M5 6H3a2 2 0 0 0 2 4h2" />
                <path d="M19 6h2a2 2 0 0 1-2 4h-2" />
              </svg>
            </button>
          </div>
        </header>

        <div
          className={`anime-comp-chat-dock-anchor ${chatDockOpen ? "is-open" : ""}`}
          data-testid="companion-chat-dock"
        >
          <ChatModalView
            variant="companion-dock"
            onRequestClose={() => setChatDockOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="anime-comp-main-grid">
          {/* Center (Empty to show character) */}
          <div className="anime-comp-center" />

          {/* Right Panel: Actions + Character Drawer */}
          <aside className="anime-comp-right-panel">
            <CompanionCharacterRoster
              rosterItems={rosterItems}
              selectedVrmIndex={selectedVrmIndex}
              safeSelectedVrmIndex={safeSelectedVrmIndex}
              characterRosterOpen={characterRosterOpen}
              setState={setState}
              handleRosterVrmUpload={handleRosterVrmUpload}
              handleBgUpload={handleBgUpload}
              vrmFileInputRef={vrmFileInputRef}
              bgFileInputRef={bgFileInputRef}
              t={t}
            />

            {/* Game HUD Icon Menu */}
            <CompanionHubNav setTab={setTab} t={t} />
          </aside>
        </div>

        <WalletTradingProfileModal
          open={walletProfileOpen}
          loading={walletProfileLoading}
          error={walletProfileError}
          profile={walletProfileData}
          bnbUsdEstimate={walletBnbUsdEstimate}
          windowFilter={walletProfileWindow}
          sourceFilter={walletProfileSource}
          onClose={() => setWalletProfileOpen(false)}
          onRefresh={() => {
            void refreshWalletTradingProfile();
          }}
          onWindowFilterChange={(windowFilter) =>
            setWalletProfileWindow(windowFilter)
          }
          onSourceFilterChange={(sourceFilter) =>
            setWalletProfileSource(sourceFilter)
          }
          t={t}
        />
      </div>
    </div>
  );
}
