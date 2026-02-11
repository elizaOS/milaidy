/**
 * Navigation — tabs + onboarding.
 */

export type Tab = "chat" | "apps" | "game" | "inventory" | "features" | "connectors" | "skills" | "triggers" | "character" | "config" | "admin";

export const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] as Tab[] },
  { label: "Play", tabs: ["apps"] as Tab[] },
  { label: "Manage", tabs: ["inventory", "features", "connectors", "skills", "triggers"] as Tab[] },
  { label: "Settings", tabs: ["character", "config", "admin"] as Tab[] },
] as const;

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
  apps: "/apps",
  game: "/game",
  inventory: "/inventory",
  features: "/features",
  connectors: "/connectors",
  skills: "/skills",
  triggers: "/triggers",
  character: "/character",
  config: "/config",
  admin: "/admin",
};

/** Legacy path redirects — old paths that now map to new tabs. */
const LEGACY_PATHS: Record<string, Tab> = {
  "/database": "admin",
  "/logs": "admin",
  "/game": "apps",
  "/plugins": "features",
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
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "chat": return "Chat";
    case "apps": return "Apps";
    case "game": return "Game";
    case "inventory": return "Inventory";
    case "features": return "Features";
    case "connectors": return "Connectors";
    case "skills": return "Skills";
    case "triggers": return "Triggers";
    case "character": return "Character";
    case "config": return "Config";
    case "admin": return "Admin";
    default: return "Milaidy";
  }
}

