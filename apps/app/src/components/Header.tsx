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
import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";

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

// Status indicator with icon
function StatusIndicator({ state }: { state: string }) {
  const getStatusConfig = () => {
    switch (state) {
      case "running":
        return {
          icon: Check,
          colorClass: "text-ok border-ok bg-ok/10",
          dotColor: "bg-ok",
          label: "Running",
        };
      case "paused":
        return {
          icon: Pause,
          colorClass: "text-warn border-warn bg-warn/10",
          dotColor: "bg-warn",
          label: "Paused",
        };
      case "error":
        return {
          icon: AlertTriangle,
          colorClass: "text-danger border-danger bg-danger/10",
          dotColor: "bg-danger",
          label: "Error",
        };
      default:
        return {
          icon: Loader2,
          colorClass: "text-muted border-muted bg-muted/10",
          dotColor: "bg-muted",
          label: state.replace(/_/g, " "),
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 border rounded-md font-medium text-[11px] sm:text-xs ${config.colorClass}`}
      data-testid="status-pill"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${state === "running" ? "" : "animate-pulse"}`}
      />
      <span className="hidden sm:inline capitalize">{config.label}</span>
      <span className="sm:hidden">
        <Icon className="w-3.5 h-3.5" />
      </span>
    </span>
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
    setTab,
    dropStatus,
    loadDropStatus,
    registryStatus,
  } = useApp();

  const [copied, setCopied] = useState<string | null>(null);

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

  // Minimum 44px touch targets for mobile
  const iconBtnBase =
    "inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border bg-bg cursor-pointer text-sm leading-none hover:border-accent hover:text-accent transition-all duration-200 hover:shadow-sm hover:scale-105 active:scale-95 rounded-md";

  const handleCopy = (type: "evm" | "sol", address: string) => {
    copyToClipboard(address);
    setCopied(type);
  };

  return (
    <header className="border-b border-border bg-bg py-2 px-3 sm:py-3 sm:px-4">
      <div className="flex items-center gap-3 min-w-0">
        {/* Agent Name with Avatar */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-foreground font-bold text-sm">M</span>
          </div>
          <div className="min-w-0">
            <span
              className="text-base font-bold text-txt-strong truncate block"
              data-testid="agent-name"
            >
              {name}
            </span>
            <span className="text-[10px] text-muted hidden sm:block">
              AI Agent
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
                  onClick={() => setTab("character")}
                  className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 h-9 border border-accent bg-accent-subtle text-[11px] sm:text-xs font-bold text-accent cursor-pointer hover:bg-accent/20 transition-colors animate-pulse rounded-md"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-accent animate-ping"
                    style={{ animationDuration: "1.5s" }}
                  />
                  <span className="hidden sm:inline">Free Mint Live!</span>
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
                    ? "Cloud"
                    : `$${cloudCredits.toFixed(2)}`}
                </a>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 h-9 border border-danger text-danger bg-danger/10 rounded-md font-mono text-[11px] sm:text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cloud disconnected</span>
                  <span className="sm:hidden">Cloud</span>
                </span>
              ))}

            {/* Status & Controls Group */}
            <div className="flex items-center gap-2 shrink-0 bg-bg-accent/50 rounded-lg p-1">
              <StatusIndicator state={state} />

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
                    state === "paused" ? "Resume autonomy" : "Pause autonomy"
                  }
                  shortcut="Space"
                >
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    aria-label={
                      state === "paused" ? "Resume autonomy" : "Pause autonomy"
                    }
                    className={`${iconBtnBase} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                    disabled={pauseResumeDisabled}
                  >
                    {pauseResumeBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : state === "paused" ? (
                      <Play className="w-5 h-5" />
                    ) : (
                      <Pause className="w-5 h-5" />
                    )}
                  </button>
                </IconButtonTooltip>
              )}

              {/* Restart Button */}
              <IconButtonTooltip label="Restart agent" shortcut="Ctrl+R">
                <button
                  type="button"
                  onClick={handleRestart}
                  aria-label="Restart agent"
                  disabled={lifecycleBusy || state === "restarting"}
                  className="inline-flex items-center justify-center h-9 px-3 border border-border bg-bg text-[11px] sm:text-xs font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-md"
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
              </IconButtonTooltip>
            </div>

            {/* Bug Report */}
            <IconButtonTooltip label="Report a bug" shortcut="Shift+?">
              <button
                type="button"
                onClick={openBugReport}
                aria-label="Report a bug"
                className={iconBtnBase}
              >
                <Bug className="w-5 h-5" />
              </button>
            </IconButtonTooltip>

            {/* Wallet Dropdown */}
            {(evmShort || solShort) && (
              <div className="wallet-wrapper relative inline-flex shrink-0 group">
                <IconButtonTooltip label="View wallets">
                  <button
                    type="button"
                    onClick={() => setTab("wallets")}
                    aria-label="Open wallets"
                    className={iconBtnBase}
                  >
                    <Wallet className="w-5 h-5" />
                  </button>
                </IconButtonTooltip>

                {/* Wallet Dropdown */}
                <div className="wallet-tooltip hidden group-hover:block group-focus-within:block absolute top-full right-0 mt-2 p-3 border border-border bg-bg-elevated z-50 min-w-[300px] shadow-xl rounded-lg">
                  <div className="text-[11px] text-muted uppercase tracking-wide mb-2 px-1">
                    Wallet Addresses
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
                          <span className="text-ok">Copied!</span>
                        ) : (
                          "Copy"
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
                          <span className="text-ok">Copied!</span>
                        ) : (
                          "Copy"
                        )}
                      </button>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted text-center">
                    Click to manage wallets
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
