/**
 * Navigation registry — tabs, nav groups, and legacy path compatibility.
 */

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Brain,
  Gamepad2,
  Heart,
  MessageSquare,
  Radio,
  Settings,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react";

/** Apps are only enabled in dev mode; production builds hide this feature. */
export const APPS_ENABLED = import.meta.env.DEV;

/** Stream tab — enabled when the "streaming-base" plugin is active (or in dev mode). */
export const STREAM_ENABLED = import.meta.env.DEV;

/**
 * Companion tab — enabled by default since the VRM companion UI launch.
 * Previously opt-in; now opt-out via VITE_ENABLE_COMPANION_MODE=false.
 */
export const COMPANION_ENABLED =
  String(import.meta.env.VITE_ENABLE_COMPANION_MODE ?? "true").toLowerCase() !==
  "false";

export type Tab =
  | "chat"
  | "companion"
  | "stream"
  | "apps"
  | "character"
  | "character-select"
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
  | "lifo"
  | "settings"
  | "logs"
  | "security";

export type NavigationFeature = "apps" | "companion" | "stream";

export type NavGroupId =
  | "chat"
  | "companion"
  | "stream"
  | "character"
  | "wallets"
  | "knowledge"
  | "social"
  | "apps"
  | "settings"
  | "advanced";

export interface TabRegistryEntry {
  id: Tab;
  path: string;
  title: string;
  navGroup: NavGroupId;
  paletteLabel: string;
  aliases: string[];
  keywords: string[];
  restoreKey: string;
  feature?: NavigationFeature;
  hidden?: boolean;
}

export interface TabGroup {
  id?: NavGroupId;
  label: string;
  tabs: Tab[];
  icon: LucideIcon;
  description?: string;
}

interface NavGroupDefinition extends Omit<TabGroup, "tabs"> {
  id: NavGroupId;
  feature?: NavigationFeature;
}

const NAV_GROUP_DEFINITIONS: ReadonlyArray<NavGroupDefinition> = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    description: "Conversations and messaging",
  },
  {
    id: "companion",
    label: "Companion",
    icon: Heart,
    description: "Companion mode (feature flag)",
    feature: "companion",
  },
  {
    id: "stream",
    label: "Stream",
    icon: Radio,
    description: "Live streaming controls",
    feature: "stream",
  },
  {
    id: "character",
    label: "Character",
    icon: Bot,
    description: "AI personality and behavior",
  },
  {
    id: "wallets",
    label: "Wallets",
    icon: Wallet,
    description: "Crypto wallets and inventory",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: Brain,
    description: "Documents and memory",
  },
  {
    id: "social",
    label: "Social",
    icon: Share2,
    description: "Platform connections",
  },
  {
    id: "apps",
    label: "Apps",
    icon: Gamepad2,
    description: "Games and integrations",
    feature: "apps",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    description: "Configuration and preferences",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: Sparkles,
    description: "Developer and power user tools",
  },
];

