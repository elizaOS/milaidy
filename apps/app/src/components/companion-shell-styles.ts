/**
 * Style helpers and constants for the companion shell overlay.
 */

import type React from "react";
import type { Tab } from "../navigation";

/* ── Overlay tab set ───────────────────────────────────────────────── */

export const COMPANION_OVERLAY_TABS = new Set<Tab>([
  "companion",
  "skills",
  "character",
  "character-select",
  "settings",
  "plugins",
  "advanced",
  "actions",
  "triggers",
  "fine-tuning",
  "trajectories",
  "runtime",
  "database",
  "logs",
  "security",
  "apps",
  "connectors",
  "knowledge",
  "stream",
  "wallets",
]);

/* ── Per-tab accent / color config ─────────────────────────────────── */

export const ACCENT_COLORS: Record<string, string> = {
  skills: "#00e1ff",
  apps: "#10b981",
  plugins: "#f0b232",
  connectors: "#f0b232",
  knowledge: "#a78bfa",
  wallets: "#f0b90b",
  stream: "#ef4444",
};

export const TOP_BAR_COLORS: Record<string, string> = {
  skills: "#00e1ff",
  wallets: "rgba(240, 185, 11, 0.7)",
  stream: "rgba(239, 68, 68, 0.7)",
  plugins: "#f0b232",
  connectors: "#f0b232",
  apps: "rgba(16, 185, 129, 0.7)",
  knowledge: "rgba(167, 139, 250, 0.7)",
};

/* ── Tab flags ─────────────────────────────────────────────────────── */

export function tabFlags(tab: Tab) {
  const isSkills = tab === "skills";
  const isSettings = tab === "settings";
  const isPlugins = tab === "plugins";
  const isStream = tab === "stream";
  const isWallets = tab === "wallets";
  const isApps = tab === "apps";
  const isConnectors = tab === "connectors";
  const isKnowledge = tab === "knowledge";
  const isAdvancedOverlay =
    tab === "advanced" ||
    tab === "actions" ||
    tab === "triggers" ||
    tab === "fine-tuning" ||
    tab === "trajectories" ||
    tab === "runtime" ||
    tab === "database" ||
    tab === "logs" ||
    tab === "security";
  const isPluginsLike = isPlugins || isConnectors;
  const isCentered =
    isSkills ||
    isSettings ||
    isPlugins ||
    isAdvancedOverlay ||
    isApps ||
    isConnectors ||
    isKnowledge ||
    isStream ||
    isWallets;
  const isCharacter = tab === "character" || tab === "character-select";

  return {
    isSkills,
    isSettings,
    isPlugins,
    isStream,
    isWallets,
    isApps,
    isConnectors,
    isKnowledge,
    isAdvancedOverlay,
    isPluginsLike,
    isCentered,
    isCharacter,
  };
}

export type TabFlags = ReturnType<typeof tabFlags>;

/* ── Layout helpers ────────────────────────────────────────────────── */

export function overlayBackdropClass(f: TabFlags) {
  if (f.isSkills)
    return "opacity-100 backdrop-blur-2xl bg-black/60 pointer-events-auto";
  if (f.isPluginsLike)
    return "opacity-100 backdrop-blur-xl bg-black/55 pointer-events-auto";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isStream ||
    f.isWallets
  )
    return "opacity-100 backdrop-blur-2xl bg-black/65 pointer-events-auto";
  if (f.isCharacter) return "opacity-100";
  return "opacity-0";
}

export function cardSizeClass(f: TabFlags) {
  if (f.isSkills)
    return "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl";
  if (f.isPluginsLike)
    return "w-[97vw] h-[92vh] md:w-[88vw] md:h-[80vh] max-w-[1460px] overflow-visible";
  if (f.isAdvancedOverlay)
    return "w-[95vw] h-[95vh] max-w-[1500px] backdrop-blur-3xl border rounded-2xl overflow-hidden";
  if (f.isSettings || f.isApps || f.isKnowledge || f.isWallets)
    return "w-[90vw] h-[90vh] max-w-5xl backdrop-blur-3xl border rounded-2xl overflow-hidden";
  return "w-[65vw] min-w-[700px] h-[100vh] border-l backdrop-blur-2xl";
}

export function cardBackground(f: TabFlags) {
  if (f.isSkills) return "rgba(16, 20, 30, 0.95)";
  if (f.isPluginsLike) return "transparent";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "rgba(12, 16, 26, 0.97)";
  return "linear-gradient(to left, rgba(5, 7, 12, 0.98) 42%, rgba(5, 7, 12, 0.9) 78%, rgba(5, 7, 12, 0.72) 100%)";
}

