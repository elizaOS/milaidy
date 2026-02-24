import {
  Bug,
  CircleDollarSign,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";
import { useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";

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
    setTab,
    dropStatus,
    loadDropStatus,
    registryStatus,
  } = useApp();

  useEffect(() => {
    void loadDropStatus();
  }, [loadDropStatus]);

  const name = agentStatus?.agentName ?? "Milady";
  const state = agentStatus?.state ?? "not_started";

  const stateColor =
    state === "running"
      ? "text-ok border-ok"
      : state === "paused" || state === "restarting" || state === "starting"
        ? "text-warn border-warn"
        : state === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";
  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || state === "restarting" || state === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger"
    : cloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 6)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;

  const { open: openBugReport } = useBugReport();

  const iconBtn =
    "inline-flex items-center justify-center w-7 h-7 border border-border bg-bg cursor-pointer text-sm leading-none hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm hover:scale-105 active:scale-95";

  return (
    <header className="border-b border-border py-2 px-3 sm:py-3 sm:px-4">
      <div className="flex items-center gap-2 min-w-0">
        <div className="shrink-0 min-w-0">
          <span
            className="text-base font-bold text-txt-strong truncate block"
            data-testid="agent-name"
          >
            {name}
          </span>
        </div>
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 w-max ml-auto pr-0.5">
            {dropStatus?.dropEnabled &&
              dropStatus?.publicMintOpen &&
              !dropStatus?.mintedOut &&
              !dropStatus?.userHasMinted &&
              !registryStatus?.registered && (
                <button
                  type="button"
                  onClick={() => setTab("character")}
                  className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[11px] sm:text-xs font-bold text-[var(--accent)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors animate-pulse"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-ping"
                    style={{ animationDuration: "1.5s" }}
                  />
                  <span className="sm:hidden">Mint</span>
                  <span className="hidden sm:inline">Free Mint Live!</span>
                </button>
              )}
            {(cloudEnabled || cloudConnected) &&
              (cloudConnected ? (
                <a
                  href={cloudTopUpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex shrink-0 items-center gap-1.5 px-2 py-1.5 border font-mono text-[11px] sm:text-xs no-underline transition-all duration-200 hover:border-accent hover:text-accent hover:shadow-sm ${cloudCredits === null ? "border-muted text-muted" : creditColor}`}
                >
                  <CircleDollarSign className="w-3.5 h-3.5" />
                  {cloudCredits === null
                    ? "Cloud connected"
                    : `$${cloudCredits.toFixed(2)}`}
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 px-2 py-1.5 border border-danger text-danger font-mono text-[11px] sm:text-xs">
                  Cloud disconnected
                </span>
              ))}
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`inline-flex items-center h-7 px-2 border font-mono text-[11px] sm:text-xs leading-none ${stateColor}`}
                data-testid="status-pill"
              >
                {state}
              </span>
              {state === "restarting" ||
              state === "starting" ||
              state === "not_started" ||
              state === "stopped" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 text-sm leading-none opacity-60">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseResume}
                  aria-label={
                    state === "paused" ? "Resume autonomy" : "Pause autonomy"
                  }
                  title={
                    state === "paused" ? "Resume autonomy" : "Pause autonomy"
                  }
                  className={`${iconBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                  disabled={pauseResumeDisabled}
                >
                  {pauseResumeBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : state === "paused" ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleRestart}
                aria-label="Restart agent"
                disabled={lifecycleBusy || state === "restarting"}
                title="Restart agent"
                className="inline-flex items-center h-7 px-2 sm:px-3 border border-border bg-bg text-[11px] sm:text-xs font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {restartBusy || state === "restarting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin sm:hidden" />
                    <span className="hidden sm:inline">Restarting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 sm:hidden" />
                    <span className="hidden sm:inline">Restart</span>
                  </>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={openBugReport}
              aria-label="Report a bug"
              title="Report a bug"
              className={`${iconBtn} transition-all duration-200 hover:shadow-sm`}
            >
              <Bug className="w-4 h-4" />
            </button>
            {(evmShort || solShort) && (
              <div className="wallet-wrapper relative inline-flex shrink-0 group">
                <button
                  type="button"
                  onClick={() => setTab("wallets")}
                  aria-label="Open wallets"
                  className="inline-flex items-center justify-center w-7 h-7 border border-border bg-bg cursor-pointer hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm"
                >
                  <Wallet className="w-4 h-4" />
                </button>
                <div className="wallet-tooltip hidden group-hover:block absolute top-full right-0 mt-2 p-3 border border-border bg-bg z-50 min-w-[280px] shadow-lg">
                  {evmShort && (
                    <div className="flex items-center gap-2 text-xs py-1">
                      <span className="font-bold font-mono min-w-[30px]">
                        EVM
                      </span>
                      <code className="font-mono flex-1 truncate">
                        {evmShort}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const evmAddress = walletAddresses?.evmAddress;
                          if (evmAddress) {
                            copyToClipboard(evmAddress);
                          }
                        }}
                        className="px-1.5 py-1 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent"
                      >
                        copy
                      </button>
                    </div>
                  )}
                  {solShort && (
                    <div className="flex items-center gap-2 text-xs py-1 border-t border-border">
                      <span className="font-bold font-mono min-w-[30px]">
                        SOL
                      </span>
                      <code className="font-mono flex-1 truncate">
                        {solShort}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const solanaAddress = walletAddresses?.solanaAddress;
                          if (solanaAddress) {
                            copyToClipboard(solanaAddress);
                          }
                        }}
                        className="px-1.5 py-1 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent"
                      >
                        copy
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