export const TAB_REGISTRY: Readonly<Record<Tab, TabRegistryEntry>> = {
  chat: {
    id: "chat",
    path: "/chat",
    title: "Chat",
    navGroup: "chat",
    paletteLabel: "Open Chat",
    aliases: ["inbox", "conversation", "messages"],
    keywords: ["dm", "composer", "assistant", "home"],
    restoreKey: "milady:shell-panels:chat",
  },
  companion: {
    id: "companion",
    path: "/companion",
    title: "Companion",
    navGroup: "companion",
    paletteLabel: "Open Companion",
    aliases: ["avatar", "overlay"],
    keywords: ["companion mode", "vrm", "shell"],
    restoreKey: "milady:shell-panels:companion",
    feature: "companion",
  },
  stream: {
    id: "stream",
    path: "/stream",
    title: "Stream",
    navGroup: "stream",
    paletteLabel: "Open Stream",
    aliases: ["live", "broadcast"],
    keywords: ["streaming", "video", "capture"],
    restoreKey: "milady:shell-panels:stream",
    feature: "stream",
  },
  apps: {
    id: "apps",
    path: "/apps",
    title: "Apps",
    navGroup: "apps",
    paletteLabel: "Open Apps",
    aliases: ["games", "game"],
    keywords: ["viewer", "integrations", "arcade"],
    restoreKey: "milady:shell-panels:apps",
    feature: "apps",
  },
  character: {
    id: "character",
    path: "/character",
    title: "Character",
    navGroup: "character",
    paletteLabel: "Open Character",
    aliases: ["persona", "profile"],
    keywords: ["agent", "identity", "avatar"],
    restoreKey: "milady:shell-panels:character",
  },
  "character-select": {
    id: "character-select",
    path: "/character-select",
    title: "Character Select",
    navGroup: "character",
    paletteLabel: "Open Character Select",
    aliases: ["avatar select"],
    keywords: ["persona", "picker"],
    restoreKey: "milady:shell-panels:character-select",
    hidden: true,
  },
  wallets: {
    id: "wallets",
    path: "/wallets",
    title: "Wallets",
    navGroup: "wallets",
    paletteLabel: "Open Wallets",
    aliases: ["inventory", "assets"],
    keywords: ["balances", "tokens", "nfts"],
    restoreKey: "milady:shell-panels:wallets",
  },
  knowledge: {
    id: "knowledge",
    path: "/knowledge",
    title: "Knowledge",
    navGroup: "knowledge",
    paletteLabel: "Open Knowledge",
    aliases: ["memory", "docs"],
    keywords: ["files", "search", "context"],
    restoreKey: "milady:shell-panels:knowledge",
  },
  connectors: {
    id: "connectors",
    path: "/connectors",
    title: "Social",
    navGroup: "social",
    paletteLabel: "Open Social",
    aliases: ["social", "connectors"],
    keywords: ["platforms", "connections", "accounts"],
    restoreKey: "milady:shell-panels:connectors",
  },
  triggers: {
    id: "triggers",
    path: "/triggers",
    title: "Triggers",
    navGroup: "advanced",
    paletteLabel: "Open Triggers",
    aliases: ["automation"],
    keywords: ["schedule", "jobs", "rules"],
    restoreKey: "milady:shell-panels:triggers",
  },
  plugins: {
    id: "plugins",
    path: "/plugins",
    title: "Plugins",
    navGroup: "advanced",
    paletteLabel: "Open Plugins",
    aliases: ["features"],
    keywords: ["extensions", "capabilities"],
    restoreKey: "milady:shell-panels:plugins",
  },
  skills: {
    id: "skills",
    path: "/skills",
    title: "Skills",
    navGroup: "advanced",
    paletteLabel: "Open Skills",
    aliases: ["abilities"],
    keywords: ["catalog", "prompting", "tools"],
    restoreKey: "milady:shell-panels:skills",
  },
  actions: {
    id: "actions",
    path: "/actions",
    title: "Actions",
    navGroup: "advanced",
    paletteLabel: "Open Actions",
    aliases: ["custom actions"],
    keywords: ["commands", "automation"],
    restoreKey: "milady:shell-panels:actions",
  },
  advanced: {
    id: "advanced",
    path: "/advanced",
    title: "Advanced",
    navGroup: "advanced",
    paletteLabel: "Open Advanced",
    aliases: ["admin"],
    keywords: ["developer", "tools", "power user"],
    restoreKey: "milady:shell-panels:advanced",
  },
  "fine-tuning": {
    id: "fine-tuning",
    path: "/fine-tuning",
    title: "Fine-Tuning",
    navGroup: "advanced",
    paletteLabel: "Open Fine-Tuning",
    aliases: ["training"],
    keywords: ["datasets", "models"],
    restoreKey: "milady:shell-panels:fine-tuning",
  },
  trajectories: {
    id: "trajectories",
    path: "/trajectories",
    title: "Trajectories",
    navGroup: "advanced",
    paletteLabel: "Open Trajectories",
    aliases: ["llm calls"],
    keywords: ["history", "analysis", "tokens"],
    restoreKey: "milady:shell-panels:trajectories",
  },
  voice: {
    id: "voice",
    path: "/voice",
    title: "Voice",
    navGroup: "settings",
    paletteLabel: "Open Voice",
    aliases: ["tts", "speech"],
    keywords: ["microphone", "audio", "voice settings"],
    restoreKey: "milady:shell-panels:voice",
    hidden: true,
  },
  runtime: {
    id: "runtime",
    path: "/runtime",
    title: "Runtime",
    navGroup: "advanced",
    paletteLabel: "Open Runtime",
    aliases: ["inspect"],
    keywords: ["objects", "internals"],
    restoreKey: "milady:shell-panels:runtime",
  },
  database: {
    id: "database",
    path: "/database",
    title: "Databases",
    navGroup: "advanced",
    paletteLabel: "Open Database",
    aliases: ["db", "tables"],
    keywords: ["vectors", "media", "storage"],
    restoreKey: "milady:shell-panels:database",
  },
  lifo: {
    id: "lifo",
    path: "/lifo",
    title: "Lifo",
    navGroup: "advanced",
    paletteLabel: "Open Lifo",
    aliases: ["sandbox"],
    keywords: ["terminal", "shell", "files"],
    restoreKey: "milady:shell-panels:lifo",
  },
  settings: {
    id: "settings",
    path: "/settings",
    title: "Settings",
    navGroup: "settings",
    paletteLabel: "Open Settings",
    aliases: ["config", "preferences"],
    keywords: ["setup", "options"],
    restoreKey: "milady:shell-panels:settings",
  },
  logs: {
    id: "logs",
    path: "/logs",
    title: "Logs",
    navGroup: "advanced",
    paletteLabel: "Open Logs",
    aliases: ["console"],
    keywords: ["runtime logs", "errors", "debugging"],
    restoreKey: "milady:shell-panels:logs",
  },
  security: {
    id: "security",
    path: "/security",
    title: "Security",
    navGroup: "advanced",
    paletteLabel: "Open Security",
    aliases: ["audit"],
    keywords: ["sandbox", "policies", "risk"],
    restoreKey: "milady:shell-panels:security",
  },
} as const;

