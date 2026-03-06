/**
 * Decorative elements and close button for the companion shell overlay.
 */

import type { Tab } from "../navigation";
import type { TabFlags } from "./companion-shell-styles";

/* ── Decorative elements per tab ───────────────────────────────────── */

export function DecorativeElements({
  f,
  accentColor,
}: {
  tab: Tab;
  f: TabFlags;
  accentColor: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${f.isPluginsLike ? "" : "rounded-[16px]"}`}
    >
      {f.isSkills && (
        <>
          <div
            className={`absolute bottom-4 left-4 text-[${accentColor}]/30 text-[9px] font-mono tracking-widest transform -rotate-90 origin-bottom-left`}
          >
            V.1.0.4_NEURAL_UPLINK
          </div>
          <div
            className={`absolute top-[20%] right-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`}
          />
          <div
            className={`absolute bottom-[20%] left-0 w-[2px] h-[100px] bg-gradient-to-b from-transparent via-[${accentColor}] to-transparent opacity-50`}
          />
        </>
      )}
      {f.isSettings && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-white/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-white/15" />
          <div className="absolute bottom-3 right-4 text-white/15 text-[9px] font-mono tracking-widest">
            CFG.PANEL_V2
          </div>
        </>
      )}
      {f.isAdvancedOverlay && !f.isLifo && !f.isStream && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-white/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-white/15" />
          <div className="absolute bottom-3 right-4 text-white/15 text-[9px] font-mono tracking-widest">
            ADV.PANEL_V1
          </div>
        </>
      )}
      {f.isLifo && (
        <>
          <div className="absolute top-[12%] right-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#8b5cf6]/25 to-transparent" />
          <div className="absolute bottom-[12%] left-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#8b5cf6]/25 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-[#8b5cf6]/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-[#8b5cf6]/15" />
          <div className="absolute bottom-3 right-4 text-[#8b5cf6]/20 text-[9px] font-mono tracking-widest">
            LIFO.SANDBOX_V1
          </div>
        </>
      )}
      {f.isStream && (
        <>
          <div className="absolute top-[12%] right-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
          <div className="absolute bottom-[12%] left-0 w-[1.5px] h-[100px] bg-gradient-to-b from-transparent via-[#ef4444]/25 to-transparent" />
          <div className="absolute top-3 right-4 text-[#ef4444]/20 text-[9px] font-mono tracking-widest">
            STREAM.LIVE_V1
          </div>
        </>
      )}
      {f.isKnowledge && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#a78bfa]/20 to-transparent" />
          <div className="absolute bottom-3 right-4 text-[#a78bfa]/20 text-[9px] font-mono tracking-widest">
            KNOW.BASE_V1
          </div>
        </>
      )}
      {f.isWallets && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#f0b90b]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#f0b90b]/20 to-transparent" />
          <div className="absolute bottom-3 left-3 w-[20px] h-[1px] bg-[#f0b90b]/15" />
          <div className="absolute bottom-3 left-3 w-[1px] h-[20px] bg-[#f0b90b]/15" />
          <div className="absolute bottom-3 right-4 text-[#f0b90b]/20 text-[9px] font-mono tracking-widest">
            WALLET.BSC_V1
          </div>
        </>
      )}
      {f.isApps && (
        <>
          <div className="absolute top-[15%] right-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
          <div className="absolute bottom-[15%] left-0 w-[1.5px] h-[80px] bg-gradient-to-b from-transparent via-[#10b981]/20 to-transparent" />
          <div className="absolute bottom-3 right-4 text-[#10b981]/20 text-[9px] font-mono tracking-widest">
            APP.PANEL_V1
          </div>
        </>
      )}
      {f.isCharacter && (
        <>
          <div className="absolute top-6 left-10 flex flex-col">
            <div className="text-white text-2xl font-semibold tracking-wide flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
              Agent Details
            </div>
          </div>
          <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full border border-white/5 opacity-50 pointer-events-none" />
          <div className="absolute top-[5%] right-[5%] w-[20vw] h-[20vw] rounded-full border border-[#d4af37]/10 opacity-30 pointer-events-none" />
        </>
      )}
    </div>
  );
}

/* ── Close button (X) ──────────────────────────────────────────────── */

export function CloseButton({
  centered,
  onClick,
}: {
  centered: boolean;
  onClick: () => void;
}) {
  if (centered) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Close"
        className="absolute top-4 right-4 z-50 p-2 rounded-full text-white/50 hover:text-white bg-white/5 hover:bg-white/12 border border-white/10 hover:border-white/25 shadow-[0_0_15px_rgba(0,0,0,0.5)] w-9 h-9 transition-all flex items-center justify-center"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute z-50 top-6 right-6 p-2 rounded-full text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)] w-10 h-10 transition-all flex items-center justify-center"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
