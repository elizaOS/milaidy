import { useApp } from "../AppContext.js";

export function Header() {
  const {
    agentStatus, cloudConnected, cloudCredits, cloudCreditsCritical, cloudCreditsLow,
    cloudTopUpUrl, walletAddresses, handleStart, handleStop, handlePauseResume,
    handleRestart, openCommandPalette, copyToClipboard, setTab,
  } = useApp();

  const name = agentStatus?.agentName ?? "Milaidy";
  const state = agentStatus?.state ?? "not_started";

  const stateColor = state === "running" ? "text-ok border-ok" :
    state === "paused" || state === "restarting" ? "text-warn border-warn" :
    state === "error" ? "text-danger border-danger" : "text-muted border-muted";

  const creditColor = cloudCreditsCritical ? "border-danger text-danger" :
    cloudCreditsLow ? "border-warn text-warn" : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 6)}...${walletAddresses.evmAddress.slice(-4)}` : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}` : null;

  const iconBtn = "inline-flex items-center justify-center w-7 h-7 border border-border bg-bg cursor-pointer text-sm leading-none hover:border-accent hover:text-accent transition-colors";

  return (
    <header className="flex items-center justify-between border-b border-border py-4 px-5">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-txt-strong">{name}</span>
        {cloudConnected && cloudCredits !== null && (
          <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 border font-mono text-xs no-underline transition-colors hover:border-accent hover:text-accent ${creditColor}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            ${cloudCredits.toFixed(2)}
          </a>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center h-7 px-2.5 border font-mono text-xs leading-none ${stateColor}`}>{state}</span>
          {state === "not_started" || state === "stopped" ? (
            <button onClick={handleStart} title="Start agent" className={iconBtn}>▶️</button>
          ) : state === "restarting" ? (
            <span className="inline-flex items-center justify-center w-7 h-7 text-sm leading-none opacity-60">🔄</span>
          ) : state === "paused" ? (
            <button onClick={handlePauseResume} title="Resume agent" className={iconBtn}>▶️</button>
          ) : (
            <button onClick={handleStop} title="Stop agent" className={iconBtn}>⏹️</button>
          )}
          <button onClick={handleRestart} disabled={state === "restarting" || state === "not_started"} title="Restart agent"
            className="inline-flex items-center h-7 px-3 border border-border bg-bg text-xs font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Restart</button>
        </div>
        <button onClick={openCommandPalette} className="inline-flex items-center h-7 px-3 border border-border bg-bg text-xs font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors">Cmd+K</button>
        {(evmShort || solShort) && (
          <div className="wallet-wrapper relative inline-flex">
            <button onClick={() => setTab("inventory")} className="inline-flex items-center justify-center w-7 h-7 border border-border bg-bg cursor-pointer hover:border-accent hover:text-accent transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
            </button>
            <div className="wallet-tooltip hidden absolute top-full right-0 mt-2 p-3 border border-border bg-bg z-50 min-w-[280px] shadow-lg">
              {evmShort && (
                <div className="flex items-center gap-2 text-xs py-1">
                  <span className="font-bold font-mono min-w-[30px]">EVM</span>
                  <code className="font-mono flex-1 truncate">{evmShort}</code>
                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(walletAddresses!.evmAddress!); }}
                    className="px-1.5 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent">copy</button>
                </div>
              )}
              {solShort && (
                <div className="flex items-center gap-2 text-xs py-1 border-t border-border">
                  <span className="font-bold font-mono min-w-[30px]">SOL</span>
                  <code className="font-mono flex-1 truncate">{solShort}</code>
                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(walletAddresses!.solanaAddress!); }}
                    className="px-1.5 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent">copy</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
