import {
  AlertTriangle,
  Bug,
  Check,
  CircleDollarSign,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { useTabNavigation } from "../hooks/useTabNavigation";
import { useBugReport } from "../hooks/useBugReport";
import { createTranslator } from "../i18n";
import { IconButton } from "./shared/IconButton";
import { StatusPill } from "./shared/StatusPill";

// Tooltip component for icon buttons
function IconButtonTooltip({
  children,
  label,
  shortcut,
}: {
  children: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-elevated border border-border text-[11px] text-txt-strong rounded-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg">
        <div className="font-medium">{label}</div>
        {shortcut && <div className="text-muted mt-0.5">{shortcut}</div>}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-bg-elevated" />
      </div>
    </div>
  );
}

export function Header() {
  const {
    agentStatus,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    cloudTopUpUrl,
    walletAddresses,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    copyToClipboard,
    dropStatus,
    loadDropStatus,
    registryStatus,
    uiShellMode,
    setUiShellMode,
    uiLanguage,
  } = useApp();
  const { navigateToTab } = useTabNavigation();

  const [copied, setCopied] = useState<string | null>(null);
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  useEffect(() => {
    void loadDropStatus();
  }, [loadDropStatus]);

  // Clear copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const name = agentStatus?.agentName ?? "Milady";
  const state = agentStatus?.state ?? "not_started";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || state === "restarting" || state === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger bg-danger/10"
    : cloudCreditsLow
      ? "border-warn text-warn bg-warn/10"
      : "border-ok text-ok bg-ok/10";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 6)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;

  const { open: openBugReport } = useBugReport();

  const handleCopy = (type: "evm" | "sol", address: string) => {
    copyToClipboard(address);
    setCopied(type);
  };

  // Shell mode toggle (companion vs native)
  const shellMode = uiShellMode ?? "companion";
  const isNativeShell = shellMode === "native";
  const shellToggleStateLabel = isNativeShell
    ? t("header.nativeMode")
    : t("header.companionMode");
  const shellToggleActionLabel = isNativeShell
    ? t("header.switchToCompanion")
    : t("header.switchToNative");
  const shellToggleClass = isNativeShell
    ? "border-[#22c55e] text-[#22c55e] bg-[rgba(34,197,94,0.12)] hover:bg-[rgba(34,197,94,0.2)] shadow-[0_0_0_1px_rgba(34,197,94,0.35),0_0_16px_rgba(34,197,94,0.22)]"
    : "border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] shadow-[0_0_0_1px_rgba(212,175,55,0.35),0_0_16px_rgba(212,175,55,0.2)]";

  const handleShellToggle = () => {
    const nextMode = shellMode === "companion" ? "native" : "companion";
    setUiShellMode(nextMode);
    navigateToTab(nextMode === "companion" ? "companion" : "chat");
  };

  const statusTone =
    state === "running"
      ? "ok"
      : state === "paused"
        ? "warn"
        : state === "error"
          ? "danger"
          : "muted";
  const statusLabel =
    state === "not_started" ? "Not started" : state.replace(/_/g, " ");
  const statusIcon =
    state === "running"
      ? Check
      : state === "paused"
        ? Pause
        : state === "error"
          ? AlertTriangle
          : Loader2;

  return (
    <header
      className="border-b border-border bg-bg py-2 px-3 sm:py-3 sm:px-4"
      data-testid="shell-header"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Agent Name with Avatar */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-fg font-bold text-sm">M</span>
          </div>
          <div className="min-w-0">
            <span
              className="text-base font-bold text-txt-strong truncate block"
              data-testid="agent-name"
            >
              {name}
            </span>
            <span className="text-[10px] text-muted hidden sm:block">
              {t("header.aiAgent")}
            </span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 w-max ml-auto pr-0.5">
            {/* Free Mint Banner */}
            {dropStatus?.dropEnabled &&
              dropStatus?.publicMintOpen &&
              !dropStatus?.mintedOut &&
              !dropStatus?.userHasMinted &&
              !registryStatus?.registered && (
                <button
                  type="button"
                  onClick={() => navigateToTab("character")}
                  className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 h-9 border border-accent bg-accent-subtle text-[11px] sm:text-xs font-bold text-accent cursor-pointer hover:bg-accent/20 transition-colors animate-pulse rounded-md"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-accent animate-ping"
                    style={{ animationDuration: "1.5s" }}
                  />
                  <span className="hidden sm:inline">
                    {t("header.freeMintLive")}
                  </span>
                  <span className="sm:hidden">Mint</span>
                </button>
              )}

            {/* Cloud Credits */}
            {(cloudEnabled || cloudConnected) &&
              (cloudConnected ? (
                <a
                  href={cloudTopUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 h-9 border rounded-md font-mono text-[11px] sm:text-xs no-underline transition-all duration-200 hover:border-accent hover:text-accent hover:shadow-sm ${cloudCredits === null ? "border-muted text-muted" : creditColor}`}
                  title="Cloud credits balance"
                >
                  <CircleDollarSign className="w-3.5 h-3.5" />
                  {cloudCredits === null
                    ? t("header.cloudConnected")
                    : `$${cloudCredits.toFixed(2)}`}
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 h-9 border border-danger text-danger bg-danger/10 rounded-md font-mono text-[11px] sm:text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {t("header.cloudDisconnected")}
                  </span>
                  <span className="sm:hidden">Cloud</span>
                </span>
              ))}

            {/* Shell Mode Toggle */}
            <button
              type="button"
              onClick={handleShellToggle}
              className={`inline-flex shrink-0 items-center gap-2 h-9 px-3 border rounded-md font-mono cursor-pointer transition-all ${shellToggleClass}`}
              title={shellToggleActionLabel}
              data-testid="ui-shell-toggle"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current/50 text-[10px] leading-none">
                &#x21C4;
              </span>
              <span className="hidden sm:flex flex-col items-start leading-[1.02]">
                <span className="text-[9px] uppercase tracking-[0.08em] opacity-80">
                  {shellToggleStateLabel}
                </span>
                <span className="text-[11px] font-semibold">
                  {shellToggleActionLabel}
                </span>
              </span>
            </button>

            {/* Status & Controls Group */}
            <div className="flex items-center gap-2 shrink-0 bg-bg-accent/50 rounded-lg p-1">
              <StatusPill
                icon={statusIcon}
                label={statusLabel}
                pulse={state !== "running"}
                tone={statusTone}
              />

              {/* Pause/Resume Button */}
              {state === "restarting" ||
              state === "starting" ||
              state === "not_started" ||
              state === "stopped" ? (
                <span className="inline-flex items-center justify-center w-11 h-11 text-sm leading-none opacity-60">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </span>
              ) : (
                <IconButtonTooltip
                  label={
                    state === "paused"
                      ? t("header.resumeAutonomy")
                      : t("header.pauseAutonomy")
                  }
                  shortcut="Space"
                >
                  <IconButton
                    onClick={handlePauseResume}
                    label={
                      state === "paused"
                        ? t("header.resumeAutonomy")
                        : t("header.pauseAutonomy")
                    }
                    className="disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    disabled={pauseResumeDisabled}
                    data-testid="shell-pause-resume"
                  >
                    {pauseResumeBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : state === "paused" ? (
                      <Play className="w-5 h-5" />
                    ) : (
                      <Pause className="w-5 h-5" />
                    )}
                  </IconButton>
                </IconButtonTooltip>
              )}

              {/* Restart Button */}
              <IconButtonTooltip
                label={t("header.restartAgent")}
                shortcut="Ctrl+R"
              >
                <button
                  type="button"
                  onClick={handleRestart}
                  aria-label={t("header.restartAgent")}
                  disabled={lifecycleBusy || state === "restarting"}
                  className="btn-ghost focus-ring inline-flex items-center justify-center h-9 px-3 text-[11px] sm:text-xs font-mono cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-md"
                  data-testid="shell-restart"
                >
                  {restartBusy || state === "restarting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin sm:hidden" />
                      <span className="hidden sm:inline">
                        {t("header.restarting")}
                      </span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 sm:hidden" />
                      <span className="hidden sm:inline">
                        {t("header.restart")}
                      </span>
                    </>
                  )}
                </button>
              </IconButtonTooltip>
            </div>

            {/* Bug Report */}
            <IconButtonTooltip label={t("header.reportBug")} shortcut="Shift+?">
              <IconButton
                onClick={openBugReport}
                label={t("header.reportBug")}
                data-testid="shell-report-bug"
              >
                <Bug className="w-5 h-5" />
              </IconButton>
            </IconButtonTooltip>

            {/* Wallet Dropdown */}
            {(evmShort || solShort) && (
              <div className="wallet-wrapper relative inline-flex shrink-0 group">
                <IconButtonTooltip label={t("header.viewWallets")}>
                  <IconButton
                    onClick={() => navigateToTab("wallets")}
                    label={t("header.viewWallets")}
                    data-testid="shell-wallets"
                  >
                    <Wallet className="w-5 h-5" />
                  </IconButton>
                </IconButtonTooltip>

                {/* Wallet Dropdown */}
                <div className="wallet-tooltip hidden group-hover:block group-focus-within:block absolute top-full right-0 mt-2 p-3 border border-border bg-bg-elevated z-50 min-w-[300px] shadow-xl rounded-lg">
                  <div className="text-[11px] text-muted uppercase tracking-wide mb-2 px-1">
                    {t("header.walletAddresses")}
                  </div>

                  {evmShort && (
                    <div className="flex items-center gap-2 text-xs py-2 px-1 rounded-md hover:bg-bg-hover transition-colors">
                      <span className="font-bold font-mono min-w-[40px] text-muted">
                        EVM
                      </span>
                      <code className="font-mono flex-1 truncate text-txt-strong">
                        {evmShort}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const evmAddress = walletAddresses?.evmAddress;
                          if (evmAddress) {
                            handleCopy("evm", evmAddress);
                          }
                        }}
                        className="px-2 py-1.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent rounded transition-colors min-w-[60px]"
                      >
                        {copied === "evm" ? (
                          <span className="text-ok">{t("header.copied")}</span>
                        ) : (
                          t("header.copy")
                        )}
                      </button>
                    </div>
                  )}

                  {solShort && (
                    <div className="flex items-center gap-2 text-xs py-2 px-1 rounded-md hover:bg-bg-hover transition-colors border-t border-border">
                      <span className="font-bold font-mono min-w-[40px] text-muted">
                        SOL
                      </span>
                      <code className="font-mono flex-1 truncate text-txt-strong">
                        {solShort}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const solanaAddress = walletAddresses?.solanaAddress;
                          if (solanaAddress) {
                            handleCopy("sol", solanaAddress);
                          }
                        }}
                        className="px-2 py-1.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent rounded transition-colors min-w-[60px]"
                      >
                        {copied === "sol" ? (
                          <span className="text-ok">{t("header.copied")}</span>
                        ) : (
                          t("header.copy")
                        )}
                      </button>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted text-center">
                    {t("header.manageWallets")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
