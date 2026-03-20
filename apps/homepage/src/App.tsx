import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HeroBackground } from "./components/Hero";

import { releaseData } from "./generated/release-data";

/* ── Icons ─────────────────────────────────────────────────────────── */

function GithubIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <img src="/milady-icon.png" alt="" className="w-5 h-5 object-contain brightness-0 invert opacity-80" />
  );
}

function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 12V5.3l9.5-1.3V12h-9.5zm0 .5H21v7.8l-9.5-1.3v-6.5z" />
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489.037.192.11.398.17.607.062.208.137.424.168.631.032.208.02.406-.069.56-.045.077-.119.136-.232.17-.113.034-.264.044-.47.015z" />
    </svg>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function platformIcon(id: string) {
  if (id.includes("macos")) return <AppleIcon />;
  if (id.includes("windows")) return <WindowsIcon />;
  return <LinuxIcon />;
}

function platformLabel(id: string): string {
  if (id === "macos-arm64") return "macOS (Apple Silicon)";
  if (id === "macos-x64") return "macOS (Intel)";
  if (id.includes("windows")) return "Windows";
  if (id.includes("deb")) return "Linux (.deb)";
  return "Linux";
}

const btnClass =
  "flex items-center gap-2.5 px-6 py-3 text-[11px] sm:text-xs tracking-[0.2em] uppercase font-light border border-white/30 text-white/80 transition-all duration-300 hover:bg-white hover:text-black hover:border-white";

/* ── Download Dropdown ─────────────────────────────────────────────── */

function DownloadDropdown() {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} className={btnClass}>
        <DownloadIcon />
        Download
        <svg className="w-3 h-3 ml-1 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[220px] bg-black/95 border border-white/15 backdrop-blur-xl"
          >
            {releaseData.release.downloads.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-[11px] tracking-[0.1em] uppercase text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                {platformIcon(d.id)}
                <span className="flex-1">{platformLabel(d.id)}</span>
                <span className="text-[9px] text-white/30">{d.sizeLabel}</span>
              </a>
            ))}
            <div className="border-t border-white/10">
              <a
                href={releaseData.release.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-[11px] tracking-[0.1em] uppercase text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                <GithubIcon className="w-4 h-4" />
                All Releases
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Homepage ──────────────────────────────────────────────────────── */

const socialIconClass = "text-white/30 hover:text-white transition-colors duration-300";

export function Homepage() {
  return (
    <div
      id="top"
      className="relative min-h-screen bg-dark text-text-light font-sans selection:bg-brand selection:text-dark"
    >
      {/* 1. Base Dark Background */}
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none" />

      {/* Main scrolling container */}
      <div className="relative w-full">
        {/* LAYER 1: Background Layout (The massive typography, moves with scroll) */}
        <div className="relative z-10 w-full min-h-screen pointer-events-none">
          <HeroBackground />
        </div>

        {/* LAYER 2: Foreground UI */}
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          {/* Social icons at top */}
          <div className="flex justify-center gap-5 pt-5 sm:pt-6 pointer-events-auto">
            <a href="https://github.com/milady-ai/milady" target="_blank" rel="noreferrer" className={socialIconClass} title="GitHub">
              <GithubIcon />
            </a>
            <a href="https://discord.gg/F6ww5WHtsg" target="_blank" rel="noreferrer" className={socialIconClass} title="Discord">
              <DiscordIcon />
            </a>
          </div>

          {/* CTA buttons + install commands at bottom of hero */}
          <div className="w-full min-h-screen flex flex-col items-center justify-end pb-6 sm:pb-10 px-4 pointer-events-auto">
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mb-4">
              <DownloadDropdown />
              <Link to="/dashboard" className={btnClass}>
                <CloudIcon />
                Try Cloud
              </Link>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