const LEGACY_PATHS: Readonly<Record<string, Tab>> = {
  "/admin": "advanced",
  "/agent": "character",
  "/config": "settings",
  "/features": "plugins",
  "/game": "apps",
  "/inventory": "wallets",
  "/triggers": "triggers",
};

const PATH_TO_TAB = new Map(
  Object.values(TAB_REGISTRY).map((entry) => [entry.path, entry.id]),
);

function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function normalizePath(path: string): string {
  if (!path) return "/";
  let normalized = path.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isFeatureEnabled(feature: NavigationFeature | undefined, streamEnabled: boolean): boolean {
  if (!feature) return true;
  if (feature === "apps") return APPS_ENABLED;
  if (feature === "companion") return COMPANION_ENABLED;
  return streamEnabled;
}

export function getTabMeta(tab: Tab): TabRegistryEntry {
  return TAB_REGISTRY[tab];
}

export function isTabVisible(
  tab: Tab,
  streamEnabled = STREAM_ENABLED,
  includeHidden = false,
): boolean {
  const entry = getTabMeta(tab);
  if (!isFeatureEnabled(entry.feature, streamEnabled)) return false;
  return includeHidden ? true : !entry.hidden;
}

export function getTabRegistry(options?: {
  streamEnabled?: boolean;
  includeHidden?: boolean;
}): TabRegistryEntry[] {
  const streamEnabled = options?.streamEnabled ?? STREAM_ENABLED;
  const includeHidden = options?.includeHidden ?? false;
  return Object.values(TAB_REGISTRY).filter((entry) =>
    isTabVisible(entry.id, streamEnabled, includeHidden),
  );
}

export const ALL_TAB_GROUPS: TabGroup[] = NAV_GROUP_DEFINITIONS.map((group) => ({
  id: group.id,
  label: group.label,
  icon: group.icon,
  description: group.description,
  tabs: Object.values(TAB_REGISTRY)
    .filter((entry) => entry.navGroup === group.id)
    .map((entry) => entry.id),
}));

/** Compute visible tab groups. Pass streamEnabled explicitly for React reactivity. */
export function getTabGroups(streamEnabled = STREAM_ENABLED): TabGroup[] {
  return NAV_GROUP_DEFINITIONS.filter((group) =>
    isFeatureEnabled(group.feature, streamEnabled),
  ).map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    description: group.description,
    tabs: Object.values(TAB_REGISTRY)
      .filter(
        (entry) =>
          entry.navGroup === group.id && isTabVisible(entry.id, streamEnabled),
      )
      .map((entry) => entry.id),
  }));
}

export function getPrimaryTabForGroup(groupId: NavGroupId): Tab {
  const group = getTabGroups().find((candidate) => candidate.id === groupId);
  return group?.tabs[0] ?? "chat";
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = getTabMeta(tab).path;
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let currentPath = pathname || "/";
  if (base) {
    if (currentPath === base) currentPath = "/";
    else if (currentPath.startsWith(`${base}/`)) {
      currentPath = currentPath.slice(base.length);
    }
  }

  let normalized = normalizePath(currentPath).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  if (normalized === "/") return "chat";
  if (normalized === "/voice") return "settings";

  const direct = PATH_TO_TAB.get(normalized);
  const resolved = direct ?? LEGACY_PATHS[normalized] ?? null;
  if (!resolved) return null;

  if (!isTabVisible(resolved, STREAM_ENABLED, true)) {
    return "chat";
  }

  return resolved;
}

export function titleForTab(tab: Tab): string {
  return getTabMeta(tab)?.title ?? "Milady";
}