export function cardBorderColor(f: TabFlags) {
  if (f.isSkills) return "rgba(0,225,255,0.2)";
  if (f.isPluginsLike) return "transparent";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "rgba(255, 255, 255, 0.08)";
  return "rgba(255,255,255,0.05)";
}

export function cardBoxShadow(f: TabFlags, shadowFx: string) {
  if (f.isSkills) return shadowFx;
  if (f.isPluginsLike) return "none";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isKnowledge ||
    f.isWallets
  )
    return "0 8px 60px rgba(0,0,0,0.6), 0 2px 24px rgba(0,0,0,0.4)";
  return "-60px 0 100px -20px rgba(0,0,0,0.8)";
}

/* ── Accent color helpers ──────────────────────────────────────────── */

export function accentVar(f: TabFlags) {
  if (f.isPluginsLike) return "#f0b232";
  if (f.isApps) return "#10b981";
  if (f.isKnowledge) return "#a78bfa";
  if (f.isWallets) return "#f0b90b";
  if (f.isStream) return "#ef4444";
  return "#7b8fb5";
}

export function accentSubtleVar(f: TabFlags) {
  if (f.isPluginsLike) return "rgba(240, 178, 50, 0.12)";
  if (f.isApps) return "rgba(16, 185, 129, 0.12)";
  if (f.isKnowledge) return "rgba(167, 139, 250, 0.12)";
  if (f.isWallets) return "rgba(240, 185, 11, 0.12)";
  if (f.isStream) return "rgba(239, 68, 68, 0.12)";
  return "rgba(123, 143, 181, 0.12)";
}

export function accentRgbVar(f: TabFlags) {
  if (f.isPluginsLike) return "240, 178, 50";
  if (f.isApps) return "16, 185, 129";
  if (f.isKnowledge) return "167, 139, 250";
  if (f.isWallets) return "240, 185, 11";
  if (f.isStream) return "239, 68, 68";
  return "123, 143, 181";
}

/* ── View wrapper helpers ──────────────────────────────────────────── */

export function viewWrapperOverflow(f: TabFlags) {
  if (f.isPluginsLike) return "overflow-visible";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isWallets
  )
    return "overflow-hidden";
  return "overflow-y-auto";
}

export function viewWrapperPadding(f: TabFlags) {
  if (f.isSkills) return "px-10 pb-10 pt-4";
  if (
    f.isSettings ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isPlugins ||
    f.isWallets
  )
    return "p-0";
  if (f.isKnowledge) return "px-8 py-8";
  return "px-16 pt-32 pb-16";
}

export function viewWrapperStyle(
  f: TabFlags,
  accentColor: string,
): React.CSSProperties {
  if (
    f.isSettings ||
    f.isPlugins ||
    f.isAdvancedOverlay ||
    f.isApps ||
    f.isConnectors ||
    f.isKnowledge ||
    f.isWallets
  ) {
    return {
      "--bg": "transparent",
      "--card": "rgba(12, 16, 26, 0.88)",
      "--border": "rgba(255, 255, 255, 0.12)",
      "--accent": accentVar(f),
      "--accent-foreground": "#ffffff",
      "--accent-subtle": accentSubtleVar(f),
      "--accent-rgb": accentRgbVar(f),
      "--muted": "rgba(255, 255, 255, 0.58)",
      "--txt": "rgba(240, 238, 250, 0.92)",
      "--text": "rgba(240, 238, 250, 0.92)",
      "--danger": "#ef4444",
      "--ok": "#22c55e",
      "--warning": "#f59e0b",
      "--surface": "rgba(15, 20, 32, 0.94)",
      "--bg-hover": "rgba(255, 255, 255, 0.08)",
      "--bg-muted": "rgba(18, 24, 36, 0.78)",
      "--border-hover": "rgba(255, 255, 255, 0.2)",
    } as React.CSSProperties;
  }
  return {
    "--bg": "transparent",
    "--card": f.isSkills ? "rgba(255, 255, 255, 0.05)" : "transparent",
    "--border": f.isSkills ? "rgba(0,225,255,0.3)" : "rgba(255,255,255,0.08)",
    "--accent": accentColor,
    "--accent-foreground": f.isSkills ? "#000000" : "#ffffff",
    "--muted": "rgba(255, 255, 255, 0.55)",
    "--txt": "#ffffff",
  } as React.CSSProperties;
}
