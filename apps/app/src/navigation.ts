/**
 * Navigation — tabs + onboarding.
 */

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Brain,
  Gamepad2,
  MessageSquare,
  Radio,
  Settings,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react";

/** Apps tab — always enabled when running from source. */
export const APPS_ENABLED = true;

/** Stream tab — enable to show the retake.tv streaming view.
 *  Set VITE_STREAM_ENABLED=true in env to show the Stream tab. */
export const STREAM_ENABLED =
  import.meta.env?.VITE_STREAM_ENABLED === "true";

export type Tab =
  | "chat"
  | "stream"
  | "apps"
  | "character"
  | "wallets"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "actions"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "voice"
  | "runtime"
  | "database"
  | "settings"
  | "logs"
  | "security";

export interface TabGroup {
  label: string;
  tabs: Tab[];
  icon: LucideIcon;
  description?: string;
}

const ALL_TAB_GROUPS: TabGroup[] = [
  {
    label: "Chat",
    tabs: ["chat"],
    icon: MessageSquare,
    description: "Conversations and messaging",
  },
  {
    label: "Stream",
    tabs: ["stream"],
    icon: Radio,
    description: "Live streaming controls",
  },
  {
    label: "Character",
    tabs: ["character"],
    icon: Bot,
    description: "AI personality and behavior",
  },
  {
    label: "Wallets",
    tabs: ["wallets"],
    icon: Wallet,
    description: "Crypto wallets and inventory",
  },
  {
    label: "Knowledge",
    tabs: ["knowledge"],
    icon: Brain,
    description: "Documents and memory",
  },
  {
    label: "Social",
    tabs: ["connectors"],
    icon: Share2,
    description: "Platform connections",
  },
  {
    label: "Apps",
    tabs: ["apps"],
    icon: Gamepad2,
    description: "Games and integrations",
  },
  {
    label: "Settings",
    tabs: ["settings"],
    icon: Settings,
    description: "Configuration and preferences",
  },
  {
    label: "Advanced",
    tabs: [
      "advanced",
      "plugins",
      "skills",
      "actions",
      "triggers",
      "fine-tuning",
      "trajectories",
      "runtime",
      "database",
      "logs",
      "security",
    ],
    icon: Sparkles,
    description: "Developer and power user tools",
  },
];

export const TAB_GROUPS = ALL_TAB_GROUPS.filter(
  (g) =>
    (APPS_ENABLED || g.label !== "Apps") &&
    (STREAM_ENABLED || g.label !== "Stream"),
);

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
  stream: "/stream",
  apps: "/apps",
  character: "/character",
  triggers: "/triggers",
  wallets: "/wallets",
  knowledge: "/knowledge",
  connectors: "/connectors",
  plugins: "/plugins",
  skills: "/skills",
  actions: "/actions",
  advanced: "/advanced",
  "fine-tuning": "/fine-tuning",
  trajectories: "/trajectories",
  voice: "/voice",
  runtime: "/runtime",
  database: "/database",
  settings: "/settings",
  logs: "/logs",
  security: "/security",
};

/** Legacy path redirects — old paths that now map to new tabs. */
const LEGACY_PATHS: Record<string, Tab> = {
  "/game": "apps",
  "/agent": "character",
  "/inventory": "wallets",
  "/features": "plugins",
  "/admin": "advanced",
  "/config": "settings",
  "/triggers": "triggers",
};

const PATH_TO_TAB = new Map(
  Object.entries(TAB_PATHS).map(([tab, p]) => [p, tab as Tab]),
);

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const p = TAB_PATHS[tab];
  return base ? `${base}${p}` : p;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let p = pathname || "/";
  if (base) {
    if (p === base) p = "/";
    else if (p.startsWith(`${base}/`)) p = p.slice(base.length);
  }
  let normalized = normalizePath(p).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  if (normalized === "/") return "chat";
  if (normalized === "/voice") return "settings";
  // Apps disabled in production builds — redirect to chat
  if (!APPS_ENABLED && (normalized === "/apps" || normalized === "/game")) {
    return "chat";
  }
  // Stream tab hidden — redirect to chat
  if (!STREAM_ENABLED && normalized === "/stream") {
    return "chat";
  }
  // Check current paths first, then legacy redirects
  return PATH_TO_TAB.get(normalized) ?? LEGACY_PATHS[normalized] ?? null;
}

function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function normalizePath(p: string): string {
  if (!p) return "/";
  let normalized = p.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "chat":
      return "Chat";
    case "apps":
      return "Apps";
    case "character":
      return "Character";
    case "triggers":
      return "Triggers";
    case "wallets":
      return "Wallets";
    case "knowledge":
      return "Knowledge";
    case "connectors":
      return "Social";
    case "plugins":
      return "Plugins";
    case "skills":
      return "Skills";
    case "actions":
      return "Actions";
    case "advanced":
      return "Advanced";
    case "fine-tuning":
      return "Fine-Tuning";
    case "trajectories":
      return "Trajectories";
    case "voice":
      return "Voice";
    case "runtime":
      return "Runtime";
    case "database":
      return "Databases";
    case "settings":
      return "Settings";
    case "logs":
      return "Logs";
    case "stream":
      return "Stream";
    case "security":
      return "Security";
    default:
      return "Milady";
  }
}
