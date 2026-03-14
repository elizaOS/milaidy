import type { Tab } from "@milady/app-core/navigation";
import {
  Book,
  Bug,
  Code,
  Phone,
  Settings,
  Star,
  User,
  Wallet,
} from "lucide-react";
import type React from "react";
import type { TranslatorFn } from "./walletUtils";

export function CompanionHubNav({
  setTab,
  t,
}: {
  setTab: (tab: Tab) => void;
  t: TranslatorFn;
}) {
  return (
    <nav className="flex flex-col gap-4 items-end">
      {/* Character */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("character")}
          style={
            {
              "--ac-accent": "#f97316", // orange
              "--ac-accent-rgb": "249, 115, 22",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <User className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.character")}
        </span>
      </div>

      {/* Talents */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("skills")}
          style={
            {
              "--ac-accent": "#00e1ff",
              "--ac-accent-rgb": "0, 225, 255",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Star className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.talents")}
        </span>
      </div>

      {/* Knowledge */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("knowledge")}
          style={
            {
              "--ac-accent": "#a78bfa",
              "--ac-accent-rgb": "167, 139, 250",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Book className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.knowledge")}
        </span>
      </div>

      {/* Channels */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("connectors")}
          style={
            {
              "--ac-accent": "#f43f5e",
              "--ac-accent-rgb": "244, 63, 94",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Phone className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.channels")}
        </span>
      </div>

      {/* Plugins */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("plugins")}
          style={
            {
              "--ac-accent": "#f0b232",
              "--ac-accent-rgb": "240, 178, 50",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Bug className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.plugins")}
        </span>
      </div>

      {/* Apps — commented out, will be re-enabled later
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("apps")}
          style={
            {
              "--ac-accent": "#10b981",
              "--ac-accent-rgb": "16, 185, 129" } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <LayoutGrid className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">{t("nav.apps")}</span>
      </div>
      */}

      {/* Wallets */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("wallets")}
          style={
            {
              "--ac-accent": "#f0b90b",
              "--ac-accent-rgb": "240, 185, 11",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Wallet className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.wallets") || "Wallets"}
        </span>
      </div>

      {/* Stream — commented out, will be re-enabled later
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("stream")}
          style={
            {
              "--ac-accent": "#ef4444",
              "--ac-accent-rgb": "239, 68, 68" } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Eye className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">{t("nav.stream") || "Stream"}</span>
      </div>
      */}

      {/* LIFO Sandbox — commented out, will be re-enabled later
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("lifo")}
          style={
            {
              "--ac-accent": "#8b5cf6",
              "--ac-accent-rgb": "139, 92, 246" } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Terminal className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">{t("nav.lifo") || "LIFO"}</span>
      </div>
      */}

      {/* Settings */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("settings")}
          style={
            {
              "--ac-accent": "#e2e8f0",
              "--ac-accent-rgb": "226, 232, 240",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Settings className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.settings")}
        </span>
      </div>

      {/* Advanced */}
      <div className="flex flex-row-reverse items-center gap-3 group">
        <button
          type="button"
          className="cursor-pointer flex items-center justify-center w-[56px] h-[56px] rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(56,189,248,0.2)] focus:outline-none focus:ring-2 focus:ring-sky-400/50 relative overflow-hidden"
          onClick={() => setTab("advanced")}
          style={
            {
              "--ac-accent": "#38bdf8",
              "--ac-accent-rgb": "56, 189, 248",
            } as React.CSSProperties
          }
        >
          <div className="text-white/60 transition-colors duration-300 group-hover:text-sky-300 drop-shadow-md">
            <Code className="w-6 h-6" strokeWidth={1.5} />
          </div>
        </button>
        <span className="text-[10px] sm:text-xs font-bold tracking-widest text-white/50 uppercase transition-colors duration-300 group-hover:text-white drop-shadow-md leading-none text-right">
          {t("nav.advanced")}
        </span>
      </div>
    </nav>
  );
}
