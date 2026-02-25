/**
 * Navigation — tabs + onboarding.
 */

/** Apps are only enabled in dev mode; production builds hide this feature. */
export const APPS_ENABLED = import.meta.env.DEV;

export type Tab =
  | "chat"
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
  | "lifo"
  | "settings"
  | "logs"
  | "security";

const ALL_TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] as Tab[] },
  { label: "Character", tabs: ["character"] as Tab[] },
  { label: "Wallets", tabs: ["wallets"] as Tab[] },
  { label: "Knowledge", tabs: ["knowledge"] as Tab[] },
  { label: "Social", tabs: ["connectors"] as Tab[] },
  { label: "Apps", tabs: ["apps"] as Tab[] },
  { label: "Settings", tabs: ["settings"] as Tab[] },
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
      "lifo",
      "logs",
      "security",
    ] as Tab[],
  },
] as const;

export const TAB_GROUPS = APPS_ENABLED
  ? ALL_TAB_GROUPS
  : ALL_TAB_GROUPS.filter((g) => g.label !== "Apps");

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
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
  lifo: "/lifo",
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
    case "lifo":
      return "Lifo";
    case "settings":
      return "Settings";
    case "logs":
      return "Logs";
    case "security":
      return "Security";
    default:
      return "Milady";
  }
}
